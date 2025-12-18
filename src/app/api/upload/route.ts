/**
 * =====================================================
 * CAPITAL PLUS AI AGENT - UPLOAD API ENDPOINT
 * =====================================================
 * Endpoint para subir documentos (PDF, CSV, DOCX),
 * extraer texto (con OCR para PDFs escaneados),
 * dividir en chunks y guardar en Pinecone.
 * 
 * Features:
 * - Extracción estándar de texto (pdf-parse, mammoth)
 * - OCR automático para PDFs escaneados (Tesseract.js)
 * - Chunking inteligente con metadatos
 * - Embeddings con Pinecone Inference
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// Importar librerías de procesamiento
import mammoth from 'mammoth';

// Importar utilidades propias
import { upsertChunks } from '@/lib/pinecone';
import { saveDocumentMeta, checkUserAccess, hasPermission, saveActionLog } from '@/lib/postgres';
import { createPageAwareChunks, summarizeChunks } from '@/lib/chunker';
import { cleanPDFText, cleanCSVText, cleanDOCXText } from '@/lib/cleanText';
import { extractTextFromPDF, extractTextFromPDFWithOCR, needsOCR } from '@/lib/ocr';
import { memoryCache } from '@/lib/memory-cache';
import { logger } from '@/lib/logger';

import type { 
  Zone, 
  DocumentContentType, 
  UploadResponse
} from '@/types/documents';

// =====================================================
// CONFIGURACIÓN
// =====================================================

/**
 * Obtiene el directorio temporal correcto según el entorno
 * En producción/serverless (Vercel, AWS Lambda, etc.) usa /tmp
 * En desarrollo local usa ./tmp
 * 
 * Esta función se ejecuta dinámicamente para asegurar detección correcta
 */
function getUploadDir(): string {
  // Si hay una variable de entorno específica, usarla (tiene prioridad)
  if (process.env.UPLOAD_DIR) {
    return process.env.UPLOAD_DIR;
  }
  
  // Detectar si estamos en un entorno serverless
  // Verificar múltiples indicadores de entornos serverless
  const currentDir = process.cwd();
  const isServerless = !!(
    process.env.VERCEL || 
    process.env.VERCEL_ENV ||
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.AWS_EXECUTION_ENV ||
    process.env.NEXT_RUNTIME === 'nodejs' ||
    // En Vercel, el directorio de trabajo es /var/task (muy específico)
    currentDir.startsWith('/var/task') ||
    currentDir.startsWith('/var/runtime') ||
    // Si estamos en producción y no estamos en Windows/Mac típico
    (process.env.NODE_ENV === 'production' && 
     !process.platform.startsWith('win') && 
     !currentDir.includes('Users') &&
     !currentDir.includes('home'))
  );
  
  // En producción/serverless, usar /tmp (único directorio escribible)
  // En desarrollo, usar ./tmp relativo al proyecto
  const uploadDir = isServerless ? '/tmp' : './tmp';
  
  // Log para debugging (útil también en producción para diagnosticar)
  logger.debug('Resolved upload temp directory', { uploadDir, currentDir, isServerless }, 'upload');
  
  return uploadDir;
}

// No inicializar UPLOAD_DIR al nivel del módulo, calcularlo dinámicamente
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE || '52428800'); // 50MB default

// =====================================================
// TIPOS LOCALES
// =====================================================

interface ParsedFormData {
  file: File;
  zone: Zone;
  development: string;
  type: DocumentContentType;
  uploaded_by: number;
}

