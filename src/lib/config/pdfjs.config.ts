/**
 * =====================================================
 * PDFJS CONFIGURATION
 * =====================================================
 * Configuración para pdfjs-dist
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

// Configurar el worker de pdfjs (necesario para renderizado)
// En producción, deberías servir el worker desde CDN o assets públicos
if (typeof window === 'undefined') {
  // Servidor (Node.js)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry.js');
}

export { pdfjs };

