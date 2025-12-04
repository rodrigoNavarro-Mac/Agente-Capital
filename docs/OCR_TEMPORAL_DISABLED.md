# ✅ OCR Implementado con Script Separado

## 📋 Situación Actual

El OCR para PDFs escaneados está **funcionando** usando un script separado que se ejecuta fuera del contexto de webpack, evitando problemas de bundling.

### El Problema

La librería `pdfjs-dist` (necesaria para convertir PDFs a imágenes para OCR) no es compatible con el sistema de bundling de Next.js. Aunque intentamos múltiples soluciones (importación dinámica, externalización, require dinámico), webpack sigue intentando procesar el módulo y causa errores.

**Error específico:**
```
TypeError: Object.defineProperty called on non-object
at pdfjs-dist/legacy/build/pdf.mjs
```

---

## ✅ Solución Temporal para Usuarios

### Opción 1: Convertir PDF Escaneado a PDF con Texto

**Usando Adobe Acrobat:**
1. Abre el PDF escaneado en Adobe Acrobat
2. Ve a `Herramientas` → `Editar PDF`
3. Click en `Reconocer texto` → `En este archivo`
4. Guarda el PDF (ahora tendrá texto seleccionable)
5. Sube el PDF convertido

**Usando herramientas online:**
- [iLovePDF - OCR](https://www.ilovepdf.com/es/ocr-pdf)
- [SmallPDF - OCR](https://smallpdf.com/es/ocr-pdf)
- [PDF24 - OCR](https://tools.pdf24.org/es/ocr-pdf)

### Opción 2: Re-escaneear con OCR

Si tienes acceso al scanner original:
1. Re-escanea el documento
2. Asegúrate de que el scanner tenga **OCR habilitado**
3. Guarda como PDF con texto (no solo imagen)

---

## 🔧 Soluciones Técnicas Futuras

### Opción 1: Servicio OCR Externo (Recomendado)

**Ventajas:**
- ✅ No requiere librerías problemáticas
- ✅ Mejor calidad de OCR
- ✅ No carga el servidor
- ✅ Escalable

**Servicios disponibles:**
- **Google Cloud Vision API** - Muy preciso, pago por uso
- **AWS Textract** - Excelente para documentos, pago por uso
- **Azure Computer Vision** - Buena integración, pago por uso
- **Tesseract Cloud** - API REST, más económico

**Implementación sugerida:**
```typescript
// src/lib/ocr-cloud.ts
export async function extractTextFromPDFWithCloudOCR(pdfPath: string): Promise<string> {
  // 1. Convertir PDF a imágenes (usando librería simple)
  // 2. Enviar imágenes a servicio OCR externo
  // 3. Recibir texto extraído
  // 4. Retornar texto
}
```

### Opción 2: Worker Separado

**Ventajas:**
- ✅ Aísla el procesamiento pesado
- ✅ No afecta el servidor principal
- ✅ Puede usar librerías nativas sin problemas

**Implementación:**
- Crear un worker Node.js separado
- Comunicación vía API REST o cola de mensajes
- El worker puede usar `pdfjs-dist` sin problemas de webpack

### Opción 3: Librería Alternativa

**Opciones a investigar:**
- `pdf-poppler` - Requiere binario externo (poppler)
- `pdf2pic` - Más simple, pero también puede tener problemas
- `sharp` + `pdf-lib` - Combinación diferente

### Opción 4: Docker Container

**Ventajas:**
- ✅ Aísla completamente el entorno
- ✅ Puede instalar dependencias nativas
- ✅ No afecta el servidor principal

**Implementación:**
- Container Docker con Node.js + pdfjs-dist + canvas
- API REST simple para procesar PDFs
- Comunicación desde Next.js vía HTTP

---

## 📊 Comparación de Opciones

| Opción | Complejidad | Costo | Calidad OCR | Tiempo de Implementación |
|--------|-------------|-------|-------------|--------------------------|
| **Servicio Cloud** | Media | $ | ⭐⭐⭐⭐⭐ | 2-3 días |
| **Worker Separado** | Alta | Gratis | ⭐⭐⭐⭐ | 3-5 días |
| **Librería Alternativa** | Media | Gratis | ⭐⭐⭐ | 1-2 días |
| **Docker Container** | Alta | Gratis | ⭐⭐⭐⭐ | 4-6 días |

---

## 🎯 Recomendación

**Para producción inmediata:** Usar **Servicio OCR Externo** (Google Cloud Vision o AWS Textract)
- Implementación rápida
- Mejor calidad
- Escalable
- No requiere cambios en infraestructura

**Para solución a largo plazo:** Implementar **Worker Separado**
- Control total
- Sin costos externos
- Mejor para privacidad de datos

---

## 📝 Código Actual

El código de OCR está comentado en `src/lib/ocr.ts` y se puede restaurar cuando se implemente una solución alternativa.

**Función deshabilitada:**
- `extractTextFromPDFWithOCR()` - Lanza error explicativo

**Funciones que siguen funcionando:**
- ✅ `extractTextFromPDF()` - Extracción rápida con pdf-parse
- ✅ `extractTextFromImage()` - OCR de imágenes individuales
- ✅ `needsOCR()` - Detección de necesidad de OCR

---

## 🔄 Próximos Pasos

1. **Corto plazo:** Documentar alternativas para usuarios
2. **Mediano plazo:** Evaluar servicios OCR externos
3. **Largo plazo:** Implementar solución permanente (worker o servicio)

---

## 📚 Referencias

- [Next.js Webpack Issues with Native Modules](https://nextjs.org/docs/api-reference/next.config.js/custom-webpack-config)
- [pdfjs-dist GitHub Issues](https://github.com/mozilla/pdf.js/issues)
- [Google Cloud Vision API](https://cloud.google.com/vision/docs/ocr)
- [AWS Textract](https://aws.amazon.com/textract/)

---

**Última actualización:** Diciembre 2024
**Estado:** OCR deshabilitado temporalmente
**Prioridad:** Media (solo afecta PDFs escaneados)

