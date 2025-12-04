# 🏠 Capital Plus AI Agent - Frontend & Backend

Sistema completo de Agente de IA para **Capital Plus**, construido con Next.js 14, TypeScript, Pinecone, PostgreSQL y LM Studio.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tecnologías](#-tecnologías)
- [Instalación](#-instalación)
- [Configuración](#️-configuración)
- [Uso](#-uso)
- [Estructura](#-estructura)

## ✨ Características

### Backend
- ✅ **Upload de Documentos** - PDF, CSV, DOCX con procesamiento automático
- ✅ **RAG (Retrieval Augmented Generation)** - Búsqueda semántica con Pinecone
- ✅ **LM Studio Integration** - LLM local para privacidad
- ✅ **PostgreSQL** - Gestión de usuarios, roles y logs
- ✅ **Sistema de Permisos** - Control granular por zona y desarrollo

### Frontend
- ✅ **Dashboard Moderno** - Interfaz limpia con colores corporativos
- ✅ **Upload UI** - Drag & drop con preview y progress
- ✅ **Query Agent** - Interface conversacional con contexto RAG
- ✅ **Documents Browser** - Gestión y filtrado de documentos
- ✅ **Configuration Panel** - Ajuste de parámetros del agente
- ✅ **Logs Viewer** - Historial de consultas con paginación

## 🚀 Tecnologías

| Categoría | Tecnología |
|-----------|------------|
| **Framework** | Next.js 14 (App Router) |
| **Language** | TypeScript |
| **Styling** | TailwindCSS + ShadCN UI |
| **Vector DB** | Pinecone (llama-text-embed-v2) |
| **Database** | PostgreSQL |
| **LLM** | LM Studio (llama-3.2-3B) |
| **Forms** | React Hook Form + Zod |

## 📦 Instalación

### 1. Clonar e instalar dependencias

```bash
git clone <repo-url>
cd capital-plus-agent
npm install
```

### 2. Configurar variables de entorno

Copia `env.example.txt` a `.env` y configura:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=tu_usuario
POSTGRES_PASSWORD=tu_password
POSTGRES_DB=capital_plus_agent

# Pinecone
PINECONE_API_KEY=tu_api_key
PINECONE_INDEX_NAME=capital-plus-docs

# LM Studio
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# App
CHUNK_SIZE=500
CHUNK_OVERLAP=50
```

### 3. Crear base de datos

```bash
# En PostgreSQL
createdb capital_plus_agent

# Ejecutar migraciones
npm run db:migrate -- reset

# (Opcional) Insertar datos de prueba
npm run db:seed
```

### 4. Iniciar LM Studio

1. Descargar [LM Studio](https://lmstudio.ai/)
2. Cargar modelo: `llama-3.2-3B-Instruct-Q4_K_M`
3. Iniciar servidor local en puerto `1234`

### 5. Iniciar aplicación

```bash
npm run dev
```

Accede a: `http://localhost:3000`

## ⚙️ Configuración

### Colores Corporativos

Los colores de Capital Plus están definidos en `tailwind.config.js`:

- **Navy**: `#0B1F3A` - Color primario
- **Gold**: `#C4A062` - Acentos
- **Gray**: `#F5F5F5` - Fondos

### Zonas y Desarrollos

Edita `src/lib/constants.ts` para agregar zonas/desarrollos:

```typescript
export const DEVELOPMENTS = {
  yucatan: [
    { value: 'amura', label: 'Amura' },
    { value: 'm2', label: 'M2' },
    // ...
  ],
  // ...
};
```

## 📖 Uso

### 1. Subir Documentos

1. Ve a **Subir Documentos**
2. Selecciona **Zona** y **Desarrollo**
3. Elige **Tipo de documento**
4. Sube PDF, CSV o DOCX
5. El sistema automáticamente:
   - Extrae el texto
   - Limpia y procesa
   - Crea chunks
   - Genera embeddings
   - Guarda en Pinecone

### 2. Consultar Agente

1. Ve a **Consultar Agente**
2. Escribe tu pregunta
3. Selecciona **Zona** y **Desarrollo**
4. (Opcional) Filtra por **Tipo de documento**
5. Click en **Consultar**
6. El agente:
   - Busca contexto relevante
   - Envía al LLM
   - Retorna respuesta con fuentes

### 3. Ver Documentos

- **Documentos** → Filtra y busca documentos procesados
- Click en documentos para ver metadata

### 4. Configurar Agente

- **Configuración** → Ajusta:
  - Temperature (creatividad)
  - Top K (resultados a recuperar)
  - Chunk size
  - Max tokens

### 5. Ver Logs

- **Logs** → Historial de consultas
- Filtra por zona
- Ve tiempos de respuesta

## 📁 Estructura

```
/src
  /app
    /api                    # API Routes
      /upload              → Subir documentos
      /rag-query           → Consultas RAG
      /developments        → Zonas/desarrollos
      /agent-config        → Configuración
      /documents           → Listar documentos
      /logs                → Logs de consultas
    /dashboard            # Frontend
      /page.tsx            → Dashboard principal
      /upload/page.tsx     → Upload UI
      /agent/page.tsx      → Query UI
      /documents/page.tsx  → Browser
      /config/page.tsx     → Configuration
      /logs/page.tsx       → Logs
      /users/page.tsx      → Users (admin)
  /components
    /ui                    # ShadCN components
    /sidebar.tsx           # Navegación
    /navbar.tsx            # Header
  /lib
    /api.ts                # API client
    /pinecone.ts           # Pinecone client
    /lmstudio.ts           # LM Studio client
    /postgres.ts           # PostgreSQL client
    /chunker.ts            # Text chunking
    /cleanText.ts          # Text cleaning
    /constants.ts          # Constants
    /utils.ts              # Utilities
  /types
    /documents.ts          # TypeScript types
```

## 🔐 Roles y Permisos

| Rol | Permisos |
|-----|----------|
| **CEO** | Acceso total |
| **Admin** | Gestión completa |
| **Sales Manager** | Upload, Query, View |
| **Sales Agent** | Query, View |
| **Post-Sales** | Query, View |
| **Legal Manager** | Upload, Query, View |
| **Marketing Manager** | Upload, Query, View |

## 🎨 UI/UX

- **Sidebar fijo** - Navegación persistente
- **Colores corporativos** - Navy & Gold
- **Responsive** - Mobile-friendly
- **Toasts** - Notificaciones elegantes
- **Loading states** - Feedback visual
- **Badges y tags** - Información clara

## 📊 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/upload` | Subir documento |
| `POST` | `/api/rag-query` | Consultar agente |
| `GET` | `/api/developments` | Obtener desarrollos |
| `GET/POST/PUT/DELETE` | `/api/agent-config` | Configuración |
| `GET` | `/api/documents` | Listar documentos |
| `GET` | `/api/logs` | Obtener logs |

## 🔧 Scripts

```bash
npm run dev         # Desarrollo
npm run build       # Build producción
npm run start       # Servidor producción
npm run lint        # Linter
npm run db:migrate  # Migrar DB
npm run db:seed     # Seed DB
```

## 🐛 Troubleshooting

### LM Studio no conecta

- Verifica que esté corriendo en `localhost:1234`
- Revisa que el modelo esté cargado
- Check firewall/antivirus

### Error en migraciones

```bash
# Reset completo
npm run db:migrate -- reset
```

### Pinecone no conecta

- Verifica API key en `.env`
- Confirma que el índice existe
- Check límites de plan

---

**Capital Plus** © 2024 - Sistema Interno de IA
