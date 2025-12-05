# 📚 Documentación Técnica Completa - Agente Capital Plus

## Tabla de Contenidos

1. [Introducción](#introducción)
2. [Arquitectura General](#arquitectura-general)
3. [Sistema de Embeddings y Pinecone](#sistema-de-embeddings-y-pinecone)
4. [Procesamiento de Documentos](#procesamiento-de-documentos)
5. [Sistema RAG (Retrieval Augmented Generation)](#sistema-rag)
6. [Autenticación y Seguridad](#autenticación-y-seguridad)
7. [Base de Datos PostgreSQL](#base-de-datos-postgresql)
8. [Proveedores LLM](#proveedores-llm)
9. [Sistema de Caché](#sistema-de-caché)
10. [Sistema de Aprendizaje](#sistema-de-aprendizaje)
11. [Flujos Completos](#flujos-completos)
12. [Conexiones y Configuración](#conexiones-y-configuración)

---

## Introducción

**Agente Capital Plus** es un sistema completo de RAG (Retrieval Augmented Generation) diseñado para proporcionar respuestas inteligentes basadas en documentos corporativos. El sistema utiliza embeddings vectoriales, búsqueda semántica y modelos de lenguaje para responder consultas sobre desarrollos inmobiliarios, políticas, precios e inventario.

### Tecnologías Principales

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript 5.3
- **Base de Datos**: PostgreSQL 15
- **Vector DB**: Pinecone (con Inference API)
- **Embeddings**: llama-text-embed-v2 (1024 dimensiones)
- **LLM**: LM Studio (local) / OpenAI (cloud)
- **Autenticación**: JWT (jsonwebtoken)
- **Procesamiento PDF**: pdf-parse, pdfjs-dist
- **OCR**: Tesseract.js (temporalmente deshabilitado)

---

## Arquitectura General

### Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Dashboard│  │  Agent   │  │ Documents│  │  Config  │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
└───────┼─────────────┼─────────────┼─────────────┼──────────┘
        │             │             │             │
        └─────────────┴─────────────┴─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    API ROUTES (Next.js)   │
        │  ┌─────────────────────┐  │
        │  │ /api/rag-query      │  │
        │  │ /api/upload         │  │
        │  │ /api/auth/*         │  │
        │  │ /api/documents/*    │  │
        │  └─────────────────────┘  │
        └─────────────┬─────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌───▼──────┐ ┌───▼──────────┐
│  PostgreSQL  │ │ Pinecone │ │  LLM Provider│
│              │ │          │ │              │
│ - Users      │ │ - Vectors│ │ - LM Studio  │
│ - Documents  │ │ - Metadata│ │ - OpenAI    │
│ - Logs       │ │ - Namespaces│ │              │
│ - Cache      │ │          │ │              │
└──────────────┘ └──────────┘ └──────────────┘
```

### Flujo de Datos Principal

1. **Upload de Documentos**:
   - Usuario sube PDF/CSV/DOCX → Extracción de texto → Chunking → Embeddings → Pinecone

2. **Consulta RAG**:
   - Usuario hace pregunta → Procesamiento de query → Embedding del query → Búsqueda en Pinecone → Construcción de contexto → LLM → Respuesta

3. **Caché**:
   - Consultas similares → Búsqueda en caché → Si existe, retornar; si no, procesar y guardar

---

## Sistema de Embeddings y Pinecone

### Configuración de Embeddings

El sistema utiliza **Pinecone Inference API** con el modelo **llama-text-embed-v2** para generar embeddings.

#### Características Técnicas

- **Modelo**: `llama-text-embed-v2`
- **Dimensiones**: 1024
- **Métrica**: Cosine Similarity
- **Input Types**:
  - `passage`: Para documentos/chunks (al subir)
  - `query`: Para consultas de búsqueda

#### Proceso de Generación de Embeddings

**1. Para Documentos (Upload)**

```typescript
// Ubicación: src/lib/pinecone.ts - función upsertChunks()

// Paso 1: Generar embeddings en batches
const client = await initPinecone();
const embeddings = await client.inference.embed(
  'llama-text-embed-v2',
  textBatch,              // Array de textos
  { inputType: 'passage' } // Tipo: documento
);

// Paso 2: Crear records con vectores
const records = chunks.map((chunk, idx) => ({
  id: chunk.id,
  values: allEmbeddings[idx].values, // Vector de 1024 dimensiones
  metadata: { /* metadatos del chunk */ }
}));

// Paso 3: Subir a Pinecone
await index.namespace(namespace).upsert(records);
```

**2. Para Consultas (RAG Query)**

```typescript
// Ubicación: src/lib/pinecone.ts - función queryChunks()

// Paso 1: Procesar query (corrección ortográfica + expansión semántica)
const processedQuery = processQuery(queryText);

// Paso 2: Generar embedding del query
const embeddings = await client.inference.embed(
  'llama-text-embed-v2',
  [processedQuery],
  { inputType: 'query' } // Tipo: consulta
);

// Paso 3: Buscar vectores similares
const response = await index.namespace(namespace).query({
  vector: queryVector,
  topK: topK * 2, // Buscar más para re-ranking
  filter: { development, type },
  includeMetadata: true
});
```

### Estructura de Namespaces en Pinecone

Los namespaces organizan los vectores por **zona geográfica**:

- `yucatan` - Documentos de Yucatán
- `puebla` - Documentos de Puebla
- `quintana_roo` - Documentos de Quintana Roo
- `cache` - Caché de consultas (namespace especial)

### Metadata de Chunks

Cada vector en Pinecone incluye metadata:

```typescript
{
  text: string;              // Texto original del chunk
  zone: Zone;                // Zona geográfica
  development: string;       // Nombre del desarrollo
  type: DocumentContentType; // Tipo de documento (brochure, policy, etc.)
  page: number;              // Número de página
  chunk: number;             // Número de chunk en la página
  sourceFileName: string;    // Nombre del archivo fuente
  uploaded_by: number;       // ID del usuario que subió
  created_at: string;        // Fecha de creación
}
```

### Re-ranking Inteligente

El sistema aplica re-ranking basado en estadísticas de chunks:

```typescript
// Calcular score final: similarity_score * 0.8 + success_ratio * 0.2
const finalScore = (match.score * 0.8) + (successRatio * 0.2);
```

Esto prioriza chunks que han sido útiles en consultas anteriores.

### Búsqueda con Variantes

Si la búsqueda inicial no encuentra suficientes resultados relevantes, el sistema:

1. Genera variantes del query usando `generateQueryVariants()`
2. Busca con las 2-3 mejores variantes
3. Combina resultados y elimina duplicados
4. Retorna los mejores matches

---

## Procesamiento de Documentos

### Flujo Completo de Upload

```
1. Usuario sube archivo (PDF/CSV/DOCX)
   ↓
2. Validación de archivo (tamaño, tipo)
   ↓
3. Verificación de permisos del usuario
   ↓
4. Guardado temporal del archivo
   ↓
5. Extracción de texto según tipo:
   - PDF: pdf-parse → Si falla, intenta OCR
   - CSV: Conversión a texto estructurado
   - DOCX: mammoth.extractRawText()
   ↓
6. Limpieza de texto (eliminar caracteres especiales, normalizar)
   ↓
7. Chunking inteligente (con overlap)
   ↓
8. Generación de embeddings (Pinecone Inference API)
   ↓
9. Subida a Pinecone (con metadata)
   ↓
10. Guardado de metadata en PostgreSQL
   ↓
11. Registro de acción en logs
   ↓
12. Limpieza de archivo temporal
```

### Extracción de Texto

#### PDF

```typescript
// Ubicación: src/app/api/upload/route.ts

// Método 1: Extracción estándar (rápida)
const standardText = await extractTextFromPDF(dataBuffer);

// Método 2: OCR (si el PDF es escaneado)
if (needsOCR(standardText)) {
  const ocrText = await extractTextFromPDFWithOCR(filepath);
}
```

**Detección de necesidad de OCR**:
- Si el texto extraído tiene menos de 50 caracteres por página
- Si contiene principalmente caracteres no reconocibles

**Nota**: El OCR está temporalmente deshabilitado debido a problemas de compatibilidad en Vercel.

#### CSV

```typescript
// Conversión de CSV a texto estructurado
const lines = content.split('\n');
const headers = lines[0].split(',');
// Crear pares clave-valor para cada fila
```

#### DOCX

```typescript
// Usando mammoth para extraer texto
const result = await mammoth.extractRawText({ path: filepath });
return result.value;
```

### Chunking Inteligente

El sistema divide documentos en chunks con las siguientes características:

#### Configuración

- **Tamaño por defecto**: 500 tokens (~2000 caracteres)
- **Overlap**: 50 tokens (~200 caracteres)
- **Estrategia**: Jerárquica (párrafos → oraciones → palabras)

#### Algoritmo de Chunking

```typescript
// Ubicación: src/lib/chunker.ts

1. Dividir por párrafos (doble salto de línea)
2. Si un párrafo cabe en el chunk actual, agregarlo
3. Si no cabe:
   - Guardar chunk actual
   - Mantener overlap (últimos 50 tokens)
   - Iniciar nuevo chunk con overlap + nuevo párrafo
4. Si un párrafo es muy largo, dividir por oraciones
5. Si una oración es muy larga, dividir por palabras
```

#### Generación de IDs de Chunks

```typescript
function generateChunkId(filename: string, chunkIndex: number): string {
  const cleanFilename = filename.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const shortUuid = uuidv4().split('-')[0];
  return `${cleanFilename}_chunk${chunkIndex}_${shortUuid}`;
}
```

### Limpieza de Texto

Cada tipo de archivo tiene su función de limpieza:

- **PDF**: Elimina caracteres de control, normaliza espacios
- **CSV**: Convierte a formato legible con pares clave-valor
- **DOCX**: Limpia caracteres especiales de Word

---

## Sistema RAG

### Flujo Completo de una Consulta RAG

```
1. Usuario envía consulta
   ↓
2. Autenticación y validación
   ↓
3. Verificación de permisos (zona, desarrollo)
   ↓
4. Detección de consulta simple (saludo, pregunta general)
   ↓
5. Si es simple:
   → Responder directamente sin búsqueda RAG
   ↓
6. Si es compleja:
   → Procesar query (corrección + expansión)
   ↓
7. Buscar en caché (por hash exacto o similitud semántica)
   ↓
8. Si está en caché:
   → Retornar respuesta del caché
   ↓
9. Si no está en caché:
   → Generar embedding del query
   → Buscar en Pinecone (topK chunks)
   → Re-ranking con estadísticas
   → Construir contexto
   ↓
10. Cargar memoria operativa del agente
   ↓
11. Enviar al LLM:
    - System prompt (con memorias)
    - Contexto recuperado
    - Query del usuario
   ↓
12. Recibir respuesta del LLM
   ↓
13. Construir referencias de fuentes
   ↓
14. Guardar en caché
   ↓
15. Guardar log de consulta
   ↓
16. Registrar chunks usados
   ↓
17. Retornar respuesta al usuario
```

### Detección de Consultas Simples

El sistema detecta consultas que no requieren búsqueda RAG:

```typescript
// Patrones de consultas simples:
- Saludos: "hola", "buenos días", "hi"
- Preguntas muy cortas: menos de 10 caracteres
- Preguntas sobre el sistema: "quién eres", "qué puedes hacer"
```

Si es simple, se responde directamente con `runSimpleQuery()` que usa un prompt más corto y creativo.

### Procesamiento de Queries

#### Corrección Ortográfica

```typescript
// Ubicación: src/lib/queryProcessing.ts

const SPELLING_CORRECTIONS = {
  'contruir': 'construir',
  'contrucción': 'construcción',
  'canceleria': 'cancelaría',
  // ... más correcciones
};
```

#### Expansión Semántica

```typescript
const SEMANTIC_EXPANSIONS = {
  'material prohibido': [
    'materiales prohibidos',
    'materiales no permitidos',
    'se prohíbe',
    'no se permite'
  ],
  // ... más expansiones
};
```

El sistema expande queries para encontrar información relacionada que puede estar expresada de diferentes formas en los documentos.

### Construcción de Contexto

```typescript
// Ubicación: src/lib/pinecone.ts - buildContextFromMatches()

const context = matches
  .map((match, index) => {
    return `[Fuente ${index + 1}: ${sourceFileName}, Página ${page}]\n${text}`;
  })
  .join('\n\n---\n\n');
```

Cada fuente se numera para permitir citas en la respuesta.

### System Prompt

El system prompt incluye:

1. **Identidad del agente**: Agente Interno de Capital Plus
2. **Responsabilidades**: Desarrollos, políticas, zonas
3. **Reglas de comportamiento**: Precisión, profesionalismo, claridad
4. **Restricciones**: No inventar información, no asesoría legal
5. **Formato de respuestas**: Markdown obligatorio
6. **Citas de fuentes**: Formato [1], [2], [3]
7. **Memoria operativa**: Información aprendida del sistema

#### Ejemplo de Prompt Completo

```
Eres el Agente Interno Oficial de Capital Plus...

[Contexto recuperado de la base de conocimientos:]
[Fuente 1: documento.pdf, Página 5]
Texto del chunk 1...

[Fuente 2: documento2.pdf, Página 3]
Texto del chunk 2...

**INSTRUCCIONES IMPORTANTES SOBRE CITAS:**
- Cada fuente está numerada como "Fuente 1", "Fuente 2", etc.
- Cuando uses información de una fuente, DEBES incluir una cita numérica [1], [2], etc.

Pregunta: [query del usuario]
```

### Memoria Operativa del Agente

El sistema mantiene una memoria de información importante:

```typescript
// Cargar memorias con importancia >= 0.7
const memories = await getAgentMemories(0.7);

// Se agregan al system prompt como:
## 🧠 MEMORIA DEL SISTEMA
- **Tema 1**: Resumen de información importante
- **Tema 2**: Otra información relevante
```

---

## Autenticación y Seguridad

### Sistema de Autenticación JWT

#### Tokens

- **Access Token**: Expira en 24 horas (configurable)
- **Refresh Token**: Expira en 7 días (configurable)
- **Secrets**: `JWT_SECRET` y `JWT_REFRESH_SECRET` (variables de entorno)

#### Flujo de Login

```
1. Usuario envía email y contraseña
   ↓
2. Validación de formato de email
   ↓
3. Buscar usuario en PostgreSQL
   ↓
4. Verificar si cuenta está activa
   ↓
5. Verificar si cuenta está bloqueada (por intentos fallidos)
   ↓
6. Verificar contraseña con bcrypt
   ↓
7. Si falla:
   → Incrementar intentos fallidos
   → Si >= 5 intentos, bloquear cuenta por 15 minutos
   ↓
8. Si éxito:
   → Resetear intentos fallidos
   → Actualizar último login
   → Generar access token y refresh token
   → Crear sesión en base de datos
   ↓
9. Retornar tokens y datos del usuario
```

#### Seguridad de Contraseñas

- **Hashing**: bcrypt con 12 rounds
- **Validación de fortaleza**: Mínimo 8 caracteres, mayúscula, minúscula, número, carácter especial
- **Bloqueo de cuenta**: 5 intentos fallidos → bloqueo por 15 minutos

#### Gestión de Sesiones

Cada login crea una sesión en `user_sessions` con:
- `session_token`: Access token
- `refresh_token`: Refresh token
- `expires_at`: Fecha de expiración
- `ip_address`: IP del cliente
- `user_agent`: Navegador del cliente

### Sistema de Roles y Permisos

#### Roles Predefinidos

1. **CEO**: Acceso total a todo
2. **Admin**: Gestión completa (usuarios, configuración, documentos)
3. **Sales Manager**: Upload, Query, View
4. **Sales Agent**: Query, View
5. **Post-Sales**: Query, View
6. **Legal Manager**: Upload, Query, View
7. **Marketing Manager**: Upload, Query, View

#### Permisos

- `query_agent`: Consultar al agente
- `upload_documents`: Subir documentos
- `manage_users`: Gestionar usuarios (solo admin/CEO)
- `view_logs`: Ver logs (solo admin/CEO)

#### Control de Acceso por Zona y Desarrollo

```typescript
// Verificar acceso a un desarrollo específico
const hasAccess = await checkUserAccess(
  userId,
  zone,        // 'yucatan', 'puebla', etc.
  development, // 'riviera', 'campo_magno', etc.
  'can_query'  // o 'can_upload'
);
```

**Roles con acceso total** (no requieren asignación específica):
- CEO
- Admin
- Legal Manager
- Post-Sales
- Marketing Manager

**Otros roles** requieren asignación explícita en `user_developments`.

---

## Base de Datos PostgreSQL

### Estructura de Tablas Principales

#### 1. `users`

```sql
- id (SERIAL PRIMARY KEY)
- email (VARCHAR UNIQUE)
- name (VARCHAR)
- role_id (INTEGER → roles.id)
- password_hash (VARCHAR)
- is_active (BOOLEAN)
- failed_login_attempts (INTEGER)
- locked_until (TIMESTAMP)
- last_login (TIMESTAMP)
- created_at, updated_at
```

#### 2. `roles` y `permissions`

```sql
-- roles
- id, name, description

-- permissions
- id, name, description

-- role_permissions (many-to-many)
- role_id, permission_id
```

#### 3. `user_developments`

```sql
- user_id, zone, development
- can_upload (BOOLEAN)
- can_query (BOOLEAN)
- PRIMARY KEY (user_id, zone, development)
```

#### 4. `documents_meta`

```sql
- id, filename, zone, development, type
- uploaded_by, pinecone_namespace
- tags (TEXT[]), created_at
```

#### 5. `query_logs`

```sql
- id, user_id, query, zone, development
- response, sources_used (TEXT[])
- response_time_ms, tokens_used
- feedback_rating, feedback_comment
- created_at
```

#### 6. `query_cache`

```sql
- id, query_text, query_hash
- zone, development, document_type
- response, sources_used (TEXT[])
- embedding_id, hit_count
- last_used_at, created_at, expires_at
```

#### 7. `chunk_stats`

```sql
- chunk_id (PRIMARY KEY)
- success_count, fail_count
- last_used (TIMESTAMP)
```

#### 8. `agent_memory`

```sql
- topic (PRIMARY KEY)
- summary (TEXT)
- importance (NUMERIC 0-1)
- last_updated (TIMESTAMP)
```

#### 9. `user_sessions`

```sql
- id, user_id
- session_token, refresh_token
- expires_at, last_used_at
- ip_address, user_agent
```

### Conexión a PostgreSQL

#### Configuración de Pool

```typescript
// Ubicación: src/lib/postgres.ts

// Prioridad de variables de entorno:
1. DATABASE_URL (manual - recomendado)
2. POSTGRES_URL_NON_POOLING (Vercel auto)
3. POSTGRES_PRISMA_URL (Vercel auto)
4. POSTGRES_URL (pooler - puede fallar en serverless)
5. Variables individuales (desarrollo local)

// Configuración para Supabase:
{
  host, port, user, password, database,
  ssl: { rejectUnauthorized: false },
  family: 4  // Forzar IPv4 (Vercel no soporta IPv6)
}
```

#### Pool de Conexiones

- **Máximo**: 20 conexiones
- **Idle Timeout**: 30 segundos
- **Connection Timeout**: 10 segundos

### Funciones Principales de PostgreSQL

#### Usuarios

- `getUserById()`, `getUserByEmail()`
- `createUser()`, `updateUser()`
- `checkUserAccess()` - Verificar permisos por zona/desarrollo
- `hasPermission()` - Verificar permiso específico

#### Documentos

- `saveDocumentMeta()` - Guardar metadata
- `getDocuments()` - Listar con filtros
- `deleteDocument()` - Eliminar documento

#### Logs y Caché

- `saveQueryLog()` - Guardar consulta
- `getQueryLogs()` - Listar con paginación
- `getCachedResponse()` - Buscar en caché
- `saveCachedResponse()` - Guardar en caché

#### Aprendizaje

- `updateChunkStats()` - Actualizar estadísticas de chunks
- `registerQueryChunks()` - Registrar chunks usados
- `getAgentMemories()` - Obtener memoria del agente
- `upsertAgentMemory()` - Guardar/actualizar memoria

---

## Proveedores LLM

### Arquitectura de Abstracción

El sistema usa una capa de abstracción que permite cambiar entre proveedores:

```typescript
// Ubicación: src/lib/llm-provider.ts

getLLMProvider() → Lee de agent_config (llm_provider)
  ↓
runLLM() → Llama al proveedor configurado
  ↓
  ├─→ LM Studio (local)
  └─→ OpenAI (cloud)
```

### Configuración Dinámica

El proveedor se configura en la base de datos:

```sql
INSERT INTO agent_config (key, value) 
VALUES ('llm_provider', 'lmstudio'); -- o 'openai'
```

### LM Studio (Local)

#### Configuración

```env
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M
```

#### Implementación

```typescript
// Ubicación: src/lib/lmstudio.ts

const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: model,
    messages: messages,
    temperature: temperature,
    max_tokens: max_tokens,
  })
});
```

#### Health Check

```typescript
// Verifica que el servidor esté disponible
const health = await fetch(`${baseUrl}/models`);
return health.ok;
```

### OpenAI (Cloud)

#### Configuración

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

#### Implementación

```typescript
// Ubicación: src/lib/openai.ts

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const completion = await openai.chat.completions.create({
  model: model,
  messages: messages,
  temperature: temperature,
  max_tokens: max_tokens,
});
```

### Parámetros del LLM

- **Temperature**: 0.2 (default) - Controla creatividad (0.0 = determinista, 1.0 = creativo)
- **Max Tokens**: 2048 (default) - Límite de tokens en respuesta
- **Model**: Configurable por proveedor

### Funciones de Alto Nivel

#### `runRAGQuery()`

```typescript
// Construye el prompt completo con:
// 1. System prompt (con memorias)
// 2. Contexto recuperado
// 3. Query del usuario
// 4. Instrucciones de citas
```

#### `runSimpleQuery()`

```typescript
// Para consultas simples (saludos)
// Usa un prompt más corto y creativo
// Temperature: 0.7, Max Tokens: 150
```

---

## Sistema de Caché

### Arquitectura de Caché

El sistema usa un caché de dos niveles:

1. **Caché en Memoria** (embeddings): Map en memoria del servidor
2. **Caché en PostgreSQL + Pinecone**: Persistente

### Flujo de Caché

```
1. Usuario hace consulta
   ↓
2. Generar hash MD5 del query normalizado
   ↓
3. Buscar en PostgreSQL por hash exacto
   ↓
4. Si no encuentra:
   → Generar embedding del query
   → Buscar en Pinecone (namespace: cache) por similitud
   → Si similarity >= 0.85, usar respuesta del caché
   ↓
5. Si encuentra:
   → Incrementar hit_count
   → Retornar respuesta
   ↓
6. Si no encuentra:
   → Procesar consulta normalmente
   → Guardar respuesta en caché
```

### Estructura del Caché

#### PostgreSQL (`query_cache`)

```sql
- query_text: Query normalizado
- query_hash: MD5 del query
- zone, development, document_type
- response: Respuesta completa
- sources_used: Array de nombres de archivos
- embedding_id: ID del vector en Pinecone
- hit_count: Número de veces usado
- expires_at: Fecha de expiración (30 días)
```

#### Pinecone (namespace: `cache`)

```typescript
{
  id: `cache-${queryHash}`,
  values: embeddingVector, // Vector de 1024 dimensiones
  metadata: {
    query_text: normalizedQuery,
    zone, development, document_type,
    query_hash: queryHash
  }
}
```

### Búsqueda Semántica en Caché

```typescript
// 1. Generar embedding del query
const embeddings = await client.inference.embed(
  'llama-text-embed-v2',
  [normalizedQuery],
  { inputType: 'query' }
);

// 2. Buscar en Pinecone
const response = await ns.query({
  vector: queryVector,
  topK: 3,
  filter: { zone, development, document_type },
  includeMetadata: true
});

// 3. Si similarity >= 0.85, usar respuesta
if (bestMatch.score >= 0.85) {
  // Buscar entrada en PostgreSQL por embedding_id
  const entry = await getSimilarCachedResponses([embeddingId], ...);
  return entry;
}
```

### Caché de Embeddings en Memoria

Para evitar regenerar embeddings del mismo query:

```typescript
const embeddingCache = new Map<string, {
  vector: number[];
  timestamp: number;
}>();

// TTL: 1 hora
// Límite: 100 entradas (LRU)
```

### Limpieza de Caché

- **Expiración automática**: 30 días
- **Limpieza manual**: `cleanupExpiredCache()`
- **Caché en memoria**: LRU (mantiene últimas 100 entradas)

---

## Sistema de Aprendizaje

### Componentes del Sistema de Aprendizaje

1. **Chunk Stats**: Estadísticas de éxito/fallo de chunks
2. **Agent Memory**: Memoria operativa del agente
3. **Response Learning**: Aprendizaje de respuestas
4. **Feedback Processing**: Procesamiento de feedback de usuarios

### Chunk Stats

#### Actualización de Estadísticas

```typescript
// Cuando un usuario da feedback:
if (rating >= 4) {
  // Éxito: incrementar success_count
  await query(`
    INSERT INTO chunk_stats (chunk_id, success_count)
    VALUES ($1, 1)
    ON CONFLICT DO UPDATE SET
      success_count = chunk_stats.success_count + 1
  `);
} else if (rating <= 2) {
  // Falla: incrementar fail_count
  await query(`
    INSERT INTO chunk_stats (chunk_id, fail_count)
    VALUES ($1, 1)
    ON CONFLICT DO UPDATE SET
      fail_count = chunk_stats.fail_count + 1
  `);
}
```

#### Uso en Re-ranking

```typescript
// Calcular success_ratio
const successRatio = success_count / (success_count + fail_count);

// Aplicar en score final
const finalScore = (similarityScore * 0.8) + (successRatio * 0.2);
```

Esto hace que chunks que han sido útiles tengan mayor prioridad en futuras búsquedas.

### Agent Memory

#### Estructura

```sql
agent_memory:
- topic (PRIMARY KEY): Tema de la memoria
- summary: Resumen de la información
- importance: 0.0 - 1.0 (importancia)
- last_updated: Fecha de última actualización
```

#### Uso

Las memorias con `importance >= 0.7` se incluyen automáticamente en el system prompt:

```typescript
const memories = await getAgentMemories(0.7);

// Se agregan al prompt como:
## 🧠 MEMORIA DEL SISTEMA
- **Tema 1**: Resumen...
- **Tema 2**: Resumen...
```

#### Actualización

```typescript
// Crear o actualizar memoria
await upsertAgentMemory(
  topic: string,
  summary: string,
  importance: number
);

// La importancia se promedia si ya existe
importance = (oldImportance + newImportance) / 2;
```

### Response Learning

El sistema puede aprender respuestas completas para queries frecuentes:

```sql
response_learning:
- query (PRIMARY KEY): Query exacto
- answer: Respuesta aprendida
- quality_score: 0.0 - 1.0 (calidad)
- usage_count: Número de veces usada
- last_improved_at: Fecha de última mejora
```

**Nota**: Esta funcionalidad está implementada pero no se usa activamente en el flujo principal.

### Feedback Processing

#### Flujo de Feedback

```
1. Usuario da feedback (rating 1-5, comentario opcional)
   ↓
2. Guardar en query_logs (feedback_rating, feedback_comment)
   ↓
3. Actualizar chunk_stats para cada chunk usado
   ↓
4. (Opcional) Procesar para mejorar respuestas futuras
```

#### Script de Procesamiento

```bash
# Procesar feedback reciente (últimas 24 horas)
node scripts/process-feedback-learning.js
```

Este script:
- Obtiene feedback reciente
- Analiza patrones
- Actualiza memorias del agente
- Mejora respuestas aprendidas

---

## Flujos Completos

### Flujo 1: Upload de Documento

```
┌─────────────┐
│   Usuario   │
└──────┬──────┘
       │ 1. POST /api/upload
       │    (file, zone, development, type)
       ▼
┌──────────────────┐
│  Validación      │
│  - Tamaño        │
│  - Tipo          │
│  - Permisos      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Extracción      │
│  - PDF: pdf-parse│
│  - CSV: parse    │
│  - DOCX: mammoth │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Limpieza        │
│  - Normalizar    │
│  - Limpiar       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Chunking        │
│  - Dividir       │
│  - Overlap       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Embeddings      │
│  Pinecone        │
│  Inference API   │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Pinecone        │
│  - Upsert        │
│  - Metadata      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  PostgreSQL      │
│  - documents_meta│
│  - action_logs   │
└──────┬───────────┘
       │
       ▼
┌─────────────┐
│  Respuesta  │
│  (success)  │
└─────────────┘
```

### Flujo 2: Consulta RAG

```
┌─────────────┐
│   Usuario   │
└──────┬──────┘
       │ 1. POST /api/rag-query
       │    (query, zone, development)
       ▼
┌──────────────────┐
│  Autenticación   │
│  - Verificar JWT │
│  - Permisos      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  ¿Consulta       │
│  Simple?         │
└──────┬───────────┘
       │
   ┌───┴───┐
   │       │
  SÍ      NO
   │       │
   ▼       ▼
┌─────┐ ┌──────────────────┐
│ LLM │ │  Buscar Caché    │
│Simple│ │  - Hash exacto   │
└─────┘ │  - Similitud     │
        └──────┬───────────┘
               │
          ┌────┴────┐
          │         │
        HIT       MISS
          │         │
          ▼         ▼
    ┌─────────┐ ┌──────────────────┐
    │ Retornar│ │  Procesar Query  │
    │ Caché   │ │  - Corrección    │
    └─────────┘ │  - Expansión     │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Embedding Query │
                │  Pinecone        │
                │  Inference API   │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Buscar Pinecone │
                │  - Query vector  │
                │  - Filtros       │
                │  - TopK          │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Re-ranking      │
                │  - Chunk stats   │
                │  - Score final   │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Construir       │
                │  Contexto        │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Cargar Memorias │
                │  Agent Memory    │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  LLM             │
                │  - System prompt │
                │  - Contexto      │
                │  - Query         │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Construir       │
                │  Fuentes         │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Guardar Caché   │
                │  - PostgreSQL    │
                │  - Pinecone      │
                └──────┬───────────┘
                       │
                       ▼
                ┌──────────────────┐
                │  Guardar Log     │
                │  - query_logs    │
                │  - chunks usados │
                └──────┬───────────┘
                       │
                       ▼
                ┌─────────────┐
                │  Respuesta  │
                │  + Fuentes  │
                └─────────────┘
```

### Flujo 3: Feedback y Aprendizaje

```
┌─────────────┐
│   Usuario   │
└──────┬──────┘
       │ 1. POST /api/rag-feedback
       │    (query_log_id, rating, comment)
       ▼
┌──────────────────┐
│  Guardar Feedback│
│  - query_logs    │
│  - rating        │
│  - comment       │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Obtener Chunks  │
│  Usados          │
│  - query_logs_   │
│    chunks        │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  Actualizar      │
│  Chunk Stats     │
│  - success_count │
│  - fail_count    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  (Opcional)      │
│  Procesar        │
│  Aprendizaje     │
│  - Memorias      │
│  - Respuestas    │
└──────────────────┘
```

---

## Conexiones y Configuración

### Variables de Entorno Requeridas

#### Base de Datos

```env
# Opción 1: Cadena de conexión completa (recomendado)
DATABASE_URL=postgresql://user:password@host:5432/database

# Opción 2: Variables individuales (desarrollo local)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=capital_plus_agent
```

#### Pinecone

```env
PINECONE_API_KEY=tu-api-key-aqui
PINECONE_INDEX_NAME=capitalplus-rag
```

**Importante**: El índice debe tener **1024 dimensiones** (llama-text-embed-v2).

#### LLM

```env
# LM Studio (local)
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# OpenAI (cloud)
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

#### Autenticación

```env
JWT_SECRET=tu-secret-key-muy-segura
JWT_REFRESH_SECRET=tu-refresh-secret-key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

#### Otros

```env
UPLOAD_DIR=./tmp
MAX_FILE_SIZE=52428800  # 50MB
CHUNK_SIZE=500
CHUNK_OVERLAP=50
```

### Configuración de Pinecone

#### Crear Índice

1. Ve a [Pinecone Console](https://app.pinecone.io/)
2. Crea un nuevo índice:
   - **Name**: `capitalplus-rag`
   - **Dimensions**: `1024` ⚠️
   - **Metric**: `cosine`
   - **Cloud**: AWS
   - **Region**: us-east-1

#### Verificar Configuración

```typescript
// Verificar que el índice existe y tiene las dimensiones correctas
const index = await getPineconeIndex();
const stats = await index.describeIndexStats();
console.log(stats);
```

### Configuración de PostgreSQL

#### Migraciones

```bash
# Ejecutar todas las migraciones
npm run db:migrate:all

# Migraciones disponibles:
# - 001_initial_schema.sql
# - 002_action_logs.sql
# - 002_update_roles.sql
# - 003_add_auth_fields.sql
# - 003_query_cache.sql
# - 004_cache_indexes_optimization.sql
# - 004_learning_system.sql
# - 005_add_feedback_rating.sql
# - 006_llm_provider_config.sql
```

#### Seed de Datos

```bash
# Insertar datos iniciales (roles, permisos, usuario admin)
npm run db:seed

# Configurar contraseña de admin
npm run db:set-admin-password
```

### Configuración de Supabase (Vercel)

#### Variables de Entorno en Vercel

1. Ve a Vercel Dashboard → Settings → Environment Variables
2. Agrega `DATABASE_URL` con la cadena de conexión de Supabase:
   - Supabase Dashboard → Settings → Database → Connection String
   - Usa "Direct connection" (no pooler)

#### Configuración SSL

El código automáticamente detecta Supabase y configura SSL:

```typescript
ssl: {
  rejectUnauthorized: false  // Necesario para Supabase
}
```

#### Forzar IPv4

Vercel no soporta IPv6, por lo que se fuerza IPv4:

```typescript
family: 4  // Forzar IPv4
```

---

## Resumen de Métodos y Funciones Clave

### Pinecone (`src/lib/pinecone.ts`)

- `initPinecone()`: Inicializar cliente
- `getPineconeIndex()`: Obtener índice
- `upsertChunks()`: Subir chunks con embeddings
- `queryChunks()`: Buscar chunks similares
- `buildContextFromMatches()`: Construir contexto desde matches
- `deleteDocumentChunks()`: Eliminar chunks de un documento

### PostgreSQL (`src/lib/postgres.ts`)

- `getUserById()`, `getUserByEmail()`: Obtener usuarios
- `checkUserAccess()`: Verificar permisos
- `saveDocumentMeta()`: Guardar metadata de documentos
- `saveQueryLog()`: Guardar log de consulta
- `getCachedResponse()`: Buscar en caché
- `getAgentMemories()`: Obtener memoria del agente
- `updateChunkStats()`: Actualizar estadísticas

### LLM (`src/lib/llm.ts`, `src/lib/llm-provider.ts`)

- `runLLM()`: Ejecutar consulta al LLM
- `runRAGQuery()`: Consulta RAG completa
- `runSimpleQuery()`: Consulta simple (sin RAG)
- `getLLMProvider()`: Obtener proveedor configurado
- `checkLLMHealth()`: Verificar salud del LLM

### Chunking (`src/lib/chunker.ts`)

- `chunkText()`: Dividir texto en chunks
- `createChunksWithMetadata()`: Crear chunks con metadata
- `createPageAwareChunks()`: Chunks con información de página
- `estimateTokens()`: Estimar tokens en texto

### Query Processing (`src/lib/queryProcessing.ts`)

- `processQuery()`: Procesar query completo
- `correctSpelling()`: Corregir ortografía
- `expandQuerySemantically()`: Expandir semánticamente
- `generateQueryVariants()`: Generar variantes

### Cache (`src/lib/cache.ts`)

- `findCachedResponse()`: Buscar respuesta en caché
- `saveToCache()`: Guardar respuesta en caché
- `cleanupCache()`: Limpiar caché expirado

### Auth (`src/lib/auth.ts`)

- `hashPassword()`: Hashear contraseña
- `verifyPassword()`: Verificar contraseña
- `generateAccessToken()`: Generar access token
- `verifyAccessToken()`: Verificar access token
- `validateEmail()`: Validar formato de email

---

## Conclusión

Este sistema implementa un RAG completo y robusto con:

- ✅ **Búsqueda semántica** con embeddings vectoriales
- ✅ **Procesamiento inteligente** de documentos
- ✅ **Caché optimizado** para respuestas rápidas
- ✅ **Sistema de aprendizaje** que mejora con el tiempo
- ✅ **Autenticación segura** con JWT
- ✅ **Control de acceso granular** por zona y desarrollo
- ✅ **Múltiples proveedores LLM** (local y cloud)
- ✅ **Logging completo** para análisis y debugging

El sistema está diseñado para escalar y mejorar continuamente basándose en el feedback de los usuarios y las estadísticas de uso.

---

**Última actualización**: 2024
**Versión del documento**: 1.0

