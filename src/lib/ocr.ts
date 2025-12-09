/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - OCR MODULE
 * =====================================================
 * Módulo para extraer texto de PDFs escaneados usando OCR.
 * Utiliza node-tesseract-ocr (wrapper nativo de Node.js) para reconocimiento óptico de caracteres.
 * 
 * NOTA: El OCR se ejecuta en un script separado (scripts/ocr-image.js) usando child_process
 * para evitar problemas de webpack bundling y workers del navegador.
 */

import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error - pdf-parse no tiene tipos
import pdfParse from 'pdf-parse';

// NOTA: pdfjs-dist y canvas se importan dinámicamente solo cuando se necesitan
// para evitar problemas con webpack bundling

// =====================================================
// CONFIGURACIÓN
// =====================================================

// Idiomas soportados: 'spa' (español), 'eng' (inglés)
const OCR_LANGUAGES = 'spa+eng'; // Detecta ambos idiomas

/**
 * Obtiene el directorio temporal correcto según el entorno
 * En producción/serverless (Vercel, AWS Lambda, etc.) usa /tmp
 * En desarrollo local usa ./tmp
 * 
 * Esta función se ejecuta dinámicamente para asegurar detección correcta
 */
function getTempDir(): string {
  // Si hay una variable de entorno específica, usarla (tiene prioridad)
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR;
  }
  
  // Detectar si estamos en un entorno serverless
  // Verificar múltiples indicadores de entornos serverless
  const isServerless = !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.AWS_EXECUTION_ENV ||
    process.env.NEXT_RUNTIME === 'nodejs' ||
    // En Vercel, el directorio de trabajo es /var/task
    process.cwd().startsWith('/var/task') ||
    // Si estamos en producción y no estamos en Windows/Mac típico
    (process.env.NODE_ENV === 'production' && !process.platform.startsWith('win') && !process.cwd().includes('Users'))
  );
  
  // En producción/serverless, usar /tmp (único directorio escribible)
  // En desarrollo, usar ./tmp relativo al proyecto
  return isServerless ? '/tmp' : './tmp';
}

/**
 * Función auxiliar para aplicar OCR a una imagen usando el script separado
 * Esto evita problemas con webpack y workers del navegador
 * 
 * @param imagePath - Ruta a la imagen a procesar
 * @returns Texto extraído de la imagen
 */
async function recognizeImageWithScript(imagePath: string): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  // Ruta al script de OCR
  const scriptPath = path.join(process.cwd(), 'scripts', 'ocr-image.js');
  
  // Verificar que el script existe
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script de OCR no encontrado: ${scriptPath}`);
  }
  
  // Ejecutar el script de OCR
  const { stdout, stderr } = await execAsync(
    `node "${scriptPath}" "${imagePath}" "${OCR_LANGUAGES}"`,
    { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer
  );
  
  // Filtrar warnings y extraer solo el JSON
  const lines = stdout.split('\n');
  let jsonLine = '';
  
  // Buscar desde el final hacia atrás para encontrar el JSON
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{') && line.endsWith('}')) {
      jsonLine = line;
      break;
    }
  }
  
  // Si no se encontró en una sola línea, intentar con regex
  if (!jsonLine) {
    const jsonMatch = stdout.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      jsonLine = jsonMatch[0];
    }
  }
  
  if (!jsonLine) {
    throw new Error(
      `No se encontró JSON válido en la salida del script de OCR.\n` +
      `Stdout: ${stdout.substring(0, 500)}\n` +
      `Stderr: ${stderr.substring(0, 500)}`
    );
  }
  
  // Parsear el JSON extraído
  let result;
  try {
    result = JSON.parse(jsonLine);
  } catch (parseError) {
    throw new Error(
      `Error parseando JSON del script de OCR: ${parseError}\n` +
      `JSON encontrado: ${jsonLine.substring(0, 200)}\n` +
      `Stdout completo: ${stdout.substring(0, 500)}`
    );
  }
  
  if (!result.success) {
    const errorMsg = result.error || 'Error desconocido en OCR';
    
    // Agregar información adicional según el tipo de error
    if (errorMsg.includes('Tesseract') || errorMsg.includes('tesseract') || errorMsg.includes('TESSERACT_NOT_FOUND')) {
      throw new Error(
        `${errorMsg}\n` +
        `💡 Verifica que Tesseract OCR esté instalado: tesseract --version\n` +
        `💡 En Windows: descarga desde https://github.com/UB-Mannheim/tesseract/wiki\n` +
        `💡 Asegúrate de que los idiomas español (spa) e inglés (eng) estén instalados.`
      );
    } else if (errorMsg.includes('LANGUAGE_NOT_FOUND') || errorMsg.includes('lang')) {
      throw new Error(
        `${errorMsg}\n` +
        `💡 Verifica que los idiomas '${OCR_LANGUAGES}' estén instalados.\n` +
        `💡 Ejecuta: tesseract --list-langs para ver idiomas disponibles.\n` +
        `💡 En Windows: instala los paquetes de idioma durante la instalación de Tesseract.`
      );
    } else if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      throw new Error(
        `${errorMsg}\n` +
        `💡 La imagen es muy grande o compleja para procesar.\n` +
        `💡 Intenta reducir la resolución del PDF o dividir el documento.`
      );
    } else if (errorMsg.includes('vacía') || errorMsg.includes('corrupta') || errorMsg.includes('INVALID_IMAGE')) {
      throw new Error(
        `${errorMsg}\n` +
        `💡 El PDF puede no haberse convertido correctamente a imagen.\n` +
        `💡 Verifica que el PDF no esté protegido, corrupto o encriptado.`
      );
    }
    
    throw new Error(errorMsg);
  }
  
  const extractedText = result.text || '';
  
  // Log para diagnóstico (solo si el texto es muy corto)
  if (extractedText.length > 0 && extractedText.length < 50) {
    console.log(`   ⚠️ Texto extraído muy corto (${extractedText.length} caracteres): "${extractedText.substring(0, 50)}"`);
  }
  
  return extractedText;
}

