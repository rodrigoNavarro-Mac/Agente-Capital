/**
 * Script separado para aplicar OCR a imágenes usando node-tesseract-ocr
 * Se ejecuta fuera del contexto de webpack usando child_process
 * Esto evita problemas de bundling y workers del navegador
 * 
 * node-tesseract-ocr es un wrapper nativo de Node.js para Tesseract OCR
 * que funciona perfectamente en entornos de servidor sin problemas de workers
 */

const tesseract = require('node-tesseract-ocr');
const fs = require('fs');
const path = require('path');
const os = require('os');
const sharp = require('sharp');

/**
 * Pre-procesa una imagen para mejorar la precisión del OCR
 * Aplica: escala de grises, normalización, sharpening y mejoras de contraste
 * Esto puede mejorar la precisión entre 30% y 60% en scans malos
 * Optimizado para documentos y presentaciones con fondos de color
 * 
 * @param {string} inputPath - Ruta a la imagen original
 * @returns {Promise<string>} Ruta a la imagen procesada (temporal)
 */
async function preprocessImage(inputPath) {
  try {
    // Crear ruta temporal para la imagen procesada
    const tempDir = path.dirname(inputPath);
    const tempFileName = `preprocessed-${Date.now()}-${path.basename(inputPath)}`;
    const outputPath = path.join(tempDir, tempFileName);
    
    console.error('🖼️ Pre-procesando imagen para mejorar OCR (grayscale, normalize, sharpen, contrast)...');
    
    // Aplicar pre-procesamiento con Sharp
    // Optimizado para presentaciones y documentos con fondos de color
    await sharp(inputPath)
      .grayscale()      // Convertir a escala de grises (mejora contraste, elimina distracciones de color)
      .normalize()      // Normalizar brillo y contraste (mejora legibilidad)
      .sharpen({        // Aumentar nitidez (mejora reconocimiento de caracteres)
        sigma: 1.5,     // Radio de sharpening (más agresivo para texto)
        flat: 1.0,      // Umbral mínimo para aplicar sharpening
        jagged: 2.0     // Umbral máximo para aplicar sharpening
      })
      .modulate({       // Ajustar brillo y saturación para mejorar contraste
        brightness: 1.1, // Aumentar brillo ligeramente (10%)
        saturation: 0    // Ya está en escala de grises, pero asegurar saturación 0
      })
      .toFile(outputPath);
    
    console.error('✅ Imagen pre-procesada exitosamente');
    return outputPath;
  } catch (error) {
    console.error('⚠️ Error en pre-procesamiento, usando imagen original:', error.message);
    // Si falla el pre-procesamiento, usar la imagen original
    return inputPath;
  }
}

/**
 * Limpia el texto extraído del OCR para mejorar su calidad
 * Elimina ruido común del OCR: espacios múltiples, saltos de línea irregulares, caracteres inválidos
 * 
 * @param {string} text - Texto crudo del OCR
 * @returns {string} Texto limpio
 */
function cleanExtractedText(text) {
  if (!text) return '';
  
  return text
    // Normalizar saltos de línea (Windows, Unix, Mac)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // Reemplazar múltiples espacios en blanco con uno solo
    .replace(/\s+/g, ' ')
    // Reemplazar múltiples saltos de línea con máximo 2
    .replace(/\n{3,}/g, '\n\n')
    // Eliminar caracteres no imprimibles excepto espacios, saltos de línea y caracteres ASCII extendidos
    // Mantener: ASCII básico (32-126) + caracteres latinos con acentos (áéíóúñ, etc.)
    .replace(/[^\x20-\x7EÁÉÍÓÚáéíóúñÑÀÈÌÒÙàèìòùÂÊÎÔÛâêîôûÃÕãõÇç]/g, '')
    // Limpiar espacios al inicio y final de cada línea
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    // Limpiar espacios al inicio y final del texto completo
    .trim();
}

/**
 * Encuentra la ruta del ejecutable de Tesseract en Windows
 * Busca en las ubicaciones comunes si no está en el PATH
 * 
 * @returns {string|null} Ruta al ejecutable de Tesseract o null si no se encuentra
 */
function findTesseractPath() {
  // Si estamos en Windows, buscar en ubicaciones comunes
  if (os.platform() === 'win32') {
    const commonPaths = [
      'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
      'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
      process.env.TESSERACT_PATH, // Variable de entorno personalizada
    ];
    
    for (const tesseractPath of commonPaths) {
      if (tesseractPath && fs.existsSync(tesseractPath)) {
        return tesseractPath;
      }
    }
  }
  
  // Si no se encuentra, retornar null (usará el PATH del sistema)
  return null;
}

