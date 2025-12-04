/**
 * =====================================================
 * PDFJS CONFIGURATION
 * =====================================================
 * Configuración para pdfjs-dist
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Configurar el worker de pdfjs (necesario para renderizado)
// En producción, deberías servir el worker desde CDN o assets públicos
if (typeof window === 'undefined') {
  // Servidor (Node.js)
  pdfjs.GlobalWorkerOptions.workerSrc = require('pdfjs-dist/legacy/build/pdf.worker.entry.js');
}

export { pdfjs };

