# ✅ OCR Implementado - Solución con Scripts Separados

## 📋 Solución Implementada

El OCR para PDFs escaneados está **funcionando** usando scripts separados que se ejecutan fuera del contexto de webpack usando `child_process`. Esto evita problemas de bundling y workers del navegador.

### ¿Por Qué Esta Solución?

1. **`pdfjs-dist`** no es compatible con el bundling de Next.js/Webpack
2. **`tesseract.js`** usa Web Workers del navegador que no funcionan en Node.js
3. **Solución:** Ejecutar ambos procesos (conversión y OCR) en scripts separados fuera de webpack

---

## 🔧 Cómo Funciona

### Flujo de Procesamiento

```
PDF Escaneado
      ↓
📄 Intento rápido: pdf-parse (falla - poco texto)
      ↓
⚠️ Detecta que necesita OCR
      ↓
📦 Ejecuta script separado (child_process)
      ↓
📸 Script convierte PDF → Imágenes (fuera de webpack)
      ↓
🔤 Script aplica OCR a cada imagen (node-tesseract-ocr)
      ↓
✅ Texto extraído
```

### Componentes

1. **`scripts/pdf-to-images.js`**
   - Script Node.js independiente
   - Usa `pdfjs-dist` y `canvas` sin problemas de webpack
   - Convierte PDF a imágenes PNG
   - Se ejecuta con `child_process.exec()`

2. **`scripts/ocr-image.js`**
   - Script Node.js independiente
   - Usa `node-tesseract-ocr` (wrapper nativo de Node.js)
   - Aplica OCR a imágenes individuales
   - No tiene problemas con workers del navegador
   - Se ejecuta con `child_process.exec()`

3. **`src/lib/ocr.ts`**
   - Función `extractTextFromPDFWithOCR()`
   - Ejecuta ambos scripts separados
   - Coordina el flujo: PDF → Imágenes → OCR
   - Limpia archivos temporales

---

## 📝 Uso

El OCR se activa **automáticamente** cuando:
1. Un PDF se sube al sistema
2. `pdf-parse` extrae poco o ningún texto
3. El sistema detecta que necesita OCR

**No requiere configuración adicional** - funciona automáticamente.

---

## 🎯 Ventajas de Esta Solución

| Ventaja | Descripción |
|---------|-------------|
| ✅ **Funciona** | Evita problemas de webpack completamente |
| ✅ **Aislado** | El script corre en proceso separado |
| ✅ **Estable** | No afecta el servidor principal |
| ✅ **Mantenible** | Código claro y separado |

---

## ⚙️ Configuración

### Requisitos del Sistema

**IMPORTANTE:** Necesitas tener Tesseract OCR instalado en tu sistema:

- **Windows:** Descargar e instalar desde [GitHub Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
- **macOS:** `brew install tesseract`
- **Linux (Ubuntu/Debian):** `sudo apt-get install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng`

### Requisitos de Node.js

- Node.js instalado (para ejecutar los scripts)
- `pdfjs-dist` instalado: `npm install pdfjs-dist`
- `canvas` instalado: `npm install canvas`
- `node-tesseract-ocr` instalado: `npm install node-tesseract-ocr`

### Archivos Necesarios

- ✅ `scripts/pdf-to-images.js` - Script de conversión PDF → Imágenes
- ✅ `scripts/ocr-image.js` - Script de OCR para imágenes
- ✅ `src/lib/ocr.ts` - Función principal de OCR
- ✅ `next.config.js` - Configuración de webpack (ya configurado)

---

## 🐛 Solución de Problemas

### Error: "Script de conversión no encontrado" o "Script de OCR no encontrado"

**Solución:** Verifica que ambos scripts existen:
- `scripts/pdf-to-images.js`
- `scripts/ocr-image.js`

### Error: "Error en conversión"

**Posibles causas:**
- `pdfjs-dist` no está instalado
- `canvas` no está instalado
- El PDF está corrupto

**Solución:**
```bash
npm install pdfjs-dist canvas
```

### Error: "Tesseract not found" o "Error aplicando OCR"

**Causa:** Tesseract OCR no está instalado en el sistema

**Solución:**
- **Windows:** Instalar desde [GitHub Tesseract](https://github.com/UB-Mannheim/tesseract/wiki)
- **macOS:** `brew install tesseract`
- **Linux:** `sudo apt-get install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng`

**Verificar instalación:**
```bash
tesseract --version
```

### Error: "Timeout"

**Causa:** PDF muy grande o muchas páginas

**Solución:** El sistema tiene un buffer de 10MB. Para PDFs más grandes, ajusta el `maxBuffer` en `ocr.ts`.

---

## 📊 Rendimiento

| Tipo de PDF | Tiempo Estimado |
|-------------|-----------------|
| 1 página escaneada | ~30-45 segundos |
| 5 páginas escaneadas | ~2-3 minutos |
| 10 páginas escaneadas | ~5-7 minutos |

**Nota:** El tiempo depende de:
- Resolución del escaneo
- Complejidad del texto
- Tamaño de las imágenes

---

## 🔄 Mejoras Futuras

### Posibles Optimizaciones

1. **Caché de conversiones** - Guardar imágenes convertidas temporalmente
2. **Procesamiento paralelo** - Procesar múltiples páginas simultáneamente
3. **Worker pool** - Usar workers para mejor rendimiento
4. **Servicio externo** - Migrar a servicio OCR cloud para mejor calidad

---

## 📚 Referencias

- [pdfjs-dist Documentation](https://mozilla.github.io/pdf.js/)
- [node-tesseract-ocr GitHub](https://github.com/zapolnoch/node-tesseract-ocr)
- [Tesseract OCR Official](https://github.com/tesseract-ocr/tesseract)
- [Node.js child_process](https://nodejs.org/api/child_process.html)

---

## 🔄 Cambios Recientes

### Migración de tesseract.js a node-tesseract-ocr

**Fecha:** Enero 2025

**Motivo:** `tesseract.js` usa Web Workers del navegador que no funcionan en Node.js/Next.js API routes, causando errores como `addEventListener is not a function`.

**Solución:** Migración a `node-tesseract-ocr`, un wrapper nativo de Node.js que:
- ✅ Funciona perfectamente en entornos de servidor
- ✅ No tiene problemas con workers del navegador
- ✅ Es más rápido (usa el binario nativo de Tesseract)
- ✅ Más estable en producción

---

**Última actualización:** Enero 2025
**Estado:** ✅ Funcionando
**Método:** Scripts separados con child_process usando node-tesseract-ocr

