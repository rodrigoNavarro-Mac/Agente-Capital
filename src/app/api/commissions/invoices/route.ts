/**
 * =====================================================
 * API: Facturas PDF de Comisiones
 * =====================================================
 * Endpoints para subir, visualizar, descargar y eliminar
 * facturas PDF asociadas a distribuciones de comisiones
 */

import { NextRequest, NextResponse } from 'next/server';
import { extractTokenFromHeader, verifyAccessToken } from '@/lib/auth/auth';
import { readFile, unlink, mkdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { query } from '@/lib/db/postgres';
import { logger } from '@/lib/utils/logger';
import type { APIResponse } from '@/types/documents';

export const dynamic = 'force-dynamic';

// Roles permitidos para gestionar facturas
const ALLOWED_ROLES = ['admin', 'ceo'];

// Tamaño máximo de archivo: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Obtiene el directorio para almacenar facturas
 */
function getInvoicesDir(): string {
  // En producción/serverless usar /tmp/invoices
  // En desarrollo usar ./uploads/invoices
  const isServerless = !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.NEXT_RUNTIME === 'nodejs'
  );
  
  return isServerless ? '/tmp/invoices' : './uploads/invoices';
}

/**
 * POST /api/commissions/invoices
 * Sube una factura PDF para una distribución de comisión
 * Body: FormData con 'file' (PDF) y 'distribution_id' (number)
 */