// =====================================================
// FUNCIONES PRINCIPALES
// =====================================================

/**
 * Extrae texto de un PDF usando pdf-parse (método rápido)
 * Para PDFs digitales con texto seleccionable
 * 
 * @param buffer - Buffer del archivo PDF
 * @returns Texto extraído
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch (error) {
    console.error('❌ Error extrayendo texto desde pdf-parse:', error);
    throw error;
  }
}

/**
 * Extrae texto de un PDF usando OCR (método lento pero funciona con imágenes)
 * Convierte cada página a imagen y aplica OCR
 * Para PDFs escaneados sin texto seleccionable
 * 
 * @param pdfPath - Ruta al archivo PDF
 * @returns Texto extraído de todas las páginas
 */
export async function extractTextFromPDFWithOCR(pdfPath: string): Promise<string> {
  console.log('🔍 Iniciando OCR para PDF escaneado...');
  
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Archivo no encontrado: ${pdfPath}`);
    }

    // Usar script separado con child_process para evitar problemas de webpack
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Crear directorio temporal para imágenes
    // Usar getTempDir() para obtener el directorio correcto según el entorno
    const baseTempDir = getTempDir();
    const tempDir = path.join(baseTempDir, `ocr-${Date.now()}`);
    
    try {
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    } catch (error) {
      // Si falla la creación del directorio, lanzar error más descriptivo
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(
        `No se pudo crear el directorio temporal ${tempDir}: ${errorMessage}. ` +
        `En entornos serverless, asegúrate de usar /tmp como directorio temporal.`
      );
    }

    try {
      // PASO 1: Convertir PDF a imágenes usando script separado
      console.log('📸 Convirtiendo PDF a imágenes (usando script separado)...');
      const scriptPath = path.join(process.cwd(), 'scripts', 'pdf-to-images.js');
      
      // Verificar que el script existe
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Script de conversión no encontrado: ${scriptPath}`);
      }

      const { stdout, stderr } = await execAsync(
        `node "${scriptPath}" "${pdfPath}" "${tempDir}"`,
        { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer para PDFs grandes
      );

      // 🛑 FILTRA WARNINGS Y SOLO EXTRAE JSON
      // Los warnings de pdfjs-dist pueden aparecer en stdout antes del JSON
      // Buscar la última ocurrencia de JSON en la salida (más robusto)
      const lines = stdout.split('\n');
      let jsonLine = '';
      
      // Buscar desde el final hacia atrás para encontrar el JSON
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith('{') && line.endsWith('}')) {
          jsonLine = line;
          break;
        }
      }
      
      // Si no se encontró en una sola línea, intentar con regex
      if (!jsonLine) {
        const jsonMatch = stdout.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          jsonLine = jsonMatch[0];
        }
      }
      
      if (!jsonLine) {
        throw new Error(
          `No se encontró JSON válido en la salida del script.\n` +
          `Stdout: ${stdout.substring(0, 500)}\n` +
          `Stderr: ${stderr.substring(0, 500)}`
        );
      }

      // Parsear el JSON extraído
      let result;
      try {
        result = JSON.parse(jsonLine);
      } catch (parseError) {
        throw new Error(
          `Error parseando JSON del script: ${parseError}\n` +
          `JSON encontrado: ${jsonLine.substring(0, 200)}\n` +
          `Stdout completo: ${stdout.substring(0, 500)}`
        );
      }

      if (!result.success) {
        throw new Error(result.error || 'Error desconocido en conversión');
      }

      const imagePaths = result.images || [];
      if (!imagePaths || imagePaths.length === 0) {
        throw new Error('El script no generó imágenes válidas');
      }

      console.log(`✅ PDF convertido a ${imagePaths.length} imágenes`);

      // PASO 2: Aplicar OCR a cada imagen usando script separado
      let fullText = '';
      let pagesProcessed = 0;
      let pagesWithText = 0;
      
      for (let i = 0; i < imagePaths.length; i++) {
        const imagePath = imagePaths[i];
        const pageNum = i + 1;
        
        console.log(`🔤 Procesando página ${pageNum}/${imagePaths.length} con OCR...`);
        console.log(`   📁 Imagen: ${imagePath}`);
        
        try {
          // Verificar que la imagen existe antes de procesarla
          if (!fs.existsSync(imagePath)) {
            throw new Error(`Imagen no encontrada: ${imagePath}`);
          }
          
          // Verificar tamaño del archivo
          const stats = fs.statSync(imagePath);
          if (stats.size === 0) {
            throw new Error(`Imagen vacía o corrupta: ${imagePath}`);
          }
          
          // Aplicar OCR a la imagen usando el script separado
          // Esto evita problemas con webpack y workers del navegador
          const pageText = await recognizeImageWithScript(imagePath);
          pagesProcessed++;
          
          if (pageText && pageText.length > 0) {
            fullText += `\n\n--- Página ${pageNum} ---\n\n${pageText}`;
            pagesWithText++;
            console.log(`   ✅ Página ${pageNum}: ${pageText.length} caracteres extraídos`);
            // Mostrar una muestra del texto extraído para diagnóstico
            const preview = pageText.substring(0, 100).replace(/\n/g, ' ');
            console.log(`   📝 Vista previa: "${preview}..."`);
          } else {
            console.log(`   ⚠️ Página ${pageNum}: No se extrajo texto (texto vacío o null)`);
            // Si no se extrajo texto, puede ser un problema de calidad de imagen
            console.log(`   💡 La imagen puede ser muy borrosa o no contener texto legible`);
          }
        } catch (pageError) {
          pagesProcessed++;
          const errorMsg = pageError instanceof Error ? pageError.message : String(pageError);
          console.error(`❌ Error procesando página ${pageNum}:`, errorMsg);
          
          // Mostrar más detalles del error para diagnóstico
          if (errorMsg.includes('Tesseract') || errorMsg.includes('tesseract') || errorMsg.includes('TESSERACT_NOT_FOUND')) {
            console.error(`   💡 Sugerencia: Verifica que Tesseract OCR esté instalado en el sistema`);
            console.error(`   💡 Ejecuta: tesseract --version`);
            console.error(`   💡 En Windows: descarga desde https://github.com/UB-Mannheim/tesseract/wiki`);
          } else if (errorMsg.includes('LANGUAGE_NOT_FOUND') || errorMsg.includes('lang')) {
            console.error(`   💡 Sugerencia: Verifica que los idiomas español (spa) e inglés (eng) estén instalados`);
            console.error(`   💡 Ejecuta: tesseract --list-langs`);
          } else if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
            console.error(`   💡 Sugerencia: La imagen es muy grande o compleja. Intenta reducir la resolución.`);
          } else if (errorMsg.includes('vacía') || errorMsg.includes('corrupta') || errorMsg.includes('INVALID_IMAGE')) {
            console.error(`   💡 Sugerencia: El PDF puede no haberse convertido correctamente a imagen.`);
            console.error(`   💡 Verifica que el PDF no esté protegido o corrupto.`);
          }
          
          // Continuar con la siguiente página en lugar de fallar completamente
          // Esto permite procesar documentos con algunas páginas problemáticas
        }
      }
      
      // Log de resumen
      console.log(`📊 Resumen OCR: ${pagesWithText}/${pagesProcessed} páginas con texto extraído`);

      // Limpiar imágenes temporales
      try {
        for (const imagePath of imagePaths) {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      } catch (cleanupError) {
        console.warn('⚠️ No se pudieron limpiar archivos temporales:', cleanupError);
      }

      const finalText = fullText.trim();
      
      // Validar que se extrajo suficiente texto
      if (!finalText || finalText.length < 20) {
        // Proporcionar información más detallada sobre el error
        const errorDetails = [
          `OCR no pudo extraer suficiente texto del PDF escaneado.`,
          `Texto extraído: ${finalText.length} caracteres (mínimo requerido: 20)`,
          `Páginas procesadas: ${pagesProcessed}/${imagePaths.length}`,
          `Páginas con texto: ${pagesWithText}`,
        ];
        
        // Si no se procesó ninguna página, puede ser un problema de instalación
        if (pagesProcessed === 0) {
          errorDetails.push(
            `\n💡 Posible causa: Tesseract OCR no está instalado o no está en el PATH.`,
            `   Verifica la instalación ejecutando: tesseract --version`,
            `   Instrucciones: https://github.com/tesseract-ocr/tesseract`
          );
        } else if (pagesWithText === 0) {
          errorDetails.push(
            `\n💡 Posible causa: El documento puede estar muy borroso, tener baja resolución,`,
            `   o los idiomas configurados (${OCR_LANGUAGES}) no coinciden con el contenido.`
          );
        }
        
        throw new Error(errorDetails.join('\n'));
      }
      
      console.log(`✅ OCR completado: ${finalText.length} caracteres totales`);
      return finalText;
      
    } catch (execError) {
      // Limpiar en caso de error
      try {
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          for (const file of files) {
            fs.unlinkSync(path.join(tempDir, file));
          }
          fs.rmdirSync(tempDir);
        }
      } catch {
        // Ignorar errores de limpieza
      }
      throw execError;
    }
    
  } catch (error) {
    console.error('❌ Error en OCR:', error);
    throw error;
  }
}

