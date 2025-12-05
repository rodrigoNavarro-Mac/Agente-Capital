/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - SINCRONIZACIÓN DE DOCUMENTOS
 * =====================================================
 * Script para sincronizar documentos desde Pinecone a PostgreSQL.
 * 
 * Este script:
 * 1. Consulta Pinecone para obtener todos los documentos únicos
 * 2. Extrae la metadata de los chunks (zone, development, type, etc.)
 * 3. Inserta o actualiza registros en documents_meta
 * 
 * Uso:
 *   node scripts/sync-documents-from-pinecone.js
 * 
 * Requisitos:
 *   - Tener PINECONE_API_KEY configurada en .env
 *   - Tener PINECONE_INDEX_NAME configurada en .env
 *   - Tener DATABASE_URL o variables POSTGRES_* configuradas
 */

const { Pool } = require('pg');
const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

// =====================================================
// CONFIGURACIÓN
// =====================================================

function getPoolConfig() {
  // Intentar obtener la cadena de conexión en orden de prioridad
  // IMPORTANTE: pg necesita NON_POOLING en serverless
  const connectionString =
    process.env.POSTGRES_URL_NON_POOLING ||  // ⭐ PRIORIDAD para pg en Vercel
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL;

  if (connectionString) {
    // Detectar si es Supabase o conexión remota
    let isSupabase = false;
    let hostname = 'unknown';
    let parsedUrl = null;
    
    try {
      parsedUrl = new URL(connectionString);
      hostname = parsedUrl.hostname;
      isSupabase = hostname.includes('supabase.co') || 
                   hostname.includes('supabase') ||
                   !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
      
      // Para Supabase, usar parámetros individuales en lugar de connectionString
      if (isSupabase && parsedUrl) {
        const password = parsedUrl.password || '';
        const username = parsedUrl.username || 'postgres';
        const database = parsedUrl.pathname.slice(1) || 'postgres';
        const port = parseInt(parsedUrl.port || '5432');
        
        return {
          host: hostname,
          port: port,
          user: username,
          password: password,
          database: database,
          ssl: {
            rejectUnauthorized: false,
          },
        };
      }
    } catch (e) {
      isSupabase = !!process.env.POSTGRES_URL || 
                   !!process.env.POSTGRES_PRISMA_URL ||
                   !!process.env.POSTGRES_URL_NON_POOLING;
    }
    
    // Para conexiones no-Supabase
    const sslConfig = hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== 'unknown'
      ? { rejectUnauthorized: false }
      : undefined;
    
    return {
      connectionString: connectionString,
      ssl: sslConfig,
    };
  }

  return {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'capital_plus_agent',
  };
}

const pool = new Pool(getPoolConfig());

// Zonas conocidas (namespaces en Pinecone)
const KNOWN_ZONES = [
  'yucatan',
  'puebla',
  'quintana_roo',
  'cdmx',
  'jalisco',
  'nuevo_leon',
];

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Inicializa Pinecone
 */
async function initPinecone() {
  if (!process.env.PINECONE_API_KEY) {
    throw new Error('❌ PINECONE_API_KEY no está configurada en .env');
  }

  if (!process.env.PINECONE_INDEX_NAME) {
    throw new Error('❌ PINECONE_INDEX_NAME no está configurada en .env');
  }

  const client = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
  });

  return client.index(process.env.PINECONE_INDEX_NAME);
}

/**
 * Obtiene todos los documentos únicos de un namespace
 * Usa múltiples queries para obtener todos los documentos
 */
