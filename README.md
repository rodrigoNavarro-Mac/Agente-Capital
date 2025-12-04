# 🤖 Agente Capital - Sistema de IA para Capital Plus

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/rodrigoNavarro-Mac/Agente-Capital)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

Sistema completo de Agente de IA para **Capital Plus**, construido con Next.js 14, TypeScript, Pinecone, PostgreSQL y múltiples proveedores de LLM. Sistema RAG (Retrieval Augmented Generation) para consultas inteligentes sobre documentos corporativos.

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tecnologías](#-tecnologías)
- [Instalación](#-instalación)
- [Configuración](#️-configuración)
- [Uso](#-uso)
- [Estructura del Proyecto](#-estructura-del-proyecto)
- [API Endpoints](#-api-endpoints)
- [Roles y Permisos](#-roles-y-permisos)
- [Despliegue](#-despliegue)
- [Contribuir](#-contribuir)

## ✨ Características

### 🎯 Funcionalidades Principales

- ✅ **Upload de Documentos** - Procesamiento automático de PDF, CSV, DOCX con extracción de texto
- ✅ **RAG (Retrieval Augmented Generation)** - Búsqueda semántica con Pinecone y HuggingFace
- ✅ **Múltiples Proveedores LLM** - Soporte para LM Studio (local), OpenAI, y más
- ✅ **Sistema de Autenticación** - Login, registro, recuperación de contraseña con JWT
- ✅ **Gestión de Usuarios** - CRUD completo con roles y permisos granulares
- ✅ **Integración Zoho CRM** - Sincronización de leads, deals y pipelines
- ✅ **Sistema de Logs** - Historial completo de consultas y acciones
- ✅ **Cache Inteligente** - Optimización de consultas frecuentes
- ✅ **Sistema de Feedback** - Aprendizaje continuo del agente

### 🎨 Frontend

- ✅ **Dashboard Moderno** - Interfaz limpia con colores corporativos (Navy & Gold)
- ✅ **Upload UI** - Drag & drop con preview y progress bars
- ✅ **Query Agent** - Interface conversacional con contexto RAG y fuentes
- ✅ **Documents Browser** - Gestión y filtrado avanzado de documentos
- ✅ **Configuration Panel** - Ajuste dinámico de parámetros del agente
- ✅ **Logs Viewer** - Historial de consultas con paginación y filtros
- ✅ **User Management** - Panel de administración de usuarios
- ✅ **Zoho Integration** - Dashboard de sincronización con CRM

### 🔐 Seguridad

- ✅ **Autenticación JWT** - Tokens seguros con refresh automático
- ✅ **Sistema de Roles** - 7 roles predefinidos con permisos específicos
- ✅ **Control de Acceso** - Permisos por zona y desarrollo
- ✅ **Encriptación** - Passwords hasheados con bcrypt
- ✅ **Validación** - Input sanitization y validación con Zod

## 🚀 Tecnologías

| Categoría | Tecnología | Versión |
|-----------|------------|---------|
| **Framework** | Next.js | 14.2.0 |
| **Language** | TypeScript | 5.3.3 |
| **Styling** | TailwindCSS + ShadCN UI | 3.4.0 |
| **Vector DB** | Pinecone | 3.0.0 |
| **Embeddings** | HuggingFace Inference API | 4.13.4 |
| **Database** | PostgreSQL | 8.11.3 |
| **LLM Local** | LM Studio | - |
| **LLM Cloud** | OpenAI | 6.9.1 |
| **Forms** | React Hook Form + Zod | 7.49.3 |
| **Auth** | JWT (jsonwebtoken) | 9.0.2 |
| **PDF Processing** | pdf-parse, pdfjs-dist | 1.1.4, 3.11.174 |
| **CRM Integration** | Zoho CRM API | - |

## 📦 Instalación

### Prerrequisitos

- Node.js >= 18.17.0
- PostgreSQL >= 12
- Cuenta de Pinecone (gratis)
- Cuenta de HuggingFace (gratis - 30,000 requests/mes)
- (Opcional) LM Studio para LLM local
- (Opcional) OpenAI API key para LLM en la nube

### 1. Clonar el Repositorio

```bash
git clone https://github.com/rodrigoNavarro-Mac/Agente-Capital.git
cd Agente-Capital
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Copia el archivo de plantilla y completa tus valores:

```bash
# Windows (PowerShell)
Copy-Item ENV_TEMPLATE.txt .env

# Mac/Linux
cp ENV_TEMPLATE.txt .env
```

Edita el archivo `.env` con tus credenciales:

```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=capital_user
POSTGRES_PASSWORD=capital_pass
POSTGRES_DB=capital_plus_agent

# Pinecone (REQUERIDO)
# IMPORTANTE: El índice debe tener 384 dimensiones
PINECONE_API_KEY=tu-pinecone-api-key-aqui
PINECONE_INDEX_NAME=capitalplus-rag

# HuggingFace (REQUERIDO - ¡GRATIS!)
# Obtén tu API key en: https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY=tu-huggingface-api-key-aqui

# LM Studio (Opcional - para LLM local)
LMSTUDIO_BASE_URL=http://localhost:1234/v1
LMSTUDIO_MODEL=llama-3.2-3B-Instruct-Q4_K_M

# OpenAI (Opcional - para LLM en la nube)
OPENAI_API_KEY=tu-openai-api-key-aqui
OPENAI_MODEL=gpt-4o-mini

# Zoho CRM (Opcional - solo para producción)
ZOHO_CLIENT_ID=tu-zoho-client-id
ZOHO_CLIENT_SECRET=tu-zoho-client-secret
ZOHO_REFRESH_TOKEN=tu-zoho-refresh-token
```

### 4. Configurar Pinecone

**IMPORTANTE:** El índice debe tener **384 dimensiones** (no 1024).

1. Ve a [Pinecone Console](https://app.pinecone.io/)
2. Crea un nuevo índice con:
   - **Name:** `capitalplus-rag`
   - **Dimensions:** `384` ⚠️
   - **Metric:** `cosine`
   - **Cloud:** AWS
   - **Region:** us-east-1

### 5. Configurar Base de Datos

```bash
# Crear base de datos (si no existe)
createdb capital_plus_agent

# Ejecutar migraciones
npm run db:migrate:all

# (Opcional) Insertar datos de prueba
npm run db:seed

# (Opcional) Configurar contraseña de admin
npm run db:set-admin-password
```

### 6. Iniciar la Aplicación

```bash
# Modo desarrollo
npm run dev
```

La aplicación estará disponible en: `http://localhost:3000`

### 7. (Opcional) Iniciar LM Studio

Si quieres usar un LLM local:

1. Descargar [LM Studio](https://lmstudio.ai/)
2. Cargar modelo: `llama-3.2-3B-Instruct-Q4_K_M`
3. Iniciar servidor local en puerto `1234`

## ⚙️ Configuración

### Colores Corporativos

Los colores de Capital Plus están definidos en `tailwind.config.js`:

- **Navy**: `#0B1F3A` - Color primario
- **Gold**: `#C4A062` - Acentos y highlights
- **Gray**: `#F5F5F5` - Fondos y backgrounds

### Zonas y Desarrollos

Edita `src/lib/constants.ts` para agregar zonas y desarrollos:

```typescript
export const DEVELOPMENTS = {
  yucatan: [
    { value: 'amura', label: 'Amura' },
    { value: 'm2', label: 'M2' },
    // Agrega más desarrollos...
  ],
  // Agrega más zonas...
};
```

### Configuración del Agente

Puedes ajustar los parámetros del agente desde la interfaz web o directamente en la base de datos:

- **Temperature**: Controla la creatividad (0.0 - 1.0)
- **Top K**: Número de chunks a recuperar
- **Chunk Size**: Tamaño de los fragmentos de texto
- **Max Tokens**: Límite de tokens en la respuesta

## 📖 Uso

### 1. Subir Documentos

1. Ve a **Dashboard > Upload**
2. Selecciona **Zona** y **Desarrollo**
3. Elige **Tipo de documento**
4. Sube PDF, CSV o DOCX (drag & drop o click)
5. El sistema automáticamente:
   - Extrae el texto del documento
   - Limpia y procesa el contenido
   - Crea chunks con overlap
   - Genera embeddings con HuggingFace
   - Guarda en Pinecone
   - Registra en PostgreSQL

### 2. Consultar al Agente

1. Ve a **Dashboard > Agent**
2. Escribe tu pregunta en el chat
3. Selecciona **Zona** y **Desarrollo**
4. (Opcional) Filtra por **Tipo de documento**
5. Click en **Consultar**
6. El agente:
   - Busca contexto relevante en Pinecone
   - Construye el prompt con contexto
   - Envía al LLM (LM Studio u OpenAI)
   - Retorna respuesta con fuentes citadas
   - Guarda la consulta en logs

### 3. Gestionar Documentos

- **Dashboard > Documents** → Filtra y busca documentos procesados
- Click en documentos para ver metadata detallada
- Visualiza chunks asociados
- Elimina documentos si es necesario

### 4. Configurar el Agente

- **Dashboard > Config** → Ajusta:
  - Temperature (creatividad)
  - Top K (resultados a recuperar)
  - Chunk size y overlap
  - Max tokens
  - Proveedor de LLM

### 5. Ver Logs y Estadísticas

- **Dashboard > Logs** → Historial completo de consultas
- Filtra por zona, desarrollo, usuario
- Ve tiempos de respuesta
- Analiza feedback y ratings

### 6. Gestionar Usuarios (Admin)

- **Dashboard > Users** → CRUD completo de usuarios
- Asigna roles y permisos
- Gestiona zonas y desarrollos por usuario
- Cambia contraseñas

### 7. Integración Zoho CRM (Producción)

- **Dashboard > Zoho** → Sincronización con CRM
- Visualiza leads y deals
- Sincroniza pipelines
- Estadísticas de CRM

## 📁 Estructura del Proyecto

```
Agente-Capital/
├── src/
│   ├── app/
│   │   ├── api/                    # API Routes
│   │   │   ├── auth/              # Autenticación
│   │   │   ├── documents/         # Gestión de documentos
│   │   │   ├── rag-query/         # Consultas RAG
│   │   │   ├── upload/            # Upload de archivos
│   │   │   ├── users/             # Gestión de usuarios
│   │   │   ├── zoho/              # Integración Zoho CRM
│   │   │   └── ...
│   │   ├── dashboard/             # Frontend Dashboard
│   │   │   ├── agent/            # Interfaz de consulta
│   │   │   ├── documents/        # Explorador de documentos
│   │   │   ├── upload/           # Upload UI
│   │   │   ├── config/           # Configuración
│   │   │   ├── logs/             # Visor de logs
│   │   │   ├── users/            # Gestión de usuarios
│   │   │   └── zoho/             # Dashboard Zoho
│   │   ├── login/                # Página de login
│   │   └── layout.tsx            # Layout principal
│   ├── components/
│   │   ├── ui/                   # Componentes ShadCN
│   │   ├── sidebar.tsx           # Navegación lateral
│   │   ├── navbar.tsx            # Barra superior
│   │   └── ...
│   ├── lib/
│   │   ├── postgres.ts           # Cliente PostgreSQL
│   │   ├── pinecone.ts           # Cliente Pinecone
│   │   ├── llm-provider.ts       # Proveedores LLM
│   │   ├── chunker.ts            # Text chunking
│   │   ├── auth.ts               # Autenticación
│   │   ├── cache.ts              # Sistema de cache
│   │   └── ...
│   └── types/
│       └── ...                   # TypeScript types
├── migrations/                   # Scripts de migración SQL
├── scripts/                      # Scripts utilitarios
├── docs/                         # Documentación adicional
├── .env                          # Variables de entorno (no commitear)
└── package.json
```

## 📊 API Endpoints

### Autenticación

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Iniciar sesión |
| `POST` | `/api/auth/logout` | Cerrar sesión |
| `POST` | `/api/auth/refresh` | Refrescar token |
| `POST` | `/api/auth/forgot-password` | Recuperar contraseña |
| `POST` | `/api/auth/reset-password` | Resetear contraseña |
| `POST` | `/api/auth/change-password` | Cambiar contraseña |

### Documentos

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/upload` | Subir documento |
| `GET` | `/api/documents` | Listar documentos |
| `GET` | `/api/documents/[id]` | Obtener documento |
| `DELETE` | `/api/documents/[id]` | Eliminar documento |
| `GET` | `/api/documents/[id]/chunks` | Obtener chunks |

### RAG y Consultas

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/api/rag-query` | Consultar al agente |
| `POST` | `/api/rag-feedback` | Enviar feedback |

### Configuración

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/agent-config` | Obtener configuración |
| `POST` | `/api/agent-config` | Actualizar configuración |

### Usuarios

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/users` | Listar usuarios |
| `POST` | `/api/users` | Crear usuario |
| `GET` | `/api/users/[id]` | Obtener usuario |
| `PUT` | `/api/users/[id]` | Actualizar usuario |
| `DELETE` | `/api/users/[id]` | Eliminar usuario |

### Zoho CRM

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/zoho/leads` | Obtener leads |
| `GET` | `/api/zoho/deals` | Obtener deals |
| `GET` | `/api/zoho/pipelines` | Obtener pipelines |
| `GET` | `/api/zoho/stats` | Estadísticas CRM |

## 🔐 Roles y Permisos

| Rol | Permisos | Descripción |
|-----|----------|-------------|
| **CEO** | Acceso total | Acceso completo a todas las funcionalidades |
| **Admin** | Gestión completa | Gestión de usuarios, configuración, documentos |
| **Sales Manager** | Upload, Query, View | Puede subir documentos y consultar |
| **Sales Agent** | Query, View | Solo consultas y visualización |
| **Post-Sales** | Query, View | Consultas y visualización |
| **Legal Manager** | Upload, Query, View | Gestión legal de documentos |
| **Marketing Manager** | Upload, Query, View | Gestión de marketing |

Los permisos se aplican por **Zona** y **Desarrollo**, permitiendo control granular del acceso.

## 🚀 Despliegue

### Opción 1: Vercel (Recomendado)

1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno
3. Deploy automático en cada push

### Opción 2: Docker

```bash
# Construir imagen
docker build -t agente-capital .

# Ejecutar contenedor
docker run -p 3000:3000 --env-file .env agente-capital
```

### Opción 3: Servidor Propio

```bash
# Build de producción
npm run build

# Iniciar servidor
npm start
```

Para más detalles, consulta [DEPLOYMENT.md](./DEPLOYMENT.md)

## 🛠️ Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Servidor de desarrollo

# Producción
npm run build            # Build de producción
npm run start            # Servidor de producción

# Base de Datos
npm run db:migrate:all   # Ejecutar todas las migraciones
npm run db:seed          # Insertar datos de prueba
npm run db:set-admin-password  # Configurar contraseña admin

# Utilidades
npm run lint             # Linter
npm run db:cleanup-logs  # Limpiar logs antiguos
```

## 🐛 Troubleshooting

### Error: "HUGGINGFACE_API_KEY no está configurado"

Asegúrate de:
1. Tener un archivo `.env` en la raíz
2. Que contenga `HUGGINGFACE_API_KEY=hf_...`
3. Reiniciar el servidor (`npm run dev`)

### Error: "dimensions mismatch en Pinecone"

Tu índice tiene dimensiones incorrectas. Elimínalo y recréalo con **384 dimensiones**.

### LM Studio no conecta

- Verifica que esté corriendo en `localhost:1234`
- Revisa que el modelo esté cargado
- Check firewall/antivirus

### Error en migraciones

```bash
# Reset completo
npm run db:migrate:all
```

### Pinecone no conecta

- Verifica API key en `.env`
- Confirma que el índice existe
- Check límites de plan

## 📚 Documentación Adicional

- [QUICKSTART_ES.md](./QUICKSTART_ES.md) - Guía de inicio rápido
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Guía de despliegue
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Guía para contribuir
- [TODO.md](./TODO.md) - Roadmap y tareas pendientes
- [ZOHO_CRM_SETUP.md](./ZOHO_CRM_SETUP.md) - Configuración Zoho CRM
- [SINCRONIZACION_DOCUMENTOS.md](./SINCRONIZACION_DOCUMENTOS.md) - Sincronización de documentos

## 🤝 Contribuir

Las contribuciones son bienvenidas! Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

Para más detalles, consulta [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📄 Licencia

Este proyecto es privado y propiedad de **Capital Plus**.

## 👥 Autores

- **Rodrigo Navarro** - [GitHub](https://github.com/rodrigoNavarro-Mac)

## 🙏 Agradecimientos

- Next.js Team
- Pinecone
- HuggingFace
- ShadCN UI
- La comunidad de código abierto

---

**Capital Plus** © 2024 - Sistema Interno de IA

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/rodrigoNavarro-Mac/Agente-Capital)