/**
 * Aplica OCR a una imagen usando node-tesseract-ocr
 * 
 * @param {string} imagePath - Ruta a la imagen a procesar
 * @param {string} languages - Idiomas para OCR (ej: 'spa+eng')
 * @returns {Promise<string>} Texto extraído de la imagen
 */
async function recognizeImage(imagePath, languages = 'spa+eng') {
  let preprocessedImagePath = null;
  
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(imagePath)) {
      throw new Error(`Imagen no encontrada: ${imagePath}`);
    }

    // PASO 1: Pre-procesar la imagen para mejorar la precisión del OCR
    preprocessedImagePath = await preprocessImage(imagePath);
    const imageToProcess = preprocessedImagePath;

    // Buscar Tesseract en ubicaciones comunes de Windows si no está en PATH
    const tesseractPath = findTesseractPath();
    if (tesseractPath) {
      // Obtener el directorio donde está Tesseract (sin el nombre del ejecutable)
      const tesseractDir = path.dirname(tesseractPath);
      
      // Agregar el directorio de Tesseract al PATH del proceso
      // Esto permite que node-tesseract-ocr encuentre el ejecutable
      const currentPath = process.env.PATH || '';
      if (!currentPath.includes(tesseractDir)) {
        // En Windows, el separador es ';', en Unix es ':'
        const pathSeparator = os.platform() === 'win32' ? ';' : ':';
        process.env.PATH = `${tesseractDir}${pathSeparator}${currentPath}`;
        console.error(`📁 Tesseract encontrado en: ${tesseractPath}`);
        console.error(`📁 PATH actualizado para incluir: ${tesseractDir}`);
      }
    }

    // Configuración mejorada de Tesseract OCR para mayor precisión
    // PSM (Page Segmentation Mode):
    // 1 = Automatic page segmentation with OSD (Orientation and Script Detection)
    // 3 = Fully automatic page segmentation, but no OSD (default) - mejor para documentos normales con columnas/tablas
    // 6 = Assume a single uniform block of text - mejor para documentos simples
    // 11 = Sparse text. Find as much text as possible - mejor para documentos con poco texto
    // 12 = Sparse text with OSD - detecta orientación automáticamente
    // OEM (OCR Engine Mode):
    // 1 = Neural nets LSTM engine only - mejor precisión pero más lento
    // 3 = Default, based on what is available - balance entre velocidad y precisión
    const config = {
      lang: languages, // Idiomas: español + inglés
      oem: 1, // OCR Engine Mode: LSTM (mejor precisión)
      psm: 3, // Page Segmentation Mode: fully automatic (mejor para documentos con columnas/tablas)
      // Opciones adicionales para mejorar la precisión
      // Blacklist de caracteres especiales que no son comunes en texto impreso de oficina
      // Nota: Algunos caracteres como {}[]<> pueden causar problemas en Windows, así que usamos una lista más segura
      // Esto ayuda a Tesseract a enfocarse en caracteres de texto real
      tessedit_char_blacklist: '@#$%^&*_+=~`', // Excluir caracteres especiales poco comunes (sin {}[]<> para evitar problemas en Windows)
      // Configuraciones adicionales para mejorar reconocimiento
      tessedit_pageseg_mode: '3', // Forzar modo de segmentación automática
      // Aumentar confianza mínima (0-100, más alto = más estricto)
      // No configuramos esto muy alto para no perder texto válido
    };

    // Aplicar OCR a la imagen
    // node-tesseract-ocr ejecuta el binario de Tesseract directamente
    // No usa workers del navegador, funciona nativamente en Node.js
    
    // Mensajes informativos van a stderr (no interfieren con el JSON en stdout)
    console.error(`Procesando imagen con OCR (idiomas: ${languages}, PSM: ${config.psm}, OEM: ${config.oem})...`);
    
    // Verificar que la imagen procesada existe y tiene tamaño válido
    const stats = fs.statSync(imageToProcess);
    if (stats.size === 0) {
      throw new Error(`La imagen está vacía o corrupta: ${imageToProcess}`);
    }
    
    // Aplicar OCR con timeout para evitar que se cuelgue
    const OCR_TIMEOUT = 120000; // 2 minutos máximo por imagen
    const ocrPromise = tesseract.recognize(imageToProcess, config);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OCR timeout: la imagen tomó demasiado tiempo en procesarse')), OCR_TIMEOUT);
    });
    
    const rawText = await Promise.race([ocrPromise, timeoutPromise]);

    // PASO 2: Limpiar el texto extraído para eliminar ruido del OCR
    const cleanedText = cleanExtractedText(rawText || '');
    
    // Log informativo a stderr
    if (cleanedText.length > 0) {
      const originalLength = rawText ? rawText.length : 0;
      const cleanedLength = cleanedText.length;
      console.error(`OCR completado: ${originalLength} caracteres extraídos, ${cleanedLength} después de limpieza`);
    } else {
      console.error(`⚠️ OCR completado pero no se extrajo texto (puede ser una imagen sin texto o muy borrosa)`);
    }
    
    return cleanedText;

  } catch (error) {
    // Limpiar imagen pre-procesada temporal en caso de error
    if (preprocessedImagePath && preprocessedImagePath !== imagePath) {
      try {
        if (fs.existsSync(preprocessedImagePath)) {
          fs.unlinkSync(preprocessedImagePath);
        }
      } catch (cleanupError) {
        // Ignorar errores de limpieza
      }
    }
    
    // Mejorar mensajes de error para diagnóstico
    let errorMessage = error.message || String(error);
    let errorCode = 'UNKNOWN_ERROR';
    
    // Detectar errores comunes de Tesseract y proporcionar soluciones
    if (errorMessage.includes('Tesseract') || errorMessage.includes('tesseract')) {
      if (errorMessage.includes('not found') || errorMessage.includes('ENOENT')) {
        errorCode = 'TESSERACT_NOT_FOUND';
        errorMessage = `Tesseract OCR no está instalado o no está en el PATH. ` +
          `Instala Tesseract: https://github.com/tesseract-ocr/tesseract. ` +
          `En Windows: descarga desde https://github.com/UB-Mannheim/tesseract/wiki. ` +
          `Error original: ${errorMessage}`;
      } else if (errorMessage.includes('lang') || errorMessage.includes('language')) {
        errorCode = 'LANGUAGE_NOT_FOUND';
        errorMessage = `Idioma de OCR no disponible. Verifica que los idiomas '${languages}' estén instalados. ` +
          `En Windows: ejecuta 'tesseract --list-langs' para ver idiomas instalados. ` +
          `Error original: ${errorMessage}`;
      } else if (errorMessage.includes('timeout')) {
        errorCode = 'OCR_TIMEOUT';
        errorMessage = `OCR tomó demasiado tiempo. La imagen puede ser muy grande o compleja. ` +
          `Intenta reducir la resolución o dividir la imagen. ` +
          `Error original: ${errorMessage}`;
      }
    } else if (errorMessage.includes('vacía') || errorMessage.includes('corrupta')) {
      errorCode = 'INVALID_IMAGE';
      errorMessage = `La imagen no es válida o está corrupta. ` +
        `Verifica que el PDF se haya convertido correctamente a imagen. ` +
        `Error original: ${errorMessage}`;
    }
    
    // Log detallado del error para diagnóstico
    console.error(`❌ Error en OCR (código: ${errorCode}):`, errorMessage);
    if (error.stack) {
      console.error(`Stack trace:`, error.stack);
    }
    
    throw new Error(`Error aplicando OCR a imagen [${errorCode}]: ${errorMessage}`);
  } finally {
    // Limpiar imagen pre-procesada temporal si existe (tanto en éxito como en error)
    if (preprocessedImagePath && preprocessedImagePath !== imagePath) {
      try {
        if (fs.existsSync(preprocessedImagePath)) {
          fs.unlinkSync(preprocessedImagePath);
          console.error('🧹 Imagen temporal pre-procesada eliminada');
        }
      } catch (cleanupError) {
        console.error('⚠️ No se pudo eliminar imagen temporal:', cleanupError.message);
      }
    }
  }
}

// Ejecutar si se llama directamente desde la línea de comandos
if (require.main === module) {
  const [,, imagePathArg, languagesArg] = process.argv;
  
  if (!imagePathArg) {
    console.error('Uso: node ocr-image.js <imagePath> [languages]');
    console.error('Ejemplo: node ocr-image.js image.png spa+eng');
    process.exit(1);
  }

  // Convertir ruta a absoluta si es relativa
  const imagePath = path.isAbsolute(imagePathArg) 
    ? imagePathArg 
    : path.join(process.cwd(), imagePathArg);

  // Idiomas por defecto: español + inglés
  const languages = languagesArg || 'spa+eng';

  // Aplicar OCR
  recognizeImage(imagePath, languages)
    .then((text) => {
      // Solo el JSON va a stdout (para que pueda ser parseado por el proceso padre)
      // Los mensajes informativos van a stderr
      console.log(JSON.stringify({ 
        success: true, 
        text: text,
        length: text.length 
      }));
    })
    .catch((error) => {
      // Los errores también van a stdout como JSON para que puedan ser parseados
      console.log(JSON.stringify({ 
        success: false, 
        error: error.message 
      }));
      process.exit(1);
    });
}

module.exports = { recognizeImage };