// =====================================================
// ENDPOINT POST - UPLOAD DOCUMENT
// =====================================================

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  const startTime = Date.now();
  let tempFilePath: string | null = null;
  const logScope = 'upload';

  try {
    // 1. Parsear el FormData
    const formData = await request.formData();
    const parsedData = parseFormData(formData);
    
    if (!parsedData) {
      return NextResponse.json(
        { success: false, error: 'Datos del formulario incompletos' },
        { status: 400 }
      );
    }

    const { file, zone, development, type, uploaded_by } = parsedData;

    // 2. Validar archivo
    const fileValidation = validateFile(file);
    if (!fileValidation.valid) {
      return NextResponse.json(
        { success: false, error: fileValidation.error },
        { status: 400 }
      );
    }

    // 3. Verificar permisos del usuario
    const hasUploadPermission = await hasPermission(uploaded_by, 'upload_documents');
    const hasZoneAccess = await checkUserAccess(uploaded_by, zone, development, 'can_upload');
    
    if (!hasUploadPermission || !hasZoneAccess) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para subir documentos a este desarrollo' },
        { status: 403 }
      );
    }

    // 4. Guardar archivo temporalmente
    tempFilePath = await saveTemporaryFile(file);
    logger.debug('Temp file saved', { tempFilePath }, logScope);

    // 5. Extraer texto según el tipo de archivo
    const fileExtension = getFileExtension(file.name);
    const rawText = await extractText(tempFilePath, fileExtension);
    
    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se pudo extraer texto del documento' },
        { status: 400 }
      );
    }

    logger.debug('Raw text extracted', { length: rawText.length }, logScope);

    // 6. Limpiar el texto
    const cleanedText = cleanTextByType(rawText, fileExtension);
    logger.debug('Cleaned text', { length: cleanedText.length }, logScope);

    // 7. Crear chunks con metadatos
    const chunks = createPageAwareChunks(
      [cleanedText], // Tratamos todo como una página por ahora
      {
        zone,
        development,
        type,
        sourceFileName: file.name,
        uploaded_by,
      },
      {
        maxTokens: parseInt(process.env.CHUNK_SIZE || '500'),
        overlap: parseInt(process.env.CHUNK_OVERLAP || '50'),
      }
    );

    const chunkSummary = summarizeChunks(chunks);
    logger.debug('Chunks created', { chunkSummary }, logScope);

    // 8. Subir chunks a Pinecone
    const namespace = zone; // Usamos la zona como namespace
    await upsertChunks(namespace, chunks);
    logger.debug('Chunks upserted to Pinecone', { namespace, chunks: chunks.length }, logScope);

    // 9. Guardar metadata en PostgreSQL
    const documentMeta = await saveDocumentMeta({
      filename: file.name,
      zone,
      development,
      type,
      uploaded_by,
      pinecone_namespace: namespace,
      tags: extractTags(file.name, type),
    });
    logger.debug('Document metadata saved', { documentId: documentMeta.id }, logScope);

    // 10. Registrar acción en logs
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    await saveActionLog({
      user_id: uploaded_by,
      action_type: 'upload',
      resource_type: 'document',
      resource_id: documentMeta.id,
      zone,
      development,
      description: `Documento "${file.name}" subido y procesado`,
      metadata: {
        filename: file.name,
        type,
        chunks: chunks.length,
        namespace,
        processing_time_ms: Date.now() - startTime,
      },
      ip_address: clientIp,
      user_agent: userAgent,
    });

    // 11. Invalidar caché relacionado (documentos y desarrollos cambiaron)
    memoryCache.invalidate('documents*');
    memoryCache.invalidate('developments*');
    memoryCache.invalidate('stats*');
    logger.debug('Cache invalidated after upload', undefined, logScope);

    // 12. Limpiar archivo temporal
    await cleanupTempFile(tempFilePath);
    tempFilePath = null;

    const processingTime = Date.now() - startTime;
    logger.debug('Upload processed', { processingTimeMs: processingTime }, logScope);

    return NextResponse.json({
      success: true,
      message: 'Documento procesado exitosamente',
      chunks: chunks.length,
      pinecone_namespace: namespace,
      document_id: documentMeta.id,
    });

  } catch (error) {
    logger.error('Upload failed', error, { tempFilePath }, 'upload');
    
    // Limpiar archivo temporal en caso de error
    if (tempFilePath) {
      await cleanupTempFile(tempFilePath);
    }

    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error procesando el documento' 
      },
      { status: 500 }
    );
  }
}

// =====================================================
// FUNCIONES AUXILIARES
// =====================================================

/**
 * Parsea el FormData y valida campos requeridos
 */