/**
 * Extrae texto de una sola imagen usando OCR
 * Usa el script separado para evitar problemas con webpack
 * 
 * @param imagePath - Ruta a la imagen (PNG, JPG, etc.)
 * @returns Texto extraído
 */
export async function extractTextFromImage(imagePath: string): Promise<string> {
  try {
    console.log(`🔤 Aplicando OCR a imagen: ${path.basename(imagePath)}`);
    
    // Usar el script separado para aplicar OCR
    // Esto evita problemas con webpack y workers del navegador
    const text = await recognizeImageWithScript(imagePath);
    
    console.log(`✅ OCR completado: ${text.length} caracteres extraídos`);
    
    return text;
  } catch (error) {
    console.error('❌ Error en OCR de imagen:', error);
    throw error;
  }
}

/**
 * Detecta si un texto extraído está vacío o es insuficiente
 * 
 * @param text - Texto a verificar
 * @param minLength - Longitud mínima para considerar el texto válido
 * @returns true si el texto es insuficiente (necesita OCR)
 */
export function needsOCR(text: string, minLength: number = 100): boolean {
  const cleanText = text.trim();
  
  // Si está vacío o es muy corto, probablemente es un PDF escaneado
  if (cleanText.length < minLength) {
    return true;
  }
  
  // Detectar si solo tiene caracteres extraños o símbolos
  const alphanumericCount = (cleanText.match(/[a-zA-Z0-9]/g) || []).length;
  const ratio = alphanumericCount / cleanText.length;
  
  // Si menos del 50% son caracteres alfanuméricos, probablemente es basura
  if (ratio < 0.5) {
    return true;
  }
  
  return false;
}

