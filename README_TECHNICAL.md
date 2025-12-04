# 📚 Capital Plus AI Agent - Documentación Técnica

Documentación técnica completa del sistema de Agente de IA para Capital Plus. Este documento está dirigido a desarrolladores y técnicos que necesitan entender la arquitectura, funciones y librerías del sistema.

## 📋 Tabla de Contenidos

1. [Arquitectura del Sistema](#arquitectura-del-sistema)
2. [Librerías y Dependencias](#librerías-y-dependencias)
3. [Estructura de Archivos](#estructura-de-archivos)
4. [Módulos y Funciones](#módulos-y-funciones)
5. [APIs y Endpoints](#apis-y-endpoints)
6. [Base de Datos](#base-de-datos)
7. [Flujos de Trabajo](#flujos-de-trabajo)
8. [Configuración Avanzada](#configuración-avanzada)

---

## 🏗️ Arquitectura del Sistema

### Diagrama de Arquitectura

```
┌─────────────────┐
│   Frontend      │
│  (Next.js 14)   │
│  React + TS     │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────────────────────────┐
│         API Routes                  │
│  (Next.js App Router)               │
│  - /api/upload                      │
│  - /api/rag-query                   │
│  - /api/chat-history                │
│  - /api/documents                   │
└─────┬───────────────────┬───────────┘
      │                   │
      ▼                   ▼
┌─────────────┐   ┌──────────────┐
│  PostgreSQL │   │   Pinecone   │
│  (Metadata) │   │  (Vectors)   │
└─────────────┘   └──────┬───────┘
                         │
                         ▼
                  ┌──────────────┐
                  │  LM Studio   │
                  │  (LLM Local) │
                  └──────────────┘
```

### Componentes Principales

1. **Frontend (Next.js 14)**
   - App Router con Server Components
   - Client Components para interactividad
   - TailwindCSS + ShadCN UI

2. **Backend (Next.js API Routes)**
   - RESTful APIs
   - Procesamiento de archivos
   - Integración con servicios externos

3. **Base de Datos (PostgreSQL)**
   - Metadata de documentos
   - Usuarios y permisos
   - Logs y caché

4. **Vector Database (Pinecone)**
   - Almacenamiento de embeddings
   - Búsqueda semántica
   - Namespaces por zona

5. **LLM (LM Studio)**
   - Modelo local: llama-3.2-3B-Instruct
   - API compatible con OpenAI
   - Generación de respuestas

---

## 📦 Librerías y Dependencias

### Core Framework

#### **Next.js 14.2.0**
- **Uso**: Framework React con App Router
- **Características utilizadas**:
  - Server Components
  - API Routes
  - File-based routing
  - Server Actions (futuro)

#### **TypeScript 5.3.3**
- **Uso**: Tipado estático
- **Configuración**: `tsconfig.json`
- **Tipos personalizados**: `src/types/`

### Base de Datos

#### **pg 8.11.3** (PostgreSQL Client)
- **Uso**: Cliente para PostgreSQL
- **Módulo**: `src/lib/postgres.ts`
- **Funciones principales**:
  - Pool de conexiones
  - Queries parametrizadas
  - Transacciones

#### **@pinecone-database/pinecone 3.0.0**
- **Uso**: Cliente para Pinecone Vector DB
- **Módulo**: `src/lib/pinecone.ts`
- **Características**:
  - Inference API para embeddings
  - Namespaces por zona
  - Búsqueda semántica

### Procesamiento de Documentos

#### **pdf-parse 1.1.4**
- **Uso**: Extracción de texto de PDFs
- **Módulo**: `src/lib/upload.ts`
- **Limitaciones**: Solo texto, no imágenes

#### **mammoth 1.6.0**
- **Uso**: Conversión de DOCX a HTML/texto
- **Módulo**: `src/lib/upload.ts`
- **Formato**: HTML → texto plano

#### **pdfjs-dist 3.11.174**
- **Uso**: Renderizado de PDFs para OCR
- **Módulo**: `src/lib/ocr.ts`
- **Características**: Conversión PDF → imágenes

#### **node-tesseract-ocr 2.2.1**
- **Uso**: OCR (Optical Character Recognition)
- **Módulo**: `src/lib/ocr.ts`
- **Requisitos**: Tesseract instalado en sistema

#### **canvas 3.2.0**
- **Uso**: Manipulación de imágenes para OCR
- **Módulo**: `src/lib/ocr.ts`
- **Funciones**: Conversión de formatos

### UI Components

#### **@radix-ui/react-*** (varios)
- **Uso**: Componentes accesibles sin estilos
- **Componentes utilizados**:
  - `@radix-ui/react-accordion`
  - `@radix-ui/react-dialog`
  - `@radix-ui/react-select`
  - `@radix-ui/react-tabs`
  - `@radix-ui/react-toast`

#### **lucide-react 0.303.0**
- **Uso**: Iconos SVG
- **Ejemplos**: `MessageSquare`, `Upload`, `Settings`

#### **tailwindcss 3.4.0**
- **Uso**: Framework CSS utility-first
- **Configuración**: `tailwind.config.js`
- **Colores personalizados**: Capital Plus (Navy, Gold)

### Utilidades

#### **tiktoken 1.0.13**
- **Uso**: Tokenización de texto
- **Módulo**: `src/lib/chunker.ts`
- **Modelo**: cl100k_base (GPT-4)

#### **uuid 9.0.1**
- **Uso**: Generación de IDs únicos
- **Módulo**: `src/lib/chunker.ts`
- **Formato**: UUID v4

#### **formidable 3.5.1**
- **Uso**: Parsing de multipart/form-data
- **Módulo**: `src/app/api/upload/route.ts`
- **Características**: Manejo de archivos grandes

#### **zod 3.22.4**
- **Uso**: Validación de esquemas
- **Módulo**: `src/lib/api.ts`
- **Validaciones**: Request/Response types

---

## 📁 Estructura de Archivos

### Directorio Raíz

```
capital-plus-agent/
├── src/                    # Código fuente
├── public/                 # Archivos estáticos
├── migrations/             # Scripts SQL de migración
├── scripts/                # Scripts Node.js
├── docs/                   # Documentación adicional
├── .env                    # Variables de entorno (no versionado)
├── package.json            # Dependencias y scripts
├── tsconfig.json           # Configuración TypeScript
├── tailwind.config.js      # Configuración Tailwind
└── next.config.js          # Configuración Next.js
```

### `src/` - Código Fuente

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API Routes (Backend)
│   │   ├── upload/        # POST /api/upload
│   │   ├── rag-query/     # POST /api/rag-query
│   │   ├── chat-history/  # GET/DELETE /api/chat-history
│   │   ├── documents/     # GET/DELETE /api/documents
│   │   ├── developments/  # GET /api/developments
│   │   ├── agent-config/  # GET/POST/PUT /api/agent-config
│   │   ├── logs/          # GET /api/logs
│   │   ├── stats/         # GET /api/stats
│   │   └── user/          # GET /api/user
│   │
│   ├── dashboard/         # Páginas del Dashboard
│   │   ├── page.tsx       # Dashboard principal
│   │   ├── upload/        # Página de upload
│   │   ├── agent/         # Página de consultas (chat)
│   │   ├── documents/     # Página de documentos
│   │   ├── config/        # Página de configuración
│   │   ├── logs/          # Página de logs
│   │   └── users/         # Página de usuarios (admin)
│   │
│   ├── layout.tsx         # Layout principal
│   └── globals.css        # Estilos globales
│
├── components/            # Componentes React
│   ├── ui/               # Componentes ShadCN UI
│   ├── sidebar.tsx       # Barra lateral de navegación
│   ├── navbar.tsx        # Barra superior
│   ├── stat-card.tsx     # Tarjeta de estadísticas
│   ├── empty-state.tsx   # Estado vacío
│   └── loading.tsx       # Componente de carga
│
├── lib/                  # Librerías y utilidades
│   ├── api.ts            # Cliente API (frontend)
│   ├── postgres.ts       # Cliente PostgreSQL
│   ├── pinecone.ts       # Cliente Pinecone
│   ├── lmstudio.ts       # Cliente LM Studio
│   ├── cache.ts          # Sistema de caché
│   ├── chunker.ts        # División de texto en chunks
│   ├── cleanText.ts      # Limpieza de texto
│   ├── ocr.ts            # Procesamiento OCR
│   ├── systemPrompt.ts   # Prompts del sistema
│   ├── constants.ts      # Constantes (zonas, desarrollos)
│   └── utils.ts          # Utilidades generales
│
└── types/                # Definiciones TypeScript
    ├── documents.ts      # Tipos de documentos y API
    └── index.ts          # Re-exportaciones
```

---

## 🔧 Módulos y Funciones

### `src/lib/postgres.ts` - Cliente PostgreSQL

#### Funciones de Conexión

```typescript
// Ejecuta una query SQL
query<T>(text: string, params?: unknown[]): Promise<QueryResult<T>>

// Obtiene un cliente del pool para transacciones
getClient(): Promise<PoolClient>

// Verifica la conexión
checkConnection(): Promise<boolean>
```

#### Funciones de Usuarios

```typescript
// Obtiene usuario por ID
getUserById(id: number): Promise<User | null>

// Obtiene usuario por email
getUserByEmail(email: string): Promise<User | null>

// Crea un nuevo usuario
createUser(email: string, name: string, roleId: number): Promise<User>

// Obtiene desarrollos accesibles por usuario
getUserDevelopments(userId: number): Promise<UserDevelopment[]>

// Verifica acceso a desarrollo
checkUserAccess(
  userId: number,
  zone: Zone,
  development: string,
  permission: 'can_upload' | 'can_query'
): Promise<boolean>
```

#### Funciones de Permisos

```typescript
// Obtiene todos los roles
getRoles(): Promise<Role[]>

// Verifica si usuario tiene permiso
hasPermission(userId: number, permission: Permission): Promise<boolean>
```

#### Funciones de Documentos

```typescript
// Guarda metadata de documento
saveDocumentMeta(doc: Omit<DocumentMetadata, 'id' | 'created_at'>): Promise<DocumentMetadata>

// Obtiene documento por ID
getDocumentById(id: number): Promise<DocumentMetadata | null>

// Obtiene documentos con filtros
getDocuments(filters: {
  zone?: Zone;
  development?: string;
  type?: DocumentContentType;
  uploaded_by?: number;
}): Promise<DocumentMetadata[]>

// Elimina documento
deleteDocument(id: number): Promise<boolean>
```

#### Funciones de Query Logs

```typescript
// Guarda log de consulta
saveQueryLog(log: Omit<QueryLog, 'id' | 'created_at'>): Promise<QueryLog>

// Obtiene logs con filtros
getQueryLogs(options: {
  userId?: number;
  zone?: Zone;
  development?: string;
  limit?: number;
  offset?: number;
}): Promise<QueryLog[]>

// Elimina logs (no admin)
deleteQueryLogs(options: {
  userId: number;
  zone?: Zone;
  development?: string;
}): Promise<number>
```

#### Funciones de Caché

```typescript
// Busca respuesta en caché
getCachedResponse(
  queryHash: string,
  zone: Zone,
  development: string,
  documentType?: string
): Promise<QueryCacheEntry | null>

// Guarda respuesta en caché
saveCachedResponse(
  entry: Omit<QueryCacheEntry, 'id' | 'created_at' | 'hit_count' | 'last_used_at'>
): Promise<QueryCacheEntry>

// Incrementa contador de hits
incrementCacheHit(cacheId: number): Promise<void>

// Obtiene respuestas similares
getSimilarCachedResponses(
  embeddingIds: string[],
  zone: Zone,
  development: string,
  limit?: number
): Promise<QueryCacheEntry[]>

// Limpia caché expirado
cleanupExpiredCache(): Promise<number>
```

#### Funciones de Configuración

```typescript
// Obtiene valor de configuración
getConfig(key: string): Promise<string | null>

// Obtiene toda la configuración
getAllConfig(): Promise<Record<string, string>>

// Actualiza o crea configuración
setConfig(
  key: string,
  value: string,
  updatedBy: number,
  description?: string
): Promise<AgentConfig>

// Elimina configuración
deleteConfig(key: string): Promise<boolean>
```

### `src/lib/pinecone.ts` - Cliente Pinecone

#### Funciones de Inicialización

```typescript
// Inicializa cliente Pinecone
initPinecone(): Promise<Pinecone>

// Obtiene índice de Pinecone
getPineconeIndex(): Promise<Index<RecordMetadata>>
```

#### Funciones de Embeddings

```typescript
// Genera embedding usando Inference API
// (Interno, usado por queryChunks)
// Modelo: llama-text-embed-v2
// Dimensión: 1024
```

#### Funciones de Upsert

```typescript
// Inserta chunks con vectores en Pinecone
upsertChunksWithVectors(
  namespace: string,
  chunks: Array<{
    id: string;
    values: number[];
    metadata: ChunkMetadata;
  }>
): Promise<number>
```

#### Funciones de Query

```typescript
// Consulta chunks similares
queryChunks(
  namespace: string,
  filter: PineconeFilter,
  queryText: string,
  topK?: number
): Promise<PineconeMatch[]>

// Versión con vector pre-generado
queryChunksWithVector(
  namespace: string,
  filter: PineconeFilter,
  queryVector: number[],
  topK?: number
): Promise<PineconeMatch[]>
```

#### Funciones Auxiliares

```typescript
// Construye contexto desde matches
buildContextFromMatches(matches: PineconeMatch[]): string
```

### `src/lib/lmstudio.ts` - Cliente LM Studio

#### Funciones Principales

```typescript
// Ejecuta consulta al LLM
runLLM(
  messages: LMStudioMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    model?: string;
  }
): Promise<string>

// Ejecuta consulta RAG con contexto
runRAGQuery(
  query: string,
  context: string,
  queryType?: string
): Promise<string>

// Ejecuta consulta simple (sin RAG)
runSimpleQuery(query: string): Promise<string>

// Verifica salud del servidor
checkLMStudioHealth(): Promise<boolean>

// Obtiene modelos disponibles
getAvailableModels(): Promise<string[]>
```

#### Configuración

- **Base URL**: `http://localhost:1234/v1`
- **Modelo por defecto**: `llama-3.2-3B-Instruct`
- **Temperature**: 0.2 (configurable)
- **Max Tokens**: 2048 (configurable)

### `src/lib/cache.ts` - Sistema de Caché

#### Funciones Principales

```typescript
// Genera hash MD5 de query normalizado
generateQueryHash(query: string): string

// Busca respuesta en caché (hash + semántica)
findCachedResponse(
  query: string,
  zone: Zone,
  development: string,
  documentType?: DocumentContentType
): Promise<{ entry: QueryCacheEntry; similarity: number } | null>

// Guarda respuesta en caché
saveToCache(
  query: string,
  zone: Zone,
  development: string,
  response: string,
  sources: SourceReference[],
  documentType?: DocumentContentType
): Promise<void>

// Limpia caché expirado
cleanupCache(): Promise<number>
```

#### Configuración

- **Namespace Pinecone**: `cache`
- **Umbral de similitud**: 0.85 (85%)
- **Expiración**: 30 días (configurable)

### `src/lib/chunker.ts` - División de Texto

#### Funciones Principales

```typescript
// Divide texto en chunks
chunkText(
  text: string,
  options?: {
    chunkSize?: number;
    chunkOverlap?: number;
    useTokens?: boolean;
  }
): TextChunk[]

// Calcula tokens de texto
countTokens(text: string): number
```

#### Configuración

- **Chunk Size**: 500 caracteres (configurable)
- **Chunk Overlap**: 50 caracteres (configurable)
- **Tokenizer**: tiktoken (cl100k_base)

### `src/lib/cleanText.ts` - Limpieza de Texto

#### Funciones Principales

```typescript
// Limpia texto de caracteres especiales
cleanText(text: string): string

// Genera preview de texto
generatePreview(text: string, maxLength: number): string

// Normaliza espacios
normalizeSpaces(text: string): string
```

### `src/lib/ocr.ts` - Procesamiento OCR

#### Funciones Principales

```typescript
// Extrae texto de PDF usando OCR
extractTextFromPDFWithOCR(
  pdfBuffer: Buffer,
  options?: {
    pages?: number[];
    language?: string;
  }
): Promise<string>

// Convierte PDF a imágenes
pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]>

// Procesa imagen con Tesseract
processImageWithOCR(imageBuffer: Buffer, language?: string): Promise<string>
```

#### Requisitos

- **Tesseract OCR**: Instalado en sistema
- **Idioma por defecto**: `spa` (español)
- **Formato de salida**: Texto plano

### `src/lib/api.ts` - Cliente API (Frontend)

#### Funciones de Upload

```typescript
uploadDocument(formData: FormData): Promise<UploadResponse>
```

#### Funciones de Query

```typescript
queryAgent(data: RAGQueryRequest): Promise<RAGQueryResponse>
```

#### Funciones de Chat History

```typescript
getChatHistory(params: GetChatHistoryParams): Promise<QueryLog[]>

deleteChatHistory(params: DeleteChatHistoryParams): Promise<{ deletedCount: number }>
```

#### Funciones de Documentos

```typescript
getDocuments(params?: GetDocumentsParams): Promise<DocumentMetadata[]>

deleteDocument(id: number, userId: number): Promise<void>
```

#### Funciones de Configuración

```typescript
getAgentConfig(): Promise<AgentSettings>

updateAgentConfig(key: string, value: string | number, updatedBy: number): Promise<void>

updateMultipleConfig(configs: Array<{ key: string; value: string | number }>, updatedBy: number): Promise<void>
```

#### Funciones de Usuario

```typescript
getUser(userId: number): Promise<User>
```

---

## 🌐 APIs y Endpoints

### `POST /api/upload` - Subir Documento

**Request:**
```typescript
FormData {
  file: File;
  zone: string;
  development: string;
  type: string;
  uploaded_by: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  message?: string;
  chunks?: number;
  pinecone_namespace?: string;
  document_id?: number;
  error?: string;
}
```

**Flujo:**
1. Valida archivo (PDF, CSV, DOCX)
2. Extrae texto (PDF → pdf-parse, DOCX → mammoth, CSV → parse)
3. Limpia texto
4. Divide en chunks
5. Genera embeddings (Pinecone Inference API)
6. Guarda en Pinecone (namespace = zone)
7. Guarda metadata en PostgreSQL
8. Retorna resultado

### `POST /api/rag-query` - Consulta RAG

**Request:**
```typescript
{
  query: string;
  zone: Zone;
  development: string;
  type?: DocumentContentType;
  userId: number;
}
```

**Response:**
```typescript
{
  success: boolean;
  answer?: string;
  sources?: SourceReference[];
  error?: string;
  query_log_id?: number;
}
```

**Flujo:**
1. Valida request
2. Verifica permisos
3. Detecta si es consulta simple (saludo)
4. **Si simple**: Responde directo con `runSimpleQuery()`
5. **Si compleja**:
   - Busca en caché
   - Si no hay caché:
     - Busca en Pinecone
     - Construye contexto
     - Envía a LM Studio
     - Guarda en caché
6. Guarda log
7. Retorna respuesta

### `GET /api/chat-history` - Historial de Chat

**Query Params:**
- `userId` (requerido)
- `zone` (opcional)
- `development` (opcional)
- `limit` (opcional, default: 50)
- `offset` (opcional, default: 0)

**Response:**
```typescript
{
  success: boolean;
  data: QueryLog[];
}
```

### `DELETE /api/chat-history` - Eliminar Historial

**Query Params:**
- `userId` (requerido)
- `zone` (opcional)
- `development` (opcional)

**Response:**
```typescript
{
  success: boolean;
  data: { deletedCount: number };
  message?: string;
}
```

**Nota**: Los administradores no pueden eliminar historial.

### `GET /api/documents` - Listar Documentos

**Query Params:**
- `zone` (opcional)
- `development` (opcional)
- `type` (opcional)
- `limit` (opcional)
- `offset` (opcional)

**Response:**
```typescript
{
  success: boolean;
  data: DocumentMetadata[];
}
```

### `DELETE /api/documents/[id]` - Eliminar Documento

**Query Params:**
- `userId` (requerido)

**Response:**
```typescript
{
  success: boolean;
  message?: string;
  error?: string;
}
```

### `GET /api/developments` - Obtener Desarrollos

**Response:**
```typescript
{
  success: boolean;
  data: DevelopmentsByZone;
}
```

### `GET /api/agent-config` - Obtener Configuración

**Response:**
```typescript
{
  success: boolean;
  data: AgentSettings;
}
```

### `POST /api/agent-config` - Actualizar Configuración

**Request:**
```typescript
{
  key: string;
  value: string;
  updated_by: number;
}
```

### `PUT /api/agent-config` - Actualizar Múltiples Configuraciones

**Request:**
```typescript
{
  configs: Array<{ key: string; value: string | number }>;
  updated_by: number;
}
```

### `GET /api/logs` - Obtener Logs

**Query Params:**
- `userId` (opcional)
- `zone` (opcional)
- `actionType` (opcional)
- `resourceType` (opcional)
- `limit` (opcional)
- `offset` (opcional)

**Response:**
```typescript
{
  success: boolean;
  data: {
    queries: QueryLog[];
    actions: ActionLog[];
  };
}
```

### `GET /api/stats` - Estadísticas del Dashboard

**Response:**
```typescript
{
  success: boolean;
  data: {
    totalDocuments: number;
    totalQueriesThisMonth: number;
    averageResponseTime: number;
    averageRating: number;
  };
}
```

### `GET /api/user` - Obtener Usuario

**Query Params:**
- `userId` (requerido)

**Response:**
```typescript
{
  success: boolean;
  data: User;
}
```

---

## 🗄️ Base de Datos

### Esquema de Tablas

#### `users` - Usuarios del Sistema

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES roles(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `roles` - Roles del Sistema

```sql
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT
);
```

**Roles disponibles:**
- `admin` - Acceso total
- `manager` - Gestión de desarrollos
- `sales` - Equipo de ventas
- `support` - Soporte al cliente
- `viewer` - Solo lectura

#### `permissions` - Permisos

```sql
CREATE TABLE permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);
```

**Permisos disponibles:**
- `upload_documents`
- `delete_documents`
- `query_agent`
- `manage_users`
- `manage_config`
- `view_logs`
- `manage_developments`

#### `role_permissions` - Relación Roles-Permisos

```sql
CREATE TABLE role_permissions (
    role_id INTEGER REFERENCES roles(id),
    permission_id INTEGER REFERENCES permissions(id),
    PRIMARY KEY (role_id, permission_id)
);
```

#### `user_developments` - Acceso a Desarrollos

```sql
CREATE TABLE user_developments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    can_upload BOOLEAN DEFAULT false,
    can_query BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, zone, development)
);
```

#### `documents_meta` - Metadata de Documentos

```sql
CREATE TABLE documents_meta (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    uploaded_by INTEGER REFERENCES users(id),
    pinecone_namespace VARCHAR(255) NOT NULL,
    tags TEXT[],
    file_size_bytes BIGINT,
    chunks_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `query_logs` - Logs de Consultas

```sql
CREATE TABLE query_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    query TEXT NOT NULL,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    response TEXT,
    sources_used TEXT[],
    response_time_ms INTEGER,
    tokens_used INTEGER,
    feedback_rating INTEGER CHECK (feedback_rating >= 1 AND feedback_rating <= 5),
    feedback_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

#### `query_cache` - Caché de Respuestas

```sql
CREATE TABLE query_cache (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64) NOT NULL,
    zone VARCHAR(100) NOT NULL,
    development VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),
    response TEXT NOT NULL,
    sources_used TEXT[],
    embedding_id VARCHAR(255),
    hit_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(query_hash, zone, development, document_type)
);
```

#### `agent_config` - Configuración del Agente

```sql
CREATE TABLE agent_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

**Configuraciones disponibles:**
- `temperature` - Creatividad del LLM (0.0-1.0)
- `top_k` - Número de resultados a recuperar
- `chunk_size` - Tamaño de chunks
- `chunk_overlap` - Solapamiento de chunks
- `max_tokens` - Tokens máximos de respuesta
- `system_prompt` - Prompt del sistema

#### `action_logs` - Logs de Acciones Administrativas

```sql
CREATE TABLE action_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action_type VARCHAR(50) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id INTEGER,
    zone VARCHAR(100),
    development VARCHAR(255),
    description TEXT NOT NULL,
    metadata JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔄 Flujos de Trabajo

### Flujo de Upload de Documento

```
1. Usuario selecciona archivo (PDF/CSV/DOCX)
   ↓
2. Frontend envía FormData a /api/upload
   ↓
3. Backend valida archivo y permisos
   ↓
4. Extrae texto según tipo:
   - PDF → pdf-parse
   - DOCX → mammoth → HTML → texto
   - CSV → parse directo
   ↓
5. Limpia texto (caracteres especiales, espacios)
   ↓
6. Divide en chunks (500 chars, 50 overlap)
   ↓
7. Para cada chunk:
   - Genera embedding (Pinecone Inference API)
   - Crea metadata (zona, desarrollo, tipo, página)
   ↓
8. Inserta en Pinecone (namespace = zone)
   ↓
9. Guarda metadata en PostgreSQL
   ↓
10. Retorna resultado al frontend
```

### Flujo de Consulta RAG

```
1. Usuario escribe pregunta
   ↓
2. Frontend envía a /api/rag-query
   ↓
3. Backend valida y verifica permisos
   ↓
4. Detecta tipo de consulta:
   ├─ Simple (saludo) → runSimpleQuery() → Respuesta directa
   └─ Compleja → Continúa
   ↓
5. Busca en caché:
   ├─ Hash exacto → Retorna inmediatamente
   └─ Similitud semántica (≥85%) → Retorna
   ↓
6. Si no hay caché:
   ├─ Genera embedding del query
   ├─ Busca en Pinecone (namespace = zone)
   ├─ Filtra por desarrollo y tipo
   ├─ Obtiene top K resultados
   ↓
7. Construye contexto desde matches
   ↓
8. Envía a LM Studio:
   ├─ System prompt (según tipo)
   ├─ Contexto recuperado
   ├─ Pregunta del usuario
   ↓
9. LLM genera respuesta
   ↓
10. Guarda en caché (para futuras consultas)
   ↓
11. Guarda log en PostgreSQL
   ↓
12. Retorna respuesta con fuentes
```

### Flujo de Caché

```
1. Query recibido
   ↓
2. Normaliza query (lowercase, trim, espacios)
   ↓
3. Genera hash MD5
   ↓
4. Busca en PostgreSQL por hash exacto
   ├─ Encontrado → Incrementa hits → Retorna
   └─ No encontrado → Continúa
   ↓
5. Genera embedding del query
   ↓
6. Busca en Pinecone (namespace: cache)
   ├─ Filtra por zona y desarrollo
   ├─ Top 5 similares
   ↓
7. Si similitud ≥ 85%:
   ├─ Busca entrada en PostgreSQL
   ├─ Incrementa hits
   └─ Retorna respuesta
   ↓
8. Si no hay caché:
   ├─ Procesa query normalmente
   ├─ Guarda respuesta en caché
   └─ Guarda embedding en Pinecone
```

---

## ⚙️ Configuración Avanzada

### Variables de Entorno

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=tu_password
POSTGRES_DB=capital_plus_agent

# Pinecone
PINECONE_API_KEY=tu_api_key
PINECONE_INDEX_NAME=capitalplus-rag

# LM Studio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# Configuración de Chunks
CHUNK_SIZE=500
CHUNK_OVERLAP=50

# OCR (opcional)
TESSERACT_LANG=spa
```

### Configuración de Pinecone

- **Modelo de Embedding**: `llama-text-embed-v2`
- **Dimensión**: 1024
- **Métrica**: Cosine similarity
- **Namespaces**: Uno por zona (yucatan, puebla, etc.)
- **Namespace especial**: `cache` (para caché de queries)

### Configuración de LM Studio

- **Modelo recomendado**: `llama-3.2-3B-Instruct-Q4_K_M`
- **Puerto**: 1234
- **API**: Compatible con OpenAI
- **Temperature**: 0.2 (configurable en DB)
- **Max Tokens**: 2048 (configurable en DB)

### Configuración de Chunks

- **Tamaño**: 500 caracteres (configurable)
- **Solapamiento**: 50 caracteres (configurable)
- **Método**: Por caracteres o tokens (tiktoken)
- **Metadata**: Incluye página, chunk number, filename

### Configuración de Caché

- **Umbral de similitud**: 0.85 (85%)
- **Expiración**: 30 días (configurable)
- **Top K búsqueda**: 5 resultados
- **Namespace Pinecone**: `cache`

---

## 🧪 Testing y Debugging

### Logs del Sistema

El sistema genera logs detallados:

```
🔍 Query recibida: "..." por usuario X
💬 Consulta simple detectada...
📚 Consulta compleja, usando RAG...
✅ Caché HIT (exacto): "..."
❌ Caché MISS: "..."
📊 Buscando en Pinecone: namespace=...
✅ Encontrados X resultados
🤖 Enviando a LM Studio...
✅ Respuesta recibida
💾 Respuesta guardada en caché
📝 Query log guardado, ID: X, Tiempo: Xms
```

### Debugging

1. **Verificar conexión PostgreSQL**:
   ```typescript
   await checkConnection()
   ```

2. **Verificar Pinecone**:
   ```typescript
   const client = await initPinecone()
   const index = await getPineconeIndex()
   ```

3. **Verificar LM Studio**:
   ```typescript
   const health = await checkLMStudioHealth()
   ```

4. **Ver logs en consola**:
   - Backend: Logs en terminal de Next.js
   - Frontend: Console del navegador

---

## 📝 Notas Técnicas

### Limitaciones Conocidas

1. **PDFs con imágenes**: Requieren OCR (más lento)
2. **Tamaño de archivo**: Limitado por memoria del servidor
3. **Tokens**: Modelo 3B tiene límite de contexto
4. **Caché**: Requiere espacio en Pinecone

### Mejoras Futuras

1. Streaming de respuestas del LLM
2. Búsqueda híbrida (keyword + semántica)
3. Re-ranking de resultados
4. Caché distribuido (Redis)
5. Webhooks para notificaciones
6. API GraphQL

---

**Última actualización**: Diciembre 2024
**Versión**: 1.0.0
**Mantenido por**: Equipo de Desarrollo Capital Plus