function parseFormData(formData: FormData): ParsedFormData | null {
  const file = formData.get('file') as File | null;
  const zone = formData.get('zone') as Zone | null;
  const development = formData.get('development') as string | null;
  const type = formData.get('type') as DocumentContentType | null;
  const uploadedByRaw = formData.get('uploaded_by');
  
  if (!file || !zone || !development || !type || !uploadedByRaw) {
    return null;
  }

  const uploaded_by = typeof uploadedByRaw === 'string' 
    ? parseInt(uploadedByRaw, 10) 
    : uploadedByRaw as unknown as number;

  if (isNaN(uploaded_by)) {
    return null;
  }

  return { file, zone, development, type, uploaded_by };
}

/**
 * Valida el archivo subido
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Verificar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB` 
    };
  }

  // Verificar extensión
  const extension = getFileExtension(file.name);
  const allowedExtensions = ['pdf', 'csv', 'docx'];
  
  if (!allowedExtensions.includes(extension)) {
    return { 
      valid: false, 
      error: `Tipo de archivo no soportado. Permitidos: ${allowedExtensions.join(', ')}` 
    };
  }

  return { valid: true };
}

/**
 * Obtiene la extensión del archivo
 */
function getFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() || '';
}

/**
 * Guarda el archivo temporalmente
 */
async function saveTemporaryFile(file: File): Promise<string> {
  // Obtener el directorio temporal dinámicamente
  const uploadDir = getUploadDir();
  
  // Generar nombre único (lo necesitamos en ambos casos)
  const timestamp = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const filename = `${timestamp}_${safeName}`;
  
  // Intentar guardar el archivo
  // Si falla con el directorio detectado, intentar con /tmp como fallback
  let lastError: Error | null = null;
  
  // Lista de directorios a intentar (el detectado primero, luego /tmp como fallback)
  const dirsToTry = uploadDir !== '/tmp' ? [uploadDir, '/tmp'] : ['/tmp'];
  
  for (const dir of dirsToTry) {
    try {
      // Verificar si el directorio existe
      // En serverless, /tmp siempre existe, pero verificamos por si acaso
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
      
      // Intentar escribir el archivo
      const filepath = join(dir, filename);
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      await writeFile(filepath, buffer);
      
      // Si llegamos aquí, el archivo se guardó exitosamente
      return filepath;
      
    } catch (error) {
      // Guardar el error pero continuar con el siguiente directorio
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn('No se pudo usar el directorio, intentando siguiente opción', { dir, error: lastError.message }, 'upload');
      
      // Si este era el último directorio a intentar, lanzar el error
      if (dir === dirsToTry[dirsToTry.length - 1]) {
        throw new Error(
          `No se pudo crear el archivo temporal en ningún directorio disponible. ` +
          `Directorios intentados: ${dirsToTry.join(', ')}. ` +
          `Último error: ${lastError.message}`
        );
      }
    }
  }
  
  // Esto no debería ejecutarse nunca, pero TypeScript lo requiere
  throw new Error('Error inesperado al guardar archivo temporal');
}

/**
 * Extrae texto del archivo según su tipo
 */
async function extractText(filepath: string, extension: string): Promise<string> {
  switch (extension) {
    case 'pdf':
      return extractPDFText(filepath);
    case 'csv':
      return extractCSVText(filepath);
    case 'docx':
      return extractDOCXText(filepath);
    default:
      throw new Error(`Tipo de archivo no soportado: ${extension}`);
  }
}

/**
 * Extrae texto de un PDF
 * Intenta extracción estándar primero (rápida), luego OCR si es necesario (lenta)
 */
