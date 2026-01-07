# 🤖 Agente Capital - Sistema de IA para Capital Plus

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/rodrigoNavarro-Mac/Agente-Capital)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

Sistema completo de Agente de IA para **Capital Plus**, construido con Next.js 14, TypeScript, Pinecone, PostgreSQL y múltiples proveedores de LLM. Sistema RAG (Retrieval Augmented Generation) para consultas inteligentes sobre documentos corporativos.

**Este documento es una referencia técnica sobre cómo funciona el sistema, sus tecnologías, optimizaciones y métodos de interacción.**

## 📋 Tabla de Contenidos

- [Arquitectura del Sistema](#-arquitectura-del-sistema)
- [Tecnologías y Componentes](#-tecnologías-y-componentes)
- [Flujos de Trabajo Principales](#-flujos-de-trabajo-principales)
- [Optimizaciones Implementadas](#-optimizaciones-implementadas)
- [Sistema RAG (Retrieval Augmented Generation)](#-sistema-rag-retrieval-augmented-generation)
- [Integraciones Externas](#-integraciones-externas)
- [Sistema de Caché](#-sistema-de-caché)
- [Procesamiento de Documentos](#-procesamiento-de-documentos)
- [Sistema de Aprendizaje](#-sistema-de-aprendizaje)
- [Módulo de Comisiones](#-módulo-de-comisiones)
- [Base de Datos y Optimizaciones](#-base-de-datos-y-optimizaciones)
- [Autenticación y Seguridad](#-autenticación-y-seguridad)
- [API Endpoints](#-api-endpoints)
- [Estructura del Proyecto](#-estructura-del-proyecto)

## 🏗️ Arquitectura del Sistema

El sistema está construido con una arquitectura modular que separa claramente las responsabilidades:

### Capas Principales

1. **Frontend (Next.js App Router)**
   - Páginas del dashboard (`src/app/dashboard/`)
   - Componentes UI reutilizables (`src/components/`)
   - Cliente API (`src/lib/api.ts`)

2. **Backend (Next.js API Routes)**
   - Endpoints RESTful (`src/app/api/`)
   - Lógica de negocio en módulos (`src/lib/`)

3. **Base de Datos**
   - PostgreSQL para datos estructurados (usuarios, documentos, logs)
   - Pinecone para búsqueda vectorial (embeddings de documentos)

4. **Servicios Externos**
   - Pinecone Inference API para embeddings
   - LLM Providers (LM Studio local / OpenAI cloud)
   - Zoho CRM API para sincronización

### Flujo de Datos

```
Usuario → Frontend (React) → API Route → Módulos lib/ → Servicios Externos
                                    ↓
                            PostgreSQL / Pinecone
```

## 🔧 Tecnologías y Componentes

### Stack Principal

| Categoría | Tecnología | Versión | Propósito |
|-----------|------------|---------|-----------|
| **Framework** | Next.js | 14.2.0 | Framework React con App Router y API Routes |
| **Language** | TypeScript | 5.3.3 | Tipado estático para seguridad y mantenibilidad |
| **Styling** | TailwindCSS + ShadCN UI | 3.4.0 | Sistema de diseño y componentes UI |
| **Vector DB** | Pinecone | 3.0.0 | Almacenamiento y búsqueda de embeddings |
| **Embeddings** | Pinecone Inference API | - | Generación de embeddings (llama-text-embed-v2, 1024 dims) |
| **Database** | PostgreSQL | 8.11.3 | Base de datos relacional (Supabase en producción) |
| **LLM Local** | LM Studio | - | LLM local para desarrollo/pruebas |
| **LLM Cloud** | OpenAI | 6.9.1 | LLM en la nube (gpt-4o-mini) |
| **Forms** | React Hook Form + Zod | 7.49.3 | Validación de formularios |
| **Auth** | JWT (jsonwebtoken) | 9.0.2 | Autenticación basada en tokens |
| **PDF Processing** | pdf-parse, pdfjs-dist | 1.1.4, 3.11.174 | Extracción de texto de PDFs |
| **CRM Integration** | Zoho CRM API | - | Sincronización de leads y deals |

### Cómo Interactúan los Componentes

#### 1. **Pinecone (Vector Database)**
- **Función**: Almacena embeddings de documentos para búsqueda semántica
- **Modelo de Embeddings**: `llama-text-embed-v2` (1024 dimensiones)
- **Namespaces**: Organiza vectores por zona (yucatan, puebla, etc.)
- **Metadata**: Almacena información del documento (zona, desarrollo, tipo, página, chunk)
- **Búsqueda**: Usa cosine similarity para encontrar chunks relevantes

#### 2. **PostgreSQL (Base de Datos Relacional)**
- **Función**: Almacena datos estructurados (usuarios, documentos, logs, configuración)
- **Pool de Conexiones**: Configurado para serverless (conexiones directas)
- **Índices**: Optimizados para keyset pagination y queries frecuentes
- **Tablas Principales**:
  - `users`: Usuarios y autenticación
  - `documents_meta`: Metadatos de documentos subidos
  - `query_logs`: Historial de consultas al agente
  - `query_cache`: Caché de respuestas frecuentes
  - `learned_responses`: Respuestas aprendidas del sistema
  - `agent_config`: Configuración del agente (temperature, top_k, etc.)
  - `zoho_leads`, `zoho_deals`: Datos sincronizados de Zoho CRM

#### 3. **LLM Providers (LM Studio / OpenAI)**
- **Abstracción**: `src/lib/llm-provider.ts` permite cambiar entre proveedores
- **Configuración**: Se almacena en `agent_config` (llave `llm_provider`)
- **Mensajes**: Formato estándar (system, user, assistant)
- **Health Checks**: Verificación de disponibilidad antes de usar

#### 4. **Sistema de Caché Multi-Nivel**
- **Caché en Memoria** (`src/lib/memory-cache.ts`): Para datos frecuentes (5-30 min TTL)
- **Caché de Consultas** (`src/lib/cache.ts`): Para respuestas RAG (30 días TTL)
- **Caché de Embeddings**: En memoria para evitar regenerar embeddings del mismo query

## 🔄 Flujos de Trabajo Principales

### 1. Flujo de Upload de Documentos

```
1. Usuario sube archivo (PDF/CSV/DOCX) → /api/upload
2. Extracción de texto:
   - PDF: pdf-parse o pdfjs-dist
   - DOCX: mammoth
   - CSV: parsing directo
3. Limpieza de texto (cleanText.ts):
   - Eliminación de caracteres especiales
   - Normalización de espacios
   - Preservación de estructura
4. Chunking (chunker.ts):
   - División por párrafos → oraciones → palabras
   - Overlap configurable (default: 50 tokens)
   - Tamaño configurable (default: 500 tokens)
5. Generación de embeddings:
   - Pinecone Inference API (llama-text-embed-v2)
   - Batch processing (96 textos por batch)
6. Almacenamiento:
   - Vectores → Pinecone (namespace: zona)
   - Metadatos → PostgreSQL (documents_meta)
7. Registro de chunks:
   - Tabla chunks_stats para estadísticas
```

### 2. Flujo de Consulta RAG

```
1. Usuario envía query → /api/rag-query
2. Verificación de permisos:
   - Autenticación JWT
   - Permisos por zona/desarrollo
3. Procesamiento del query (queryProcessing.ts):
   - Corrección ortográfica
   - Expansión semántica
   - Normalización
4. Búsqueda en caché:
   - Hash exacto del query
   - Búsqueda semántica en Pinecone (namespace: cache)
   - Si encuentra, retorna respuesta cached
5. Si no hay caché, búsqueda RAG:
   - Generar embedding del query (Pinecone Inference)
   - Buscar chunks similares en Pinecone (namespace: zona)
   - Re-ranking con estadísticas de chunks
   - Variantes del query si no hay suficientes resultados
6. Construcción del contexto:
   - Combinar top K chunks encontrados
   - Formatear con referencias a fuentes
7. Consulta al LLM:
   - System prompt + contexto + query del usuario
   - Proveedor configurado (LM Studio / OpenAI)
8. Respuesta:
   - Respuesta del LLM
   - Fuentes citadas
   - Guardar en logs y caché
```

### 3. Flujo de Sincronización Zoho CRM

```
1. Cron job → /api/cron/sync-zoho
2. Autenticación OAuth:
   - Refresh token → Access token
   - Renovación automática
3. Sincronización de Leads:
   - Obtener desde Zoho API
   - Transformar y normalizar datos
   - Upsert en PostgreSQL (zoho_leads)
4. Sincronización de Deals:
   - Similar a leads
   - Upsert en PostgreSQL (zoho_deals)
5. Sincronización de Notas:
   - Obtener notas asociadas a leads/deals
   - Análisis con IA (insights)
   - Almacenar en zoho_notes
```

## ⚡ Optimizaciones Implementadas

### 1. Optimizaciones para Serverless (Vercel)

**Problema**: Conexiones de pool mueren en entornos serverless

**Solución** (`src/lib/postgres-serverless.ts`):
- Conexiones directas (Client) en lugar de Pool
- Una conexión por función
- Cierre explícito después de cada query
- Timeouts defensivos (15s conexión, 20s query)
- Retry logic con backoff

**Keyset Pagination**:
- En lugar de `OFFSET` (O(n) costoso)
- Usa cursor-based pagination (O(log n))
- Índices compuestos: `(created_at DESC, id DESC)`

### 2. Sistema de Caché Multi-Nivel

**Caché en Memoria** (`memory-cache.ts`):
- TTL por tipo de dato:
  - Documentos: 5 minutos
  - Desarrollos: 10 minutos
  - Estadísticas: 2 minutos
  - Configuración: 30 minutos
- Limpieza automática cada 15 minutos
- Persistencia en `globalThis` para hot reload

**Caché de Consultas RAG** (`cache.ts`):
- Hash MD5 del query normalizado
- Embeddings en Pinecone (namespace: cache)
- Búsqueda semántica con umbral 0.85
- Expiración: 30 días
- No guarda si hay feedback negativo

### 3. Optimización de Embeddings

**Caché de Embeddings en Memoria**:
- Evita regenerar embeddings del mismo query
- TTL: 1 hora
- Límite: 100 entradas (LRU)

**Batch Processing**:
- Pinecone Inference: 96 textos por batch
- Upsert a Pinecone: 100 vectores por batch

### 4. Re-ranking Inteligente

**Algoritmo** (`pinecone.ts`):
```
score_final = (similarity_score * 0.8) + (success_ratio * 0.2)
```

- `similarity_score`: Score de Pinecone (0-1)
- `success_ratio`: Ratio de éxito del chunk (de chunks_stats)
- Mejora resultados basándose en feedback histórico

### 5. Procesamiento de Queries

**Corrección Ortográfica** (`queryProcessing.ts`):
- Diccionario de correcciones comunes
- Reemplazo inteligente preservando capitalización

**Expansión Semántica**:
- Mapeo de términos a variantes
- Ejemplo: "material prohibido" → ["materiales prohibidos", "no se permite", ...]
- Mejora recall en búsquedas

**Variantes de Query**:
- Si no hay suficientes resultados, busca con variantes
- Top 2-3 variantes más relevantes
- Evita hacer demasiadas llamadas

## 🧠 Sistema RAG (Retrieval Augmented Generation)

### Arquitectura RAG

El sistema implementa RAG con las siguientes características:

1. **Embeddings**:
   - Modelo: `llama-text-embed-v2` (Pinecone Inference API)
   - Dimensiones: 1024
   - Input type: `passage` para documentos, `query` para búsquedas

2. **Búsqueda Vectorial**:
   - Métrica: Cosine similarity
   - Top K: Configurable (default: 5)
   - Filtros: Por zona, desarrollo, tipo de documento

3. **Contexto Construido**:
   - Combina top K chunks encontrados
   - Formato: `[Fuente N: archivo.pdf, Página X]\n{texto}\n\n---\n\n`
   - Preserva referencias para citas

4. **System Prompt** (`systemPrompt.ts`):
   - Define comportamiento del agente
   - Restricciones y reglas
   - Formato de respuestas (Markdown)
   - Manejo de información no disponible

### Proceso de Búsqueda Mejorado

```
1. Query original → Procesamiento
   ├─ Corrección ortográfica
   ├─ Expansión semántica
   └─ Normalización

2. Generar embedding del query procesado

3. Búsqueda en Pinecone:
   ├─ Query vector + filtros
   ├─ Top K * 2 resultados (para re-ranking)
   └─ Incluir metadata

4. Re-ranking:
   ├─ Obtener stats de chunks (success_ratio)
   ├─ Calcular score final
   └─ Ordenar y tomar top K

5. Si pocos resultados buenos:
   ├─ Generar variantes del query
   ├─ Buscar con variantes
   └─ Combinar y deduplicar

6. Construir contexto con top K chunks
```

## 🔗 Integraciones Externas

### 1. Pinecone

**Configuración**:
- Índice: `capitalplus-rag` (1024 dimensiones)
- Namespaces: Por zona (yucatan, puebla, etc.)
- Namespace especial: `cache` para caché de consultas
- Namespace especial: `learned_responses` para respuestas aprendidas

**Operaciones**:
- `upsertChunks()`: Inserta/actualiza chunks con embeddings
- `queryChunks()`: Busca chunks similares
- `deleteDocumentChunks()`: Elimina chunks de un documento

**Embeddings**:
- Generados con Pinecone Inference API
- Modelo: `llama-text-embed-v2`
- Batch size: 96 textos

### 2. Zoho CRM

**Autenticación**:
- OAuth 2.0 con refresh token
- Renovación automática de access token
- Cliente configurado en `zoho-crm.ts`

**Sincronización**:
- Leads: Campos mapeados (Full_Name, Email, Desarrollo, etc.)
- Deals: Campos mapeados (Deal_Name, Amount, Stage, etc.)
- Notas: Análisis con IA para generar insights

**Endpoints Usados**:
- `GET /crm/v2/Leads`
- `GET /crm/v2/Deals`
- `GET /crm/v2/Notes`

### 3. LLM Providers

**Abstracción** (`llm-provider.ts`):
- Interfaz común para diferentes proveedores
- Cambio dinámico de proveedor
- Health checks

**LM Studio** (Local):
- Base URL: `http://localhost:1234/v1`
- Modelo configurable
- Útil para desarrollo/pruebas

**OpenAI** (Cloud):
- API Key requerida
- Modelo: `gpt-4o-mini` (configurable)
- Producción

## 💾 Sistema de Caché

### Arquitectura de Caché

El sistema usa tres niveles de caché:

1. **Caché en Memoria** (`memory-cache.ts`):
   - Para datos frecuentes (documentos, desarrollos, stats)
   - TTL corto (2-30 minutos)
   - Limpieza automática

2. **Caché de Consultas RAG** (`cache.ts`):
   - Para respuestas completas de consultas
   - Hash exacto + búsqueda semántica
   - TTL largo (30 días)
   - Almacenado en PostgreSQL + Pinecone

3. **Caché de Embeddings**:
   - Embeddings de queries frecuentes
   - TTL: 1 hora
   - En memoria (Map)

### Estrategia de Invalidación

- **Caché en Memoria**: TTL automático
- **Caché RAG**: 
  - No se guarda si hay feedback negativo
  - Se ignora si tiene feedback negativo asociado
  - Expiración automática (30 días)

## 📄 Procesamiento de Documentos

### Pipeline de Procesamiento

1. **Extracción de Texto**:
   - PDF: `pdf-parse` o `pdfjs-dist`
   - DOCX: `mammoth`
   - CSV: Parsing directo

2. **Limpieza** (`cleanText.ts`):
   - Eliminación de caracteres especiales
   - Normalización de espacios
   - Preservación de estructura (párrafos, listas)

3. **Chunking** (`chunker.ts`):
   - Estrategia jerárquica:
     - Primero: Por párrafos
     - Si muy largo: Por oraciones
     - Si muy largo: Por palabras
   - Overlap configurable (default: 50 tokens)
   - Preserva información de página (para PDFs)

4. **Generación de Embeddings**:
   - Batch processing (96 chunks)
   - Pinecone Inference API
   - Metadata completa (zona, desarrollo, tipo, página, chunk)

5. **Almacenamiento**:
   - Vectores → Pinecone
   - Metadatos → PostgreSQL

### Configuración de Chunking

- **Chunk Size**: 500 tokens (default)
- **Overlap**: 50 tokens (default)
- **Estimación**: ~4 caracteres por token

## 🎓 Sistema de Aprendizaje

### Respuestas Aprendidas

El sistema aprende de feedback positivo:

1. **Feedback del Usuario**:
   - Rating (1-5 estrellas)
   - Comentarios opcionales

2. **Procesamiento** (`learnedResponses.ts`):
   - Si rating >= 4: Guardar como respuesta aprendida
   - Generar embedding del query
   - Calcular quality_score basado en:
     - Rating promedio
     - Número de usos
     - Feedback positivo/negativo

3. **Búsqueda**:
   - Antes de buscar en documentos, buscar en respuestas aprendidas
   - Similitud semántica (umbral: 0.80)
   - Filtrar por quality_score (default: >= 0.7)

4. **Almacenamiento**:
   - PostgreSQL: `learned_responses`
   - Pinecone: Namespace `learned_responses`

### Memoria del Sistema

- Almacena insights importantes
- Se agrega al system prompt
- Mejora respuestas futuras

## 💰 Módulo de Comisiones

Sistema financiero dual para gestión de comisiones inmobiliarias, separando claramente flujos de ingresos y egresos derivados de la misma transacción de venta.

### Arquitectura General

El módulo maneja **dos flujos financieros independientes** derivados de cada venta (deal):

1. **Comisiones Internas (Egresos)**: Dinero que la empresa paga a su equipo interno
2. **Comisiones a Socios (Ingresos)**: Dinero que la empresa cobra a los socios del lote

Ambos flujos se calculan desde la misma venta pero mantienen estados, reglas de visibilidad y ciclos de pago completamente independientes.

### Flujo 1: Comisiones Internas (Egresos)

Sistema de pagos a equipo interno dividido en dos fases con estados independientes:

#### Estados de Fase Venta (Interna)
- **`visible`**: Siempre visible desde el momento del cálculo
- **`pending`**: Pendiente de pago
- **`paid`**: Pagado completamente

#### Estados de Fase Postventa (Interna)
- **`hidden`**: Oculta hasta activación externa
- **`upcoming`**: Activada por Zoho Projects, visible pero no pagable
- **`payable`**: Disponible para pago
- **`paid`**: Pagada completamente

#### Componentes del Sistema Interno
- **UI dedicada** (`/dashboard/commissions`): 4 pestañas (Configuración, Ventas comisionables, Distribución, Dashboard). Solo accesible para roles `admin` y `ceo`.
- **Configuración por desarrollo** (`/api/commissions/config`): porcentajes de fases (venta/postventa), roles directos, pool opcional, roles opcionales de postventa y configuración global para roles indirectos (operaciones, marketing, legal, postventa).
- **Ventas comisionables** (`/api/commissions/sales`): CRUD de deals cerrados-ganados con filtros por desarrollo, asesor y fechas. Sync masivo desde la BD local de Zoho (`/api/commissions/sync-sales`) sin llamar a la API externa.
- **Distribución de pagos** (`/api/commissions/distributions`): calcula comisiones por fases y roles usando `commission-calculator`, aplica reglas por desarrollo (`/api/commissions/rules`), permite recalcular, registrar ajustes manuales auditables (`/api/commissions/adjustments`) y marcar pagos por distribución.
- **Facturas e invoices PDF** (`/api/commissions/invoices`): subir, reemplazar, descargar y eliminar facturas asociadas a cada distribución con validación de tamaño y tipo.
- **Metas y dashboard** (`/api/commissions/billing-targets`, `/api/commissions/dashboard`): metas mensuales de comisión (suma de fase ventas + fase postventa), métricas anuales y por desarrollo (pagado vs pendiente, ticket promedio, cumplimiento de meta, por asesor y por desarrollo).

### Flujo 2: Comisiones a Socios (Ingresos)

Sistema de cobros a socios externos con estados de facturación independientes:

#### Estados de Cobro a Socios
- **`pending_invoice`**: Pendiente de facturación
- **`invoiced`**: Facturado, pendiente de cobro
- **`collected`**: Cobrado completamente

#### Componentes del Sistema de Socios
- **Cálculo de comisiones a socios** (`/api/commissions/partner-commissions`): calcula el 100% del valor de comisión (fase venta + postventa) proporcional a la participación de cada socio en el lote.
- **Socios del producto** (`commission_product_partners`): tabla que asocia ventas con socios y sus porcentajes de participación.
- **Facturación independiente**: proceso de emisión de facturas a socios, completamente separado del sistema de pagos internos.

### Integración con Zoho Projects

Zoho Projects cumple un rol específico y limitado en el flujo de postventa interna:

#### Rol de Zoho Projects
- **NO calcula** montos de comisión
- **NO maneja** fechas de pago
- **NO paga** comisiones
- **SÓLO emite** un evento `POST_SALE_TRIGGER` cuando se completa una tarea específica en un proyecto

#### Evento POST_SALE_TRIGGER
- Cambia el estado de postventa interna de `hidden` → `upcoming`
- Hace visible la postventa en el sistema de comisiones
- No afecta estados de venta interna ni comisiones a socios

### Trazabilidad Financiera

- **Egresos (Comisiones Internas)**: `commission_distributions` registra pagos reales a equipo interno
- **Ingresos (Comisiones a Socios)**: `commission_product_partners` + proceso de facturación registra cobros a socios
- **Separación estricta**: ambos flujos derivan del mismo deal pero nunca comparten estados, tablas de pagos ni lógica de cálculo

### Tablas Clave

#### Flujo Interno (Egresos)
- `commission_configs`: Configuración por desarrollo
- `commission_global_configs`: Configuración global de roles
- `commission_sales`: Ventas comisionables
- `commission_distributions`: Distribuciones de pago a equipo interno
- `commission_adjustments`: Auditoría de ajustes manuales
- `commission_rules`: Reglas de incentivos
- `commission_billing_targets`: Metas de facturación

#### Flujo Socios (Ingresos)
- `commission_product_partners`: Socios y participaciones por venta
- `partner_invoices`: Facturas emitidas a socios (futuro)
- `partner_collections`: Cobros realizados (futuro)

## 🗄️ Base de Datos y Optimizaciones

### Estructura de Tablas Principales

1. **users**: Usuarios y autenticación
2. **documents_meta**: Metadatos de documentos
3. **chunks_stats**: Estadísticas de chunks (para re-ranking)
4. **query_logs**: Historial de consultas
5. **query_cache**: Caché de respuestas
6. **learned_responses**: Respuestas aprendidas
7. **agent_config**: Configuración del agente
8. **zoho_leads**, **zoho_deals**: Datos de Zoho CRM
9. **commission_configs**, **commission_global_configs**: Configuración por desarrollo y roles globales
10. **commission_sales**: Ventas comisionables (deals cerrados-ganados)
11. **commission_distributions**: Distribución de comisiones por rol/fase y estado de pago
12. **commission_adjustments**: Auditoría de ajustes manuales
13. **commission_rules**: Reglas de incentivos por desarrollo/periodo
14. **commission_billing_targets**: Metas mensuales de comisión (suma de fase ventas + fase postventa)

### Optimizaciones de Queries

**Índices Creados**:
- Keyset pagination: `(created_at DESC, id DESC)`
- Filtros comunes: `(zone, development, created_at DESC)`
- Búsquedas por usuario: `(user_id, created_at DESC)`

**Keyset Pagination**:
- En lugar de `OFFSET` (costoso en grandes datasets)
- Usa cursor: `WHERE id > cursor ORDER BY created_at DESC`
- Complejidad: O(log n) vs O(n)

### Configuración Serverless

**Conexiones**:
- Prioridad: `DATABASE_URL_DIRECT` (conexión directa)
- Fallback: Variables de Vercel
- SSL requerido para Supabase
- IPv4 forzado (Vercel no soporta IPv6)

## 🔐 Autenticación y Seguridad

### JWT Tokens

- **Access Token**: 24 horas
- **Refresh Token**: 7 días
- **Algoritmo**: HS256
- **Payload**: `{ userId, email, role }`

### Sistema de Permisos

**Roles**:
- CEO, Admin, Sales Manager, Sales Agent, Post-Sales, Legal Manager, Marketing Manager

**Permisos por Zona/Desarrollo**:
- Control granular de acceso
- Tabla `user_developments`: Asocia usuarios con zonas/desarrollos
- Verificación en cada endpoint

### Validación

- **Input**: Zod schemas
- **Sanitización**: Limpieza de inputs
- **Passwords**: bcrypt (salt rounds: 10)


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

### 8. Gestionar Comisiones

1. Ve a **Dashboard > Commissions** (solo admin/ceo)
2. En **Configuración**, define porcentajes por desarrollo y roles globales
3. En **Ventas comisionables**, importa con **Sync desde BD** o registra/edita ventas
4. En **Distribución**, calcula o recalcula comisiones, ajusta manualmente y marca pagos (`pending`/`paid`)
5. (Opcional) Sube el PDF de factura de cada distribución y marca estado de pago
6. En **Dashboard**, revisa pagos vs pendientes, ticket promedio, cumplimiento de metas y totales por asesor/desarrollo

## 📁 Estructura del Proyecto

### Organización de Archivos

```
Agente-Capital/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API Routes (Backend)
│   │   │   ├── auth/                 # Autenticación JWT
│   │   │   ├── documents/            # CRUD de documentos
│   │   │   ├── rag-query/            # Endpoint principal RAG
│   │   │   ├── rag-feedback/         # Feedback del usuario
│   │   │   ├── upload/               # Procesamiento de archivos
│   │   │   ├── users/                # Gestión de usuarios
│   │   │   ├── zoho/                 # Integración Zoho CRM
│   │   │   ├── commissions/          # Config, ventas, distribución y dashboard de comisiones
│   │   │   ├── cron/                 # Jobs programados
│   │   │   └── agent-config/         # Configuración del agente
│   │   ├── dashboard/                # Frontend (React)
│   │   │   ├── agent/                # Interfaz de consulta
│   │   │   ├── documents/            # Explorador de documentos
│   │   │   ├── upload/               # UI de upload
│   │   │   ├── config/               # Panel de configuración
│   │   │   ├── logs/                 # Visor de logs
│   │   │   ├── users/                # Gestión de usuarios
│   │   │   ├── zoho/                 # Dashboard Zoho
│   │   │   ├── commissions/          # UI de cálculo, ajustes y dashboard de comisiones
│   │   │   └── guia/                 # Guía de usuario
│   │   └── login/                    # Página de login
│   ├── components/                   # Componentes React
│   │   ├── ui/                       # Componentes ShadCN UI
│   │   ├── sidebar.tsx               # Navegación lateral
│   │   ├── navbar.tsx                # Barra superior
│   │   └── ...
│   ├── lib/                          # Módulos de lógica de negocio
│   │   ├── postgres.ts               # Cliente PostgreSQL (pool)
│   │   ├── postgres-serverless.ts    # Cliente PostgreSQL (serverless)
│   │   ├── postgres-keyset.ts        # Keyset pagination helpers
│   │   ├── pinecone.ts               # Cliente Pinecone + embeddings
│   │   ├── llm-provider.ts           # Abstracción de LLM
│   │   ├── lmstudio.ts               # Implementación LM Studio
│   │   ├── openai.ts                 # Implementación OpenAI
│   │   ├── chunker.ts                # Text chunking
│   │   ├── cleanText.ts              # Limpieza de texto
│   │   ├── queryProcessing.ts        # Procesamiento de queries
│   │   ├── cache.ts                  # Caché de consultas RAG
│   │   ├── memory-cache.ts           # Caché en memoria
│   │   ├── learnedResponses.ts       # Sistema de aprendizaje
│   │   ├── systemPrompt.ts           # Prompts del sistema
│   │   ├── zoho-crm.ts               # Cliente Zoho CRM
│   │   ├── zoho-notes-analytics.ts   # Análisis de notas Zoho
│   │   ├── auth.ts                   # Autenticación JWT
│   │   ├── api.ts                    # Cliente API (frontend)
│   │   ├── time-buckets.ts           # Helpers para time buckets
│   │   └── ...
│   └── types/                        # TypeScript types
│       └── documents.ts              # Tipos principales
├── migrations/                       # Migraciones SQL
│   ├── 001_initial_schema.sql
│   ├── 003_query_cache.sql
│   ├── 004_learning_system.sql
│   ├── 007_zoho_sync_tables.sql
│   ├── 008_serverless_optimization.sql
│   └── ...
├── scripts/                         # Scripts utilitarios
│   ├── migrate.js                   # Ejecutar migraciones
│   ├── seed.js                      # Datos de prueba
│   ├── cleanup-old-query-logs.js    # Limpieza de logs
│   └── ...
└── docs/                            # Documentación adicional
```

### Módulos Clave

**`src/lib/pinecone.ts`**:
- Inicialización del cliente Pinecone
- Generación de embeddings (Pinecone Inference API)
- Upsert de chunks
- Query de chunks similares
- Re-ranking con estadísticas

**`src/lib/postgres.ts`**:
- Pool de conexiones PostgreSQL
- Funciones CRUD para todas las tablas
- Queries optimizadas
- Keyset pagination helpers

**`src/lib/llm-provider.ts`**:
- Abstracción para cambiar entre LLM providers
- Health checks
- Configuración dinámica

**`src/lib/cache.ts`**:
- Caché de consultas RAG
- Búsqueda por hash exacto
- Búsqueda semántica en Pinecone
- Invalidación inteligente

**`src/lib/chunker.ts`**:
- División de texto en chunks
- Estrategia jerárquica (párrafos → oraciones → palabras)
- Preservación de overlap
- Metadata de página/chunk

## 📊 API Endpoints

### Autenticación (`/api/auth/*`)

**Flujo de Autenticación**:
1. `POST /api/auth/login`: Valida credenciales → Retorna JWT tokens
2. `POST /api/auth/refresh`: Renueva access token con refresh token
3. `POST /api/auth/logout`: Invalida tokens
4. `POST /api/auth/forgot-password`: Envía email con reset token
5. `POST /api/auth/reset-password`: Resetea contraseña con token
6. `POST /api/auth/change-password`: Cambia contraseña (requiere autenticación)

**Seguridad**:
- Passwords hasheados con bcrypt
- Tokens JWT firmados
- Refresh tokens rotados en cada uso

### Documentos (`/api/documents/*`)

**Endpoints**:
- `POST /api/upload`: Sube y procesa documento (PDF/CSV/DOCX)
  - Extrae texto → Chunking → Embeddings → Pinecone + PostgreSQL
- `GET /api/documents`: Lista documentos (con caché en memoria)
  - Filtros: zona, desarrollo, tipo
  - Paginación: Keyset (cursor-based)
- `GET /api/documents/[id]`: Obtiene metadatos de documento
- `DELETE /api/documents/[id]`: Elimina documento y sus chunks
- `GET /api/documents/[id]/chunks`: Obtiene chunks del documento

**Procesamiento**:
- Async: El upload retorna inmediatamente, procesa en background
- Progress: Se puede consultar estado del procesamiento

### RAG y Consultas (`/api/rag-query`, `/api/rag-feedback`)

**POST /api/rag-query**:
- **Input**: `{ query, zone, development, type?, skipCache? }`
- **Proceso**:
  1. Verifica autenticación y permisos
  2. Procesa query (corrección + expansión)
  3. Busca en caché (si no skipCache)
  4. Si no hay caché: Búsqueda RAG → LLM → Respuesta
  5. Guarda en logs y caché
- **Output**: `{ success, response, sources, cached?, time_ms }`

**POST /api/rag-feedback**:
- **Input**: `{ query_log_id, rating, comment? }`
- **Proceso**:
  - Guarda feedback
  - Si rating >= 4: Crea/actualiza respuesta aprendida
  - Actualiza estadísticas de chunks

### Configuración (`/api/agent-config`)

**GET /api/agent-config**:
- Retorna configuración actual del agente
- Caché: 30 minutos

**POST /api/agent-config**:
- Actualiza una configuración
- **Parámetros**: `temperature`, `top_k`, `chunk_size`, `chunk_overlap`, `max_tokens`, `llm_provider`

### Usuarios (`/api/users/*`)

**Endpoints**:
- `GET /api/users`: Lista usuarios (solo admin)
- `POST /api/users`: Crea usuario (solo admin)
- `GET /api/users/[id]`: Obtiene usuario
- `PUT /api/users/[id]`: Actualiza usuario
- `DELETE /api/users/[id]`: Elimina usuario

**Permisos**:
- Solo admin/CEO pueden gestionar usuarios
- Validación de roles y permisos

### Zoho CRM (`/api/zoho/*`)

**Endpoints**:
- `GET /api/zoho/leads`: Obtiene leads (con caché)
- `GET /api/zoho/deals`: Obtiene deals (con caché)
- `GET /api/zoho/pipelines`: Obtiene pipelines
- `GET /api/zoho/stats`: Estadísticas de CRM
- `GET /api/zoho/notes-insights`: Insights de notas (análisis con IA)

**Sincronización**:
- Cron job: `/api/cron/sync-zoho` (ejecuta periódicamente)
- Sincroniza leads, deals y notas desde Zoho
- Almacena en PostgreSQL para consultas rápidas

## 🔐 Roles y Permisos

### Roles del Sistema

| Rol | Permisos | Descripción |
|-----|----------|-------------|
| **CEO** | Acceso total | Acceso completo a todas las funcionalidades |
| **Admin** | Gestión completa | Gestión de usuarios, configuración, documentos |
| **Sales Manager** | Upload, Query, View | Puede subir documentos y consultar |
| **Sales Agent** | Query, View | Solo consultas y visualización |
| **Post-Sales** | Query, View | Consultas y visualización |
| **Legal Manager** | Upload, Query, View | Gestión legal de documentos |
| **Marketing Manager** | Upload, Query, View | Gestión de marketing |

### Control de Acceso

- **Permisos por Zona/Desarrollo**: Control granular mediante tabla `user_developments`
- **Verificación**: En cada endpoint se verifica:
  1. Autenticación (JWT válido)
  2. Permisos del rol
  3. Acceso a zona/desarrollo específico

### Permisos Específicos

- `can_upload`: Subir documentos
- `can_query`: Consultar al agente
- `can_view`: Ver documentos y logs
- `can_manage_users`: Gestionar usuarios (solo admin/CEO)
- `can_manage_config`: Cambiar configuración del agente

## 📝 Notas Técnicas Importantes

### Pinecone

- **Dimensiones**: El índice debe tener **1024 dimensiones** (llama-text-embed-v2)
- **Namespaces**: Organizados por zona (yucatan, puebla, etc.)
- **Embeddings**: Generados con Pinecone Inference API (no HuggingFace)
- **Modelo**: `llama-text-embed-v2` (configurado en el índice)

### PostgreSQL

- **Conexiones Serverless**: Usar `postgres-serverless.ts` en Vercel
- **Conexiones Pool**: Usar `postgres.ts` en servidores tradicionales
- **Keyset Pagination**: Siempre preferir sobre OFFSET para mejor performance
- **Índices**: Críticos para performance, ver migraciones 008 y 009

### Caché

- **Caché en Memoria**: Se limpia automáticamente cada 15 minutos
- **Caché RAG**: No se guarda si hay feedback negativo asociado
- **Invalidación**: Manual con `memoryCache.invalidate(pattern)`

### LLM Providers

- **Cambio Dinámico**: Se puede cambiar sin reiniciar (configuración en BD)
- **Health Checks**: Se verifica disponibilidad antes de usar
- **Fallback**: Si un proveedor falla, se puede cambiar manualmente

### Procesamiento de Documentos

- **Chunking**: Configurable (default: 500 tokens, overlap 50)
- **Embeddings**: Batch de 96 textos por llamada
- **Upsert**: Batch de 100 vectores por llamada a Pinecone

## 🔍 Referencias Rápidas

### Variables de Entorno Clave

```env
# Base de Datos
DATABASE_URL_DIRECT=postgresql://...  # Conexión directa (serverless)
DATABASE_URL=postgresql://...         # Conexión manual

# Pinecone
PINECONE_API_KEY=...
PINECONE_INDEX_NAME=capitalplus-rag

# LLM
LMSTUDIO_BASE_URL=http://localhost:1234/v1
OPENAI_API_KEY=...

# Zoho CRM
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...
```

### Configuración del Agente (agent_config)

- `temperature`: 0.0 - 1.0 (default: 0.7)
- `top_k`: Número de chunks a recuperar (default: 5)
- `chunk_size`: Tamaño de chunks en tokens (default: 500)
- `chunk_overlap`: Overlap entre chunks (default: 50)
- `max_tokens`: Límite de tokens en respuesta (default: 2000)
- `llm_provider`: 'lmstudio' | 'openai' (default: 'lmstudio')

### Queries SQL Útiles

```sql
-- Ver configuración del agente
SELECT * FROM agent_config;

-- Ver estadísticas de chunks
SELECT * FROM chunks_stats WHERE chunk_id = '...';

-- Ver respuestas aprendidas
SELECT * FROM learned_responses ORDER BY quality_score DESC;

-- Limpiar caché expirado
DELETE FROM query_cache WHERE expires_at < NOW();
```



## 📄 Licencia

Este proyecto es privado y propiedad de **Capital Plus**.

##  Auto

- **Rodrigo Navarro** - [GitHub](https://github.com/rodrigoNavarro-Mac)


**Capital Plus** © 2024 - Sistema Interno de IA

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/rodrigoNavarro-Mac/Agente-Capital)
