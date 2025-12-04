/**
 * Script separado para convertir PDF a imágenes
 * Se ejecuta fuera del contexto de webpack usando child_process
 * Esto evita problemas de bundling con pdfjs-dist
 */

const fs = require('fs');
const path = require('path');

// Cargar pdfjs-dist y canvas (fuera de webpack)
// Usar versión 3.x que funciona mejor con node-canvas
// En Node.js con CommonJS, usar .js en lugar de .mjs
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
const { createCanvas } = require('canvas');

// Configurar el worker de pdfjs (necesario para renderizado en Node.js)
// El worker maneja tareas pesadas de procesamiento de PDF en segundo plano
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.js');
}

async function convertPDFToImages(pdfPath, outputDir) {
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Archivo PDF no encontrado: ${pdfPath}`);
    }
    
    // Asegurar que el directorio de salida existe
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Leer el PDF como Buffer
    const pdfBuffer = fs.readFileSync(pdfPath);
    
    // Convertir Buffer a Uint8Array (pdfjs-dist requiere Uint8Array, no Buffer)
    const pdfData = new Uint8Array(pdfBuffer);
    
    // Cargar el documento
    const loadingTask = pdfjsLib.getDocument({
      data: pdfData,
      useSystemFonts: true,
    });
    
    const pdfDocument = await loadingTask.promise;
    const numPages = pdfDocument.numPages;
    
    // Mensajes informativos van a stderr (no interfieren con el JSON en stdout)
    console.error(`Procesando ${numPages} páginas...`);
    
    const imagePaths = [];
    
    // Procesar cada página
    // Aumentar scale a 3.5 para mejor calidad de OCR (antes era 2.0)
    // Scale más alto = mejor resolución = mejor reconocimiento de texto
    const SCALE = 3.5;
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const viewport = page.getViewport({ scale: SCALE });
      
      // Crear canvas con node-canvas
      const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      
      // Configurar el contexto para renderizado de alta calidad
      // Usar imageSmoothingEnabled para mejor calidad
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      // Fondo blanco para mejor contraste
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      // Renderizar usando el método compatible con node-canvas
      // En pdfjs-dist v3.x, el método render() funciona directamente
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };
      
      // Renderizar la página
      await page.render(renderContext).promise;
      
      // Preprocesar imagen para mejorar OCR
      // Aplicar mejoras de contraste y nitidez directamente en el canvas
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Aplicar mejoras de contraste (aumentar diferencia entre claro/oscuro)
      // Esto ayuda a OCR a distinguir mejor el texto del fondo
      for (let i = 0; i < data.length; i += 4) {
        // Obtener valores RGB
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Convertir a escala de grises
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        // Aplicar contraste mejorado (umbralización adaptativa simple)
        // Si es más oscuro que 128, hacerlo más oscuro (texto)
        // Si es más claro que 128, hacerlo más claro (fondo)
        const contrast = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30);
        
        // Aplicar a todos los canales RGB
        data[i] = contrast;     // R
        data[i + 1] = contrast; // G
        data[i + 2] = contrast; // B
        // Alpha se mantiene igual (data[i + 3])
      }
      
      // Aplicar los cambios de vuelta al canvas
      context.putImageData(imageData, 0, 0);
      
      // Guardar imagen con alta calidad
      const imagePath = path.join(outputDir, `page-${pageNum}.png`);
      // Usar compresión mínima para máxima calidad
      const buffer = canvas.toBuffer('image/png', { compressionLevel: 1 });
      fs.writeFileSync(imagePath, buffer);
      
      imagePaths.push(imagePath);
      // Mensajes informativos van a stderr (no interfieren con el JSON en stdout)
      console.error(`Página ${pageNum}/${numPages} convertida (resolución: ${canvas.width}x${canvas.height})`);
    }
    
    return imagePaths;
  } catch (error) {
    throw new Error(`Error convirtiendo PDF a imágenes: ${error.message}`);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  const [,, pdfPathArg, outputDirArg] = process.argv;
  
  if (!pdfPathArg || !outputDirArg) {
    console.error('Uso: node pdf-to-images.js <pdfPath> <outputDir>');
    process.exit(1);
  }
  
  // Convertir rutas a absolutas si son relativas
  const pdfPath = path.isAbsolute(pdfPathArg) 
    ? pdfPathArg 
    : path.join(process.cwd(), pdfPathArg);
  const outputDir = path.isAbsolute(outputDirArg)
    ? outputDirArg
    : path.join(process.cwd(), outputDirArg);
  
  // Asegurar que el directorio de salida existe
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  convertPDFToImages(pdfPath, outputDir)
    .then((imagePaths) => {
      // Solo el JSON va a stdout (para que pueda ser parseado por el proceso padre)
      // Los mensajes informativos ya fueron enviados a stderr
      console.log(JSON.stringify({ success: true, images: imagePaths }));
    })
    .catch((error) => {
      // Los errores también van a stdout como JSON para que puedan ser parseados
      console.log(JSON.stringify({ success: false, error: error.message }));
      process.exit(1);
    });
}

module.exports = { convertPDFToImages };