async function getDocumentsFromNamespace(index, namespace) {
  console.log(`\n🔍 Consultando namespace: ${namespace}...`);

  try {
    const ns = index.namespace(namespace);
    
    // Crear un vector dummy (todos ceros) para hacer queries
    // La dimensión es 1024 para llama-text-embed-v2
    const DIMENSION = 1024;
    const dummyVector = new Array(DIMENSION).fill(0);

    // Agrupar por sourceFileName para obtener documentos únicos
    const documentsMap = new Map();
    let totalChunks = 0;
    const QUERY_BATCH_SIZE = 10000; // Máximo por query
    let hasMore = true;
    let offset = 0;

    // Hacer múltiples queries si es necesario
    while (hasMore) {
      const response = await ns.query({
        vector: dummyVector,
        topK: QUERY_BATCH_SIZE,
        includeMetadata: true,
      });

      if (!response.matches || response.matches.length === 0) {
        hasMore = false;
        break;
      }

      totalChunks += response.matches.length;
      console.log(`   📦 Procesando batch: ${response.matches.length} chunks (total: ${totalChunks})`);

      for (const match of response.matches) {
        const metadata = match.metadata || {};
        const sourceFileName = metadata.sourceFileName;

        if (!sourceFileName) {
          continue; // Saltar si no tiene sourceFileName
        }

        // Crear clave única: filename + development para evitar duplicados
        const uniqueKey = `${sourceFileName}::${metadata.development || ''}`;

        // Si ya tenemos este documento, solo actualizar contador
        if (!documentsMap.has(uniqueKey)) {
          documentsMap.set(uniqueKey, {
            filename: sourceFileName,
            zone: metadata.zone || namespace,
            development: metadata.development || '',
            type: metadata.type || 'general',
            uploaded_by: metadata.uploaded_by ? parseInt(metadata.uploaded_by) : null,
            pinecone_namespace: namespace,
            created_at: metadata.created_at || new Date().toISOString(),
            chunks_count: 1,
          });
        } else {
          // Incrementar contador de chunks
          const doc = documentsMap.get(uniqueKey);
          doc.chunks_count = (doc.chunks_count || 0) + 1;
        }
      }

      // Si obtuvimos menos resultados que el batch size, no hay más
      if (response.matches.length < QUERY_BATCH_SIZE) {
        hasMore = false;
      } else {
        // Pequeña pausa para no sobrecargar la API
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (totalChunks === 0) {
      console.log(`   ⚠️  No se encontraron chunks en ${namespace}`);
      return [];
    }

    const documents = Array.from(documentsMap.values());
    console.log(`   ✅ Encontrados ${documents.length} documentos únicos de ${totalChunks} chunks totales`);
    
    return documents;
  } catch (error) {
    console.error(`   ❌ Error consultando ${namespace}:`, error.message);
    // Si el error es que el namespace no existe, continuar
    if (error.message.includes('not found') || error.message.includes('does not exist')) {
      console.log(`   ℹ️  Namespace ${namespace} no existe, omitiendo...`);
      return [];
    }
    throw error;
  }
}

/**
 * Verifica si un usuario existe en la base de datos
 */
async function userExists(userId) {
  if (!userId) return false;
  
  try {
    const result = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [userId]
    );
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Obtiene el ID del primer usuario admin disponible, o null
 */
async function getDefaultAdminUserId() {
  try {
    const result = await pool.query(
      `SELECT id FROM users 
       WHERE role_id IN (SELECT id FROM roles WHERE name IN ('admin', 'ceo'))
       AND is_active = true
       ORDER BY id
       LIMIT 1`
    );
    return result.rows.length > 0 ? result.rows[0].id : null;
  } catch (error) {
    return null;
  }
}

/**
 * Inserta o actualiza un documento en documents_meta
 */
async function upsertDocument(doc) {
  try {
    // Verificar si el usuario existe, si no, usar null o un admin por defecto
    let uploadedBy = doc.uploaded_by;
    
    if (uploadedBy) {
      const exists = await userExists(uploadedBy);
      if (!exists) {
        console.log(`   ⚠️  Usuario ${uploadedBy} no existe, usando null para uploaded_by`);
        uploadedBy = null;
        
        // Opcional: usar un admin por defecto si queremos
        // const defaultAdmin = await getDefaultAdminUserId();
        // if (defaultAdmin) {
        //   uploadedBy = defaultAdmin;
        //   console.log(`   ℹ️  Usando usuario admin ${defaultAdmin} como fallback`);
        // }
      }
    }

    // Verificar si el documento ya existe
    const existing = await pool.query(
      `SELECT id FROM documents_meta 
       WHERE filename = $1 AND zone = $2 AND development = $3`,
      [doc.filename, doc.zone, doc.development]
    );

    if (existing.rows.length > 0) {
      // Actualizar documento existente
      await pool.query(
        `UPDATE documents_meta 
         SET type = $1, 
             chunks_count = $2,
             uploaded_by = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [doc.type, doc.chunks_count, uploadedBy, existing.rows[0].id]
      );
      return { action: 'updated', id: existing.rows[0].id };
    } else {
      // Insertar nuevo documento
      const result = await pool.query(
        `INSERT INTO documents_meta 
         (filename, zone, development, type, uploaded_by, pinecone_namespace, chunks_count, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          doc.filename,
          doc.zone,
          doc.development,
          doc.type,
          uploadedBy, // Usar el valor validado (puede ser null)
          doc.pinecone_namespace,
          doc.chunks_count,
          doc.created_at,
        ]
      );
      return { action: 'inserted', id: result.rows[0].id };
    }
  } catch (error) {
    console.error(`   ❌ Error guardando documento ${doc.filename}:`, error.message);
    throw error;
  }
}

// =====================================================
// FUNCIÓN PRINCIPAL
// =====================================================

async function syncDocuments() {
  console.log('🚀 Iniciando sincronización de documentos desde Pinecone...\n');

  try {
    // Verificar conexión a PostgreSQL
    console.log('🔌 Verificando conexión a PostgreSQL...');
    await pool.query('SELECT NOW()');
    console.log('   ✅ Conexión a PostgreSQL establecida\n');

    // Inicializar Pinecone
    console.log('🔌 Inicializando Pinecone...');
    const index = await initPinecone();
    console.log(`   ✅ Conectado a índice: ${process.env.PINECONE_INDEX_NAME}\n`);

    // Obtener estadísticas del índice para ver qué namespaces existen
    console.log('📊 Obteniendo estadísticas del índice...');
    const stats = await index.describeIndexStats();
    console.log(`   ✅ Total de vectores: ${stats.totalRecordCount || 0}`);
    
    if (stats.namespaces) {
      console.log(`   📦 Namespaces encontrados: ${Object.keys(stats.namespaces).join(', ')}`);
    }
    console.log('');

    // Procesar cada zona conocida
    let totalDocuments = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    for (const zone of KNOWN_ZONES) {
      const documents = await getDocumentsFromNamespace(index, zone);

      if (documents.length === 0) {
        continue;
      }

      console.log(`\n💾 Guardando ${documents.length} documentos de ${zone}...`);

      for (const doc of documents) {
        const result = await upsertDocument(doc);
        totalDocuments++;

        if (result.action === 'inserted') {
          totalInserted++;
          console.log(`   ✅ Insertado: ${doc.filename} (${doc.development})`);
        } else {
          totalUpdated++;
          console.log(`   🔄 Actualizado: ${doc.filename} (${doc.development})`);
        }
      }
    }

    // Resumen final
    console.log('\n' + '='.repeat(60));
    console.log('✅ Sincronización completada!');
    console.log('='.repeat(60));
    console.log(`📊 Total de documentos procesados: ${totalDocuments}`);
    console.log(`   - Insertados: ${totalInserted}`);
    console.log(`   - Actualizados: ${totalUpdated}`);
    console.log('');

    // Mostrar resumen de documentos en la base de datos
    const summary = await pool.query(`
      SELECT zone, COUNT(*) as count
      FROM documents_meta
      GROUP BY zone
      ORDER BY zone
    `);

    if (summary.rows.length > 0) {
      console.log('📋 Resumen por zona:');
      summary.rows.forEach(row => {
        console.log(`   - ${row.zone}: ${row.count} documentos`);
      });
    }

    // Mostrar algunos documentos de ejemplo
    const sampleDocs = await pool.query(`
      SELECT filename, zone, development, type
      FROM documents_meta
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (sampleDocs.rows.length > 0) {
      console.log('\n📄 Ejemplos de documentos sincronizados:');
      sampleDocs.rows.forEach(doc => {
        console.log(`   - ${doc.filename} (${doc.zone}/${doc.development})`);
      });
    }

    console.log('\n💡 IMPORTANTE:');
    console.log('   Para ver los documentos en la aplicación:');
    console.log('   1. Reinicia el servidor Next.js (Ctrl+C y luego npm run dev)');
    console.log('   2. O visita: http://localhost:3000/api/documents?invalidate=true');
    console.log('   3. O espera 5 minutos para que expire el caché automáticamente');
    console.log('');

  } catch (error) {
    console.error('\n❌ Error durante la sincronización:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Ejecutar sincronización
if (require.main === module) {
  syncDocuments().catch(console.error);
}

module.exports = { syncDocuments };

