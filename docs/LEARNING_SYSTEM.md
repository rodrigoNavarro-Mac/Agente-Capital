# Sistema de Aprendizaje Continuo

Este documento explica el sistema de aprendizaje continuo implementado en el agente RAG de Capital Plus. El sistema permite que el agente mejore automáticamente sin necesidad de re-entrenar el modelo.

## 📋 Componentes Implementados

### 1. Aprendizaje por Interacción (RLAIF Interno)

El agente aprende qué respuestas son buenas y cuáles no, usando las calificaciones de los usuarios.

**Tabla:** `response_learning`

**Funcionalidad:**
- Los usuarios pueden calificar respuestas del 1 al 5
- El sistema almacena estas calificaciones y aprende patrones
- Las respuestas con calificaciones altas se reutilizan para consultas similares

**Endpoint:** `POST /api/rag-feedback`

```json
{
  "query_log_id": 123,
  "rating": 5,
  "comment": "Excelente respuesta"
}
```

### 2. Re-indexación Inteligente y Re-ranking

El sistema mejora la calidad de los resultados RAG priorizando chunks que históricamente han dado buenos resultados.

**Tabla:** `chunk_stats`

**Funcionalidad:**
- Registra el desempeño de cada chunk (éxitos vs fallos)
- Aplica re-ranking inteligente: `score_final = similarity_score * 0.8 + success_ratio * 0.2`
- Chunks con buen historial suben en prioridad
- Chunks problemáticos bajan en prioridad

**Implementación:**
- Automático en cada consulta RAG
- No requiere intervención manual

### 3. Memoria Operativa

El agente crea "memorias" sobre temas importantes que se aprenden de las interacciones frecuentes.

**Tabla:** `agent_memory`

**Funcionalidad:**
- Detecta temas frecuentes en las consultas
- Genera resúmenes de conocimiento importante
- Incluye estas memorias en el system prompt dinámicamente
- Mejora respuestas sobre temas conocidos

**Ejemplo de memoria:**
```
Tema: campo_magno_precios
Resumen: Campo Magno tiene dos listas de precios vigentes. Usar siempre la versión de Inventario.
Importancia: 0.95
```

## 🚀 Instalación y Configuración

### 1. Ejecutar Migración SQL

```bash
# Ejecutar la migración para crear las nuevas tablas
psql -U postgres -d capital_plus_agent -f migrations/004_learning_system.sql

# O usar el script de migración
node scripts/run-migration.js migrations/004_learning_system.sql
```

### 2. Configurar Jobs Nocturnos (Opcional)

Los jobs nocturnos procesan feedback y generan memorias automáticamente.

**Linux/Mac (cron):**
```bash
# Editar crontab
crontab -e

# Agregar las siguientes líneas:
# Procesar feedback cada día a las 2 AM
0 2 * * * cd /ruta/al/proyecto && node scripts/process-feedback-learning.js >> logs/feedback-learning.log 2>&1

# Generar memorias cada día a las 3 AM
0 3 * * * cd /ruta/al/proyecto && node scripts/generate-agent-memories.js >> logs/agent-memories.log 2>&1

# Identificar chunks problemáticos el día 1 de cada mes a las 4 AM
0 4 1 * * cd /ruta/al/proyecto && node scripts/reindex-problematic-chunks.js >> logs/reindex-chunks.log 2>&1
```

**Windows (Task Scheduler):**
1. Abrir Task Scheduler
2. Crear tareas básicas para cada script
3. Configurar para ejecutar diariamente/mensualmente según corresponda

## 📖 Uso del Sistema

### Calificar una Respuesta

Cuando un usuario recibe una respuesta del agente, puede calificarla:

```typescript
// Frontend
const response = await fetch('/api/rag-feedback', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    query_log_id: 123,
    rating: 5, // 1-5
    comment: 'Muy útil'
  })
});
```

### Ver Estadísticas de Aprendizaje

```sql
-- Ver respuestas aprendidas con mejor calidad
SELECT query, quality_score, usage_count
FROM response_learning
WHERE quality_score > 0.5
ORDER BY quality_score DESC
LIMIT 10;

-- Ver chunks con mejor desempeño
SELECT chunk_id, success_count, fail_count,
       (success_count::float / (success_count + fail_count + 1)) as success_ratio
FROM chunk_stats
WHERE (success_count + fail_count) >= 5
ORDER BY success_ratio DESC
LIMIT 10;

-- Ver memorias del agente
SELECT topic, summary, importance
FROM agent_memory
WHERE importance >= 0.7
ORDER BY importance DESC;
```

## 🔧 Scripts Disponibles

