# 📄 Guía de Sincronización de Documentos

Esta guía explica cómo sincronizar documentos desde Pinecone a PostgreSQL después de migrar la base de datos.

## 🔍 Problema

Después de migrar la base de datos a Supabase, los documentos pueden estar en Pinecone (base de datos vectorial) pero no aparecer en la sección de documentos de la aplicación. Esto es porque:

- **Pinecone** almacena los chunks vectoriales de los documentos
- **PostgreSQL** (tabla `documents_meta`) almacena la metadata de los documentos para mostrarlos en la UI
- Al migrar, solo se migraron los datos de PostgreSQL, pero si la tabla estaba vacía, los documentos no aparecen

## ✅ Solución

Usa el script de sincronización para extraer la información de los documentos desde Pinecone y guardarla en PostgreSQL.

## 🚀 Uso

### Paso 1: Verificar Configuración

Asegúrate de tener configurado en tu `.env`:

```env
# Pinecone
PINECONE_API_KEY=tu-api-key
PINECONE_INDEX_NAME=capitalplus-rag

# PostgreSQL (Supabase)
DATABASE_URL=postgresql://postgres:TU_PASSWORD@db.TU_PROYECTO.supabase.co:5432/postgres
```

### Paso 2: Ejecutar Sincronización

```bash
npm run db:sync-documents
```

O directamente:

```bash
node scripts/sync-documents-from-pinecone.js
```

### Paso 3: Verificar Resultados

El script mostrará:
- ✅ Documentos encontrados por namespace (zona)
- ✅ Documentos insertados en PostgreSQL
- ✅ Documentos actualizados
- 📊 Resumen final por zona

## 📋 Qué Hace el Script

1. **Conecta a Pinecone**: Obtiene acceso a tu índice vectorial
2. **Consulta cada namespace**: Busca documentos en cada zona (yucatan, puebla, etc.)
3. **Extrae metadata**: Obtiene información de cada documento único:
   - Nombre del archivo
   - Zona
   - Desarrollo
   - Tipo de documento
   - Usuario que lo subió
   - Cantidad de chunks
4. **Sincroniza con PostgreSQL**: 
   - Inserta documentos nuevos en `documents_meta`
   - Actualiza documentos existentes
   - Mantiene el conteo de chunks actualizado

## 🔧 Detalles Técnicos

### Namespaces Consultados

El script consulta estos namespaces (zonas):
- `yucatan`
- `puebla`
- `quintana_roo`
- `cdmx`
- `jalisco`
- `nuevo_leon`

Si tienes documentos en otros namespaces, puedes agregarlos editando el array `KNOWN_ZONES` en el script.

### Método de Consulta

El script usa queries con vectores dummy para obtener chunks de Pinecone. Esto es necesario porque Pinecone no tiene un método directo para listar todos los vectores, pero podemos usar queries con topK alto para obtener muchos resultados.

### Manejo de Duplicados

El script agrupa chunks por `sourceFileName` y `development` para identificar documentos únicos. Si un documento tiene múltiples chunks, se cuenta correctamente.

## ⚠️ Limitaciones

1. **TopK máximo**: Pinecone tiene límites en el número de resultados por query. El script usa 10,000 como máximo, lo que debería ser suficiente para la mayoría de casos.

2. **Performance**: Si tienes muchos documentos (miles), el script puede tardar varios minutos. Esto es normal.

3. **Metadata faltante**: Si algún chunk no tiene `sourceFileName` en su metadata, será omitido.

## 🐛 Solución de Problemas

### Error: "PINECONE_API_KEY no está configurada"

**Solución**: Verifica que tengas `PINECONE_API_KEY` en tu `.env`

### Error: "No se encontraron chunks"

**Posibles causas**:
- El namespace no existe en Pinecone
- No hay documentos en ese namespace
- El nombre del namespace es diferente

**Solución**: Verifica en el dashboard de Pinecone qué namespaces existen.

### Los documentos no aparecen después de sincronizar

**Verifica**:
1. Que el script se ejecutó sin errores
2. Que los documentos están en PostgreSQL:
   ```sql
   SELECT * FROM documents_meta;
   ```
3. Que la aplicación está usando la base de datos correcta (Supabase)

### Algunos documentos faltan

**Causa**: Puede haber documentos en namespaces que no están en la lista `KNOWN_ZONES`.

**Solución**: 
1. Verifica en Pinecone qué namespaces tienen datos
2. Agrega los namespaces faltantes al script

## 📊 Ejemplo de Salida

```
🚀 Iniciando sincronización de documentos desde Pinecone...

🔌 Verificando conexión a PostgreSQL...
   ✅ Conexión a PostgreSQL establecida

🔌 Inicializando Pinecone...
   ✅ Conectado a índice: capitalplus-rag

📊 Obteniendo estadísticas del índice...
   ✅ Total de vectores: 15234
   📦 Namespaces encontrados: yucatan, puebla, quintana_roo

🔍 Consultando namespace: yucatan...
   📦 Procesando batch: 5234 chunks (total: 5234)
   ✅ Encontrados 45 documentos únicos de 5234 chunks totales

💾 Guardando 45 documentos de yucatan...
   ✅ Insertado: brochure_riviera.pdf (riviera)
   ✅ Insertado: policy_campo_magno.pdf (campo_magno)
   ...

============================================================
✅ Sincronización completada!
============================================================
📊 Total de documentos procesados: 127
   - Insertados: 127
   - Actualizados: 0

📋 Resumen por zona:
   - yucatan: 45 documentos
   - puebla: 32 documentos
   - quintana_roo: 50 documentos
```

## 🔄 Re-ejecutar

Puedes ejecutar el script múltiples veces de forma segura. El script:
- ✅ Inserta documentos nuevos
- ✅ Actualiza documentos existentes (actualiza el conteo de chunks)
- ✅ No crea duplicados

## 💡 Tips

1. **Ejecuta después de migraciones**: Siempre ejecuta este script después de migrar la base de datos
2. **Programa ejecuciones periódicas**: Puedes ejecutarlo periódicamente para mantener sincronizado
3. **Verifica antes de producción**: Asegúrate de que todos los documentos estén sincronizados antes de desplegar

## 📚 Recursos

- [Documentación de Pinecone](https://docs.pinecone.io/)
- [Guía de Migración a Supabase](./MIGRACION_SUPABASE.md) (si existe)

