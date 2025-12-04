# 🔍 Guía de OCR para PDFs Escaneados

## ¿Qué es OCR?

**OCR (Optical Character Recognition)** = Reconocimiento Óptico de Caracteres

Es una tecnología que "lee" texto desde imágenes, permitiendo extraer texto de documentos escaneados.

---

## 🎯 ¿Cuándo se Usa OCR?

El sistema usa OCR **automáticamente** cuando detecta que un PDF tiene poco o ningún texto extraíble.

### Ejemplos de PDFs que Necesitan OCR:

- ✅ Documentos escaneados con un scanner
- ✅ Fotos de documentos tomadas con celular
- ✅ PDFs creados desde imágenes
- ✅ Documentos antiguos digitalizados

### PDFs que NO Necesitan OCR:

- ❌ PDFs creados desde Word, Excel, etc.
- ❌ PDFs generados por software
- ❌ Documentos con texto seleccionable

---

## 🔧 Cómo Funciona el Sistema

```
┌─────────────┐
│   PDF       │
│   Subido    │
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Intento Estándar │ ← pdf-parse
│ (Rápido: 1-2s)   │
└──────┬───────────┘
       │
       ▼
   ¿Hay texto?
       │
  ┌────┴────┐
  │         │
 SÍ        NO
  │         │
  │         ▼
  │   ┌─────────────┐
  │   │  OCR Mode   │ ← Tesseract.js
  │   │ (Lento:30s+)│
  │   └─────┬───────┘
  │         │
  └────┬────┘
       │
       ▼
  ┌──────────┐
  │  Texto   │
  │Extraído  │
  └──────────┘
```

---

## 📊 Diferencias de Rendimiento

| Método | Velocidad | Precisión | Uso |
|--------|-----------|-----------|-----|
| **pdf-parse** | ⚡ 1-2 segundos | 100% | PDFs con texto digital |
| **OCR** | 🐢 30-60 segundos | 85-95% | PDFs escaneados |

---

## 🎛️ Configuración

### Idiomas Soportados

Por defecto, el OCR detecta **Español + Inglés**:

```typescript
// En src/lib/ocr.ts
const OCR_LANGUAGES = 'spa+eng';
```

### Calidad de Escaneo

Mayor resolución = mejor OCR pero más lento:

```typescript
viewportScale: 2.0  // 2x resolución (recomendado)
```

---

## 🔍 Detección Automática

El sistema detecta si un PDF necesita OCR usando:

1. **Longitud del texto** - Si tiene menos de 100 caracteres
2. **Ratio alfanumérico** - Si menos del 50% son letras/números

```typescript
// Ejemplo
needsOCR("abc123!@#xyz")  // ← false (suficiente texto)
needsOCR("...")           // ← true (solo símbolos)
needsOCR("")              // ← true (vacío)
```

---

## 📝 Logs en la Consola

### PDF Normal (sin OCR):
```
📄 Intentando extracción estándar de PDF...
📝 Texto extraído: 36122 caracteres
✅ Texto extraído exitosamente con método estándar
```

### PDF Escaneado (con OCR):
```
📄 Intentando extracción estándar de PDF...
⚠️ PDF parece ser escaneado (texto insuficiente), usando OCR...
🔍 Iniciando OCR para PDF escaneado...
📸 Convirtiendo PDF a imágenes...
✅ PDF convertido a 5 imágenes
🔤 Procesando página 1/5 con OCR...
   📊 Progreso: 25%
   📊 Progreso: 50%
   📊 Progreso: 75%
   📊 Progreso: 100%
   ✅ Página 1: 1234 caracteres extraídos
🔤 Procesando página 2/5 con OCR...
...
✅ OCR completado: 6789 caracteres totales
✅ Texto extraído con OCR
```

---

## 💡 Consejos para Mejor OCR

### Para Usuarios:
1. **Escanea en alta resolución** (300 DPI mínimo)
2. **Asegura buena iluminación** en fotos de documentos
3. **Evita páginas arrugadas o borrosas**
4. **Mantén el texto horizontal** (no rotado)

### Para Desarrolladores:
1. Puedes ajustar `viewportScale` para balance velocidad/calidad
2. Puedes agregar más idiomas: `'spa+eng+fra'`
3. Puedes ajustar el umbral de detección en `needsOCR()`

---

## 🐛 Solución de Problemas

### "Error en OCR"
- Verifica que el PDF no esté corrupto
- Verifica espacio en disco (OCR crea archivos temporales)
- Revisa memoria disponible (imágenes grandes)

### "OCR muy lento"
- Normal para PDFs con muchas páginas
- Considera reducir `viewportScale` a `1.5`
- PDFs de 10+ páginas pueden tomar 5+ minutos

### "Texto extraído con errores"
- Mejora la calidad del escaneo original
- OCR no es 100% perfecto
- Considera revisar manualmente documentos importantes

---

## 📦 Dependencias Instaladas

```json
{
  "tesseract.js": "^5.x",  // Motor OCR
  "pdfjs-dist": "^x",      // Procesamiento y renderizado de PDF
  "canvas": "^x"           // Renderizado de imágenes para OCR
}
```

**Nota:** Se usa `pdfjs-dist` en lugar de `pdf-to-png-converter` por mejor compatibilidad con Next.js y entornos serverless.

---

## 🎓 Recursos Adicionales

- [Tesseract.js Docs](https://tesseract.projectnaptha.com/)
- [Mejores Prácticas de Escaneo](https://en.wikipedia.org/wiki/Optical_character_recognition)
- [Idiomas Soportados por Tesseract](https://tesseract-ocr.github.io/tessdoc/Data-Files)

---

## ✅ Checklist de Testing

- [ ] Probar PDF digital normal (debe usar pdf-parse)
- [ ] Probar PDF escaneado simple (1-2 páginas)
- [ ] Probar PDF escaneado grande (10+ páginas)
- [ ] Probar foto de documento
- [ ] Verificar que el texto extraído sea legible
- [ ] Confirmar que los chunks se crean correctamente

---

**¿Preguntas?** Revisa los logs en la consola para debugging detallado.