### 1. `process-feedback-learning.js`

Procesa feedback de las últimas 24 horas y actualiza `response_learning`.

```bash
node scripts/process-feedback-learning.js
```

**Qué hace:**
- Obtiene feedback de las últimas 24 horas
- Normaliza consultas similares
- Calcula scores de calidad (-1 a +1)
- Actualiza o crea respuestas aprendidas

### 2. `generate-agent-memories.js`

Analiza queries frecuentes y genera memorias operativas.

```bash
node scripts/generate-agent-memories.js
```

**Qué hace:**
- Identifica queries frecuentes (últimos 7 días, mínimo 10 ocurrencias)
- Agrupa por temas
- Genera resúmenes de conocimiento
- Crea o actualiza memorias en `agent_memory`

### 3. `reindex-problematic-chunks.js`

Identifica chunks problemáticos para re-indexación.

```bash
node scripts/reindex-problematic-chunks.js
```

**Qué hace:**
- Identifica chunks con bajo desempeño (fail_count > success_count * 3)
- Identifica chunks sin uso reciente (>60 días)
- Genera reporte de chunks problemáticos

**Nota:** Este script solo identifica chunks problemáticos. La re-indexación debe hacerse manualmente.

## 📊 Flujo de Aprendizaje

```
1. Usuario hace consulta
   ↓
2. Sistema busca en Pinecone (con re-ranking inteligente)
   ↓
3. Sistema carga memorias operativas relevantes
   ↓
4. Sistema genera respuesta con contexto + memorias
   ↓
5. Usuario califica la respuesta (1-5)
   ↓
6. Sistema registra feedback y actualiza chunk_stats
   ↓
7. Job nocturno procesa feedback y actualiza response_learning
   ↓
8. Job nocturno genera memorias de temas frecuentes
   ↓
9. Sistema mejora automáticamente en futuras consultas
```

## 🎯 Resultados Esperados

Después de implementar este sistema, deberías ver:

1. **Mejora en calidad de respuestas** - El sistema aprende qué respuestas funcionan mejor
2. **Mejor relevancia de resultados** - Chunks útiles suben en prioridad
3. **Memoria de temas importantes** - El agente "recuerda" información clave
4. **Mejora continua** - Cada mes el sistema se vuelve más preciso

## 🔍 Monitoreo

### Métricas Clave

```sql
-- Calificación promedio del mes
SELECT AVG(feedback_rating) as avg_rating
FROM query_logs
WHERE feedback_rating IS NOT NULL
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE);

-- Número de respuestas aprendidas
SELECT COUNT(*) as learned_responses
FROM response_learning
WHERE quality_score > 0;

-- Número de memorias activas
SELECT COUNT(*) as active_memories
FROM agent_memory
WHERE importance >= 0.7;

-- Ratio de éxito de chunks
SELECT 
  AVG(success_count::float / (success_count + fail_count + 1)) as avg_success_ratio
FROM chunk_stats
WHERE (success_count + fail_count) >= 3;
```

## ⚠️ Notas Importantes

1. **Primera ejecución:** El sistema necesita tiempo para acumular datos. Los primeros días puede no haber mejoras visibles.

2. **Feedback suficiente:** Se recomienda tener al menos 50-100 calificaciones antes de esperar mejoras significativas.

3. **Re-indexación:** Los chunks problemáticos identificados deben revisarse manualmente antes de re-indexar.

4. **Memorias:** Las memorias se generan automáticamente, pero pueden mejorarse manualmente editando la tabla `agent_memory`.

## 🐛 Troubleshooting

### El sistema no está aprendiendo

- Verificar que los jobs nocturnos se estén ejecutando
- Verificar que haya feedback suficiente en `query_logs`
- Revisar logs de los scripts

### Chunks no se están re-ranking correctamente

- Verificar que `chunk_stats` tenga datos
- Verificar que `query_logs_chunks` esté siendo poblado
- Revisar logs del endpoint RAG

### Memorias no aparecen en las respuestas

- Verificar que `agent_memory` tenga registros con `importance >= 0.7`
- Verificar que el endpoint RAG esté cargando memorias
- Revisar logs del endpoint RAG

## 📚 Referencias

- Migración SQL: `migrations/004_learning_system.sql`
- Endpoint de feedback: `src/app/api/rag-feedback/route.ts`
- Funciones de aprendizaje: `src/lib/postgres.ts` (sección "FUNCIONES DE FEEDBACK Y APRENDIZAJE")
- Re-ranking: `src/lib/pinecone.ts` (función `queryChunks`)
- Memoria operativa: `src/lib/systemPrompt.ts` (función `getSystemPrompt`)