export async function POST(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    // Parsear FormData
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const distributionId = formData.get('distribution_id');
    const partnerCommissionId = formData.get('partner_commission_id');

    if (!file || (!distributionId && !partnerCommissionId)) {
      return NextResponse.json(
        { success: false, error: 'Archivo y distribution_id o partner_commission_id son requeridos' },
        { status: 400 }
      );
    }

    // Validar que sea PDF
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { success: false, error: 'Solo se permiten archivos PDF' },
        { status: 400 }
      );
    }

    // Validar tamaño
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }

    // Crear directorio si no existe
    const invoicesDir = getInvoicesDir();
    if (!existsSync(invoicesDir)) {
      await mkdir(invoicesDir, { recursive: true });
    }

    // Generar nombre único para el archivo
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const idToUse = distributionId || partnerCommissionId;
    const filename = `invoice_${idToUse}_${timestamp}_${safeName}`;
    const filepath = join(invoicesDir, filename);

    // Leer y guardar el archivo
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Comprimir PDF si es posible (por ahora solo guardamos, la compresión real requeriría pdf-lib)
    // Para compresión real, se podría usar una librería como pdf-lib o pdf2pic
    await writeFile(filepath, buffer);

    // Si es para distribución de comisión interna
    if (distributionId) {
      // Verificar que la distribución existe
      const distResult = await query<{ id: number }>(
        'SELECT id FROM commission_distributions WHERE id = $1',
        [parseInt(distributionId as string, 10)]
      );

      if (distResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Distribución no encontrada' },
          { status: 404 }
        );
      }

      // Si ya existe una factura anterior, eliminarla
      const existingResult = await query<{ invoice_pdf_path: string | null }>(
        'SELECT invoice_pdf_path FROM commission_distributions WHERE id = $1',
        [parseInt(distributionId as string, 10)]
      );

      if (existingResult.rows[0]?.invoice_pdf_path) {
        try {
          const oldPath = existingResult.rows[0].invoice_pdf_path;
          if (existsSync(oldPath)) {
            await unlink(oldPath);
          }
        } catch (error) {
          logger.warn('Error eliminando factura anterior', { error }, 'commissions-invoices');
        }
      }

      // Guardar ruta en la base de datos
      await query(
        'UPDATE commission_distributions SET invoice_pdf_path = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [filepath, parseInt(distributionId as string, 10)]
      );
    } 
    // Si es para comisión de socio
    else if (partnerCommissionId) {
      // Verificar que la comisión de socio existe
      const partnerResult = await query<{ id: number }>(
        'SELECT id FROM partner_commissions WHERE id = $1',
        [parseInt(partnerCommissionId as string, 10)]
      );

      if (partnerResult.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Comisión de socio no encontrada' },
          { status: 404 }
        );
      }

      // Buscar o crear factura para esta comisión
      const invoiceResult = await query<{ id: number; invoice_pdf_path: string | null }>(
        'SELECT id, invoice_pdf_path FROM partner_invoices WHERE partner_commission_id = $1',
        [parseInt(partnerCommissionId as string, 10)]
      );

      // Si ya existe una factura anterior, eliminarla
      if (invoiceResult.rows.length > 0 && invoiceResult.rows[0].invoice_pdf_path) {
        try {
          const oldPath = invoiceResult.rows[0].invoice_pdf_path;
          if (existsSync(oldPath)) {
            await unlink(oldPath);
          }
        } catch (error) {
          logger.warn('Error eliminando factura anterior', { error }, 'commissions-invoices');
        }

        // Actualizar factura existente
        await query(
          'UPDATE partner_invoices SET invoice_pdf_path = $1, invoice_pdf_uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [filepath, invoiceResult.rows[0].id]
        );
      } else {
        // Crear nueva factura si no existe
        // Usar la fecha actual como invoice_date
        const invoiceDate = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        await query(
          `INSERT INTO partner_invoices (partner_commission_id, invoice_pdf_path, invoice_pdf_uploaded_at, invoice_date, invoice_amount, created_by)
           VALUES ($1, $2, CURRENT_TIMESTAMP, $3, 0, $4)`,
          [parseInt(partnerCommissionId as string, 10), filepath, invoiceDate, payload.userId]
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        filepath,
        filename,
        size: file.size,
      },
    });
  } catch (error) {
    logger.error('Error subiendo factura', error, {}, 'commissions-invoices');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error subiendo factura',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/commissions/invoices
 * Obtiene o descarga una factura PDF
 * Query params: ?distribution_id=xxx&download=true (opcional)
 */
export async function GET(request: NextRequest): Promise<NextResponse | NextResponse<APIResponse<any>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const distributionId = searchParams.get('distribution_id');
    const download = searchParams.get('download') === 'true';

    if (!distributionId) {
      return NextResponse.json(
        { success: false, error: 'distribution_id es requerido' },
        { status: 400 }
      );
    }

    // Obtener ruta del archivo
    const result = await query<{ invoice_pdf_path: string | null }>(
      'SELECT invoice_pdf_path FROM commission_distributions WHERE id = $1',
      [parseInt(distributionId, 10)]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Distribución no encontrada' },
        { status: 404 }
      );
    }

    const filepath = result.rows[0].invoice_pdf_path;

    if (!filepath || !existsSync(filepath)) {
      return NextResponse.json(
        { success: false, error: 'Factura no encontrada' },
        { status: 404 }
      );
    }

    // Leer archivo
    const fileBuffer = await readFile(filepath);
    const filename = filepath.split('/').pop() || 'invoice.pdf';

    // Devolver como PDF
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': download
          ? `attachment; filename="${filename}"`
          : `inline; filename="${filename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    logger.error('Error obteniendo factura', error, {}, 'commissions-invoices');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error obteniendo factura',
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/commissions/invoices
 * Elimina una factura PDF
 * Query params: ?distribution_id=xxx
 */
export async function DELETE(request: NextRequest): Promise<NextResponse<APIResponse<any>>> {
  try {
    // Verificar autenticación
    const authHeader = request.headers.get('authorization');
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'No autorizado' },
        { status: 401 }
      );
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
      return NextResponse.json(
        { success: false, error: 'Token inválido o expirado' },
        { status: 401 }
      );
    }

    // Verificar permisos
    if (!ALLOWED_ROLES.includes(payload.role || '')) {
      return NextResponse.json(
        { success: false, error: 'No tienes permisos para acceder a esta funcionalidad' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const distributionId = searchParams.get('distribution_id');

    if (!distributionId) {
      return NextResponse.json(
        { success: false, error: 'distribution_id es requerido' },
        { status: 400 }
      );
    }

    // Obtener ruta del archivo
    const result = await query<{ invoice_pdf_path: string | null }>(
      'SELECT invoice_pdf_path FROM commission_distributions WHERE id = $1',
      [parseInt(distributionId, 10)]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Distribución no encontrada' },
        { status: 404 }
      );
    }

    const filepath = result.rows[0].invoice_pdf_path;

    // Eliminar archivo físico si existe
    if (filepath && existsSync(filepath)) {
      try {
        await unlink(filepath);
      } catch (error) {
        logger.warn('Error eliminando archivo físico', { error }, 'commissions-invoices');
      }
    }

    // Actualizar base de datos
    await query(
      'UPDATE commission_distributions SET invoice_pdf_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [parseInt(distributionId, 10)]
    );

    return NextResponse.json({
      success: true,
      message: 'Factura eliminada correctamente',
    });
  } catch (error) {
    logger.error('Error eliminando factura', error, {}, 'commissions-invoices');
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error eliminando factura',
      },
      { status: 500 }
    );
  }
}