/**
 * Extrae texto de un PDF intentando primero el método estándar
 * y usando OCR como fallback si es necesario
 * 
 * @param pdfPath - Ruta al archivo PDF
 * @param standardExtractor - Función para extracción estándar (pdf-parse)
 * @returns Texto extraído
 */
export async function extractTextWithOCRFallback(
  pdfPath: string,
  standardExtractor: (path: string) => Promise<string>
): Promise<{ text: string; usedOCR: boolean }> {
  try {
    // Intentar extracción estándar primero
    console.log('📄 Intentando extracción estándar de PDF...');
    const standardText = await standardExtractor(pdfPath);
    
    // Verificar si necesita OCR
    if (needsOCR(standardText)) {
      console.log('⚠️ Texto insuficiente detectado, cambiando a OCR...');
      const ocrText = await extractTextFromPDFWithOCR(pdfPath);
      return { text: ocrText, usedOCR: true };
    }
    
    console.log('✅ Texto extraído exitosamente con método estándar');
    return { text: standardText, usedOCR: false };
    
  } catch (error) {
    console.error('❌ Error en extracción con fallback:', error);
    throw error;
  }
}

export default {
  extractTextFromPDF,
  extractTextFromPDFWithOCR,
  extractTextFromImage,
  needsOCR,
  extractTextWithOCRFallback,
};

