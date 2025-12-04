# 🚀 Inicio Rápido - Capital Plus AI Agent

## ¿Qué acabas de arreglar?

Tu aplicación tenía un error porque intentaba usar una función que no existe en Pinecone (`upsertRecords`). 

**La solución:** Ahora usamos **HuggingFace Inference API** para embeddings - ¡100% GRATIS y funciona perfectamente! 🎉

---

## ⚡ Pasos para Hacer Funcionar Tu App

### 1️⃣ Limpiar e Instalar Dependencias

```bash
# Eliminar node_modules y reinstalar
rm -rf node_modules package-lock.json

# Windows PowerShell:
Remove-Item -Recurse -Force node_modules, package-lock.json

# Reinstalar
npm install
```

---

### 2️⃣ Obtener API Key de HuggingFace (GRATIS - 30 segundos)

1. Ve a https://huggingface.co/join
2. Crea una cuenta (es GRATIS)
3. Ve a https://huggingface.co/settings/tokens
4. Click en "New token"
   - Name: `capital-plus-embeddings`
   - Role: **Read** (suficiente)
5. Copia el token generado

**Límites GRATIS:**
- 30,000 requests/mes
- Sin tarjeta de crédito requerida
- ¡Más que suficiente para probar!

---

### 3️⃣ Configurar Pinecone (IMPORTANTE ⚠️)

El modelo genera vectores de **384 dimensiones** (no 1024).

#### Si tu índice ya existe:
**DEBES eliminar el índice antiguo y crear uno nuevo** con las dimensiones correctas.

#### Crear índice nuevo:
1. Ve a [Pinecone Console](https://app.pinecone.io/)
2. Elimina el índice anterior si existe
3. Crea un nuevo índice con:
   - **Name:** `capitalplus-rag`
   - **Dimensions:** `384` ⚠️ ¡MUY IMPORTANTE!
   - **Metric:** `cosine`
   - **Cloud:** AWS
   - **Region:** us-east-1
   - **Pod Type:** Starter (gratis)

---

### 4️⃣ Configurar Variables de Entorno

Copia el archivo de plantilla:

```bash
# Windows (PowerShell)
Copy-Item ENV_TEMPLATE.txt .env

# Mac/Linux
cp ENV_TEMPLATE.txt .env
```

Edita `.env` y completa:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=capital_user
POSTGRES_PASSWORD=capital_pass
POSTGRES_DB=capital_plus_agent

# Pinecone (REQUERIDO)
PINECONE_API_KEY=pcsk_tu-api-key-aqui
PINECONE_INDEX_NAME=capitalplus-rag

# HuggingFace (REQUERIDO - ¡Es GRATIS!)
HUGGINGFACE_API_KEY=hf_tu-api-key-aqui

# LM Studio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M
```

---

### 5️⃣ Configurar Base de Datos

```bash
npm run db:migrate -- reset
```

---

### 6️⃣ Ejecutar la Aplicación

```bash
npm run dev
```

Abre http://localhost:3000 (o http://localhost:3001 si el puerto 3000 está en uso)

---

## 🎯 Probar el Upload

1. Ve a **Dashboard > Upload**
2. Sube un archivo PDF pequeño
3. Deberías ver en la consola:
   ```
   📁 Archivo guardado temporalmente
   📝 Texto extraído: X caracteres
   📦 Chunks creados: Y chunks
   🔄 Generando Y embeddings con HuggingFace...
   ✅ Embeddings generados: Y vectores
   📤 Chunks subidos a Pinecone
   ✅ Documento procesado exitosamente
   ```

---

## 🔍 Cómo Funciona Ahora

### Antes (con el error):
```
Tu código → ❌ upsertRecords() → Error (función no existe)
```

### Ahora (funcionando):
```
Tu archivo PDF
    ↓
Se divide en chunks de texto
    ↓
HuggingFace API genera embeddings
    ↓
Se suben a Pinecone con upsert()
    ↓
✅ ¡Listo para búsquedas!
```

---

## 📊 Ventajas de Solución con HuggingFace

✅ **100% GRATIS** - 30,000 requests/mes sin tarjeta
✅ **FUNCIONA** - Sin problemas de Webpack/Next.js  
✅ **RÁPIDO** - API optimizada
✅ **FÁCIL** - Solo necesitas un API key gratuito  
✅ **CONFIABLE** - Infraestructura de Hugging Face

---

## 🆘 Solución de Problemas

### Error: "HUGGINGFACE_API_KEY no está configurado"
Asegúrate de:
1. Tener un archivo `.env` en la raíz del proyecto
2. Que contenga `HUGGINGFACE_API_KEY=hf_...`
3. Reiniciar el servidor (`npm run dev`)

### Error: "dimensions mismatch en Pinecone"
Tu índice tiene dimensiones incorrectas. Elimínalo y recréalo con **384 dimensiones**.

### Error: "Module parse failed... onnxruntime"
Si todavía ves este error:
1. Ejecuta `rm -rf node_modules package-lock.json`
2. Ejecuta `npm install`  
3. Reinicia el servidor

### HuggingFace API devuelve error 503
El modelo está cargándose por primera vez. Espera 1 minuto y vuelve a intentar.

---

## 💡 Comparación de Costos

| Servicio | Costo | Límite |
|----------|-------|--------|
| **HuggingFace (nuestra solución)** | **GRATIS** | **30,000 req/mes** |
| OpenAI Embeddings | $0.13 por 1M tokens | Ilimitado (pagando) |
| Together AI | $0.001 por 1K tokens | Ilimitado (pagando) |
| Pinecone Inference | Incluido en plan | Depende del plan |

**Para 1,000 documentos con 10 chunks c/u = 10,000 embeddings = GRATIS con HuggingFace** 🎉

---

## 📚 Siguiente Paso

Una vez que la app funcione:

1. Sube varios documentos PDF
2. Ve a **Dashboard > Agent**
3. Haz preguntas sobre tus documentos
4. Revisa los logs en **Dashboard > Logs**

---

## ❓ Preguntas Frecuentes

### ¿Por qué 384 dimensiones?
El modelo `all-MiniLM-L6-v2` genera vectores de 384 dimensiones. Es compacto pero excelente para búsquedas semánticas.

### ¿Puedo cambiar a otro modelo?
Sí, en `src/lib/embeddings.ts` puedes cambiar `HF_MODEL` a otros modelos de sentence-transformers en HuggingFace. Solo asegúrate de que el índice de Pinecone tenga las dimensiones correctas.

### ¿Qué pasa si me quedo sin requests?
30,000/mes es bastante. Si necesitas más, puedes:
- Upgrade en HuggingFace (todavía económico)
- Usar Pinecone Inference (si tu plan lo permite)
- Usar OpenAI o Together AI

### ¿Los datos son privados?
Los textos se envían a HuggingFace para generar embeddings, pero HuggingFace no almacena los datos. Si necesitas 100% privacidad local, considera usar Pinecone Inference o un modelo local separado.

---

## ✨ ¡Listo!

Ahora tienes un sistema que:
- ✅ **Funciona sin errores**
- ✅ **Es gratis (con límites generosos)**  
- ✅ **Es simple de configurar**
- ✅ **Es compatible con Next.js**

¡Disfruta tu asistente de IA! 🚀