async function extractPDFText(filepath: string): Promise<string> {
  const fs = await import('fs');
  
  // PASO 1: Intento rápido con pdf-parse
  logger.debug('Trying fast PDF extraction (pdf-parse)', undefined, 'upload');
  const dataBuffer = fs.readFileSync(filepath);
  const standardText = await extractTextFromPDF(dataBuffer);

  // PASO 2: Verificar si necesita OCR
  if (needsOCR(standardText)) {
    logger.debug('PDF likely scanned (low text); trying OCR', undefined, 'upload');
    
    try {
      // Usar OCR (lento pero funciona con imágenes)
      const ocrText = await extractTextFromPDFWithOCR(filepath);
      logger.debug('OCR extraction succeeded', undefined, 'upload');
      return ocrText;
    } catch (ocrError) {
      // Si OCR falla, lanzar error claro para el usuario
      const errorMessage = ocrError instanceof Error ? ocrError.message : String(ocrError);
      logger.error('Error en OCR', ocrError, { errorMessage }, 'upload');
      
      // Si el error menciona que está deshabilitado, lanzar error específico
      if (errorMessage.includes('temporalmente deshabilitado')) {
        throw new Error(
          'Este PDF parece ser un documento escaneado (imagen). ' +
          'El OCR automático está temporalmente deshabilitado. ' +
          'Por favor, convierte el PDF a un formato con texto seleccionable antes de subirlo. ' +
          'Puedes usar Adobe Acrobat o herramientas online de OCR.'
        );
      }
      
      // Para otros errores, también lanzar error en lugar de continuar con texto vacío
      throw new Error(
        `No se pudo extraer texto del PDF escaneado: ${errorMessage}. ` +
        'Por favor, convierte el PDF a un formato con texto seleccionable antes de subirlo.'
      );
    }
  }

  logger.debug('Fast PDF extraction succeeded', undefined, 'upload');
  return standardText;
}

/**
 * Extrae texto de un CSV
 */
async function extractCSVText(filepath: string): Promise<string> {
  const fs = await import('fs/promises');
  const content = await fs.readFile(filepath, 'utf-8');
  
  // Convertir CSV a texto legible
  const lines = content.split('\n');
  const textParts: string[] = [];
  
  // Usar primera línea como headers
  const headers = lines[0]?.split(',').map(h => h.trim().replace(/"/g, ''));
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i]?.split(',').map(v => v.trim().replace(/"/g, ''));
    if (values && values.length > 0) {
      const pairs = headers?.map((h, idx) => `${h}: ${values[idx] || ''}`).join(', ');
      if (pairs) {
        textParts.push(pairs);
      }
    }
  }
  
  return textParts.join('\n');
}

/**
 * Extrae texto de un DOCX
 */
async function extractDOCXText(filepath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filepath });
  return result.value;
}

/**
 * Limpia el texto según el tipo de archivo
 */
function cleanTextByType(text: string, extension: string): string {
  switch (extension) {
    case 'pdf':
      return cleanPDFText(text);
    case 'csv':
      return cleanCSVText(text);
    case 'docx':
      return cleanDOCXText(text);
    default:
      return text;
  }
}

/**
 * Extrae tags del nombre de archivo y tipo
 */
function extractTags(filename: string, type: DocumentContentType): string[] {
  const tags: string[] = [type];
  
  // Extraer año si está en el nombre
  const yearMatch = filename.match(/20\d{2}/);
  if (yearMatch) {
    tags.push(yearMatch[0]);
  }
  
  // Agregar mes si está en formato común
  const monthMatch = filename.match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i);
  if (monthMatch) {
    tags.push(monthMatch[0].toLowerCase());
  }
  
  return tags;
}

/**
 * Limpia el archivo temporal
 */
async function cleanupTempFile(filepath: string): Promise<void> {
  try {
    if (existsSync(filepath)) {
      await unlink(filepath);
      logger.debug('Temp file deleted', { filepath }, 'upload');
    }
  } catch (error) {
    logger.warn('No se pudo eliminar archivo temporal', { error, filepath }, 'upload');
  }
}

// =====================================================
// ENDPOINT GET - INFO
// =====================================================

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: '/api/upload',
    method: 'POST',
    description: 'Sube un documento para procesamiento RAG',
    requiredFields: {
      file: 'PDF, CSV, o DOCX file',
      zone: 'Zone string (yucatan, puebla, quintana_roo, etc.)',
      development: 'Development name string',
      type: 'Document type (brochure, policy, price, inventory, etc.)',
      uploaded_by: 'User ID number',
    },
    maxFileSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
    supportedFormats: ['pdf', 'csv', 'docx'],
  });
}

