import type { CommissionDistribution, CommissionPaymentStatus } from '@/types/commissions';
import { getRoleDisplayName } from '@/lib/domain/commission-calculator';
import { escapeHtml } from '@/lib/utils/partnerCommissionMonthEmailHtml';

export type DashboardDistributionEmailRow = CommissionDistribution & {
  producto: string | null;
  fecha_firma: string;
  cliente_nombre: string;
  desarrollo: string;
  plazo_deal: string | null;
};

function formatMoneyMx(n: number): string {
  return (
    '$' +
    n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** sin punto y coma final: se concatenan alineaciones u otras props */
const TH_BASE =
  'padding:10px 8px;border:1px solid #bae6fd;background:#e0f2fe;font-weight:700;font-size:12px;color:#075985';
const TH_LEFT = `${TH_BASE};text-align:left`;
const TH_RIGHT = `${TH_BASE};text-align:right`;
const TD_STYLE =
  'padding:10px 8px;border:1px solid #e5e7eb;vertical-align:top;font-size:13px;color:#111827;line-height:1.4';
const TD_NUM = `${TD_STYLE};font-family:ui-monospace,'Segoe UI Mono',Consolas,monospace;text-align:right`;

function calculateIva(amount: number, isCash: boolean, ivaPercent: number): number {
  if (isCash) return 0;
  return Number(((amount * ivaPercent) / 100).toFixed(2));
}

function calculateTotalWithIva(amount: number, isCash: boolean, ivaPercent: number): number {
  if (isCash) return Number(amount.toFixed(2));
  return Number((amount + calculateIva(amount, isCash, ivaPercent)).toFixed(2));
}

function formatDistributionFecha(dist: DashboardDistributionEmailRow): string {
  if (dist.phase === 'post_sale' && dist.plazo_deal) {
    const match = String(dist.plazo_deal).match(/(\d+)/);
    const months = match ? parseInt(match[1], 10) : 0;
    if (months > 0) {
      const date = new Date(dist.fecha_firma);
      date.setMonth(date.getMonth() + months);
      return date.toLocaleDateString('es-MX');
    }
  }
  return new Date(dist.fecha_firma).toLocaleDateString('es-MX');
}

function phaseLabel(phase: string): string {
  if (phase === 'sale') return 'Venta';
  if (phase === 'post_sale') return 'Postventa';
  return 'Utilidad';
}

function paymentStatusLabel(status: CommissionPaymentStatus | string | undefined): string {
  switch (status) {
    case 'paid':
      return 'Pagada';
    case 'pending':
      return 'Pendiente';
    case 'SOLICITADA':
      return 'Solicitada';
    case 'NO_APLICA':
      return 'No aplica';
    default:
      return status ? String(status) : '—';
  }
}

function paymentFilterHuman(
  f: 'all' | 'pending' | 'paid' | 'SOLICITADA' | 'NO_APLICA' | undefined,
): string {
  switch (f) {
    case 'paid':
      return 'Pagadas';
    case 'pending':
      return 'Pendientes';
    case 'SOLICITADA':
      return 'Solicitadas';
    case 'NO_APLICA':
      return 'No aplica';
    default:
      return 'Todas (excl. no aplica)';
  }
}

function conceptoRow(dist: DashboardDistributionEmailRow): string {
  const prod = dist.producto || '-';
  const dev = dist.desarrollo || '-';
  return `Comisión de venta de ${escapeHtml(prod)} del desarrollo <span style="text-transform:capitalize">${escapeHtml(dev)}</span>`;
}

/**
 * HTML con estilos inline para correo: resumen mensual de «Comisiones a pagar»
 * cuando el dashboard está filtrado por asesor/persona.
 */
export function buildDashboardAdvisorMonthCommissionsPayEmailHtml(args: {
  advisorName: string;
  selectedYear: number;
  month: number;
  monthHumanLabel: string;
  monthYearKey: string;
  distributions: DashboardDistributionEmailRow[];
  ivaPercent: number;
  paymentStatusFilter: 'all' | 'pending' | 'paid' | 'SOLICITADA' | 'NO_APLICA';
}): string {
  const GOLD = '#ca8a04';
  const rows = args.distributions;

  const totalMonth = rows.reduce((sum, d) => sum + Number(d.amount_calculated || 0), 0);
  const totalIvaMonth = rows.reduce(
    (sum, d) => sum + calculateIva(Number(d.amount_calculated || 0), d.is_cash_payment || false, args.ivaPercent),
    0,
  );
  const totalConIvaMonth = rows.reduce(
    (sum, d) => sum + calculateTotalWithIva(Number(d.amount_calculated || 0), d.is_cash_payment || false, args.ivaPercent),
    0,
  );
  const numTx = rows.length;

  let tableBody = '';
  for (const dist of rows) {
    const amount = Number(dist.amount_calculated || 0);
    const isCash = dist.is_cash_payment || false;
    const iva = calculateIva(amount, isCash, args.ivaPercent);
    const totalConIva = calculateTotalWithIva(amount, isCash, args.ivaPercent);

    const comisionCell = escapeHtml(formatMoneyMx(amount)) +
      (isCash
        ? '<br/><span style="font-size:10px;color:#15803d;font-weight:600;">EFECTIVO</span>'
        : '');

    const facturaTxt = dist.invoice_pdf_path ? 'Adjunta' : 'Sin adjuntar';

    tableBody += `<tr>
<td style="${TD_STYLE}">${conceptoRow(dist)}</td>
<td style="${TD_STYLE}">${escapeHtml(formatDistributionFecha(dist))}</td>
<td style="${TD_STYLE}">${escapeHtml(dist.person_name)}</td>
<td style="${TD_STYLE}">${escapeHtml(getRoleDisplayName(dist.role_type))}</td>
<td style="${TD_STYLE}"><span style="display:inline-block;padding:2px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:11px;">${escapeHtml(
      phaseLabel(dist.phase),
    )}</span></td>
<td style="${TD_NUM}">${comisionCell}</td>
<td style="${TD_NUM}">${escapeHtml(formatMoneyMx(iva))}</td>
<td style="${TD_NUM};font-weight:700">${escapeHtml(formatMoneyMx(totalConIva))}</td>
<td style="${TD_STYLE}">${escapeHtml(paymentStatusLabel(dist.payment_status))}</td>
<td style="${TD_STYLE}">${escapeHtml(facturaTxt)}</td>
</tr>`;
  }

  const totalsHeaderRight = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right" style="border-collapse:collapse;"><tr>
<td style="text-align:right;padding:0 0 0 16px;vertical-align:top;">
<div style="font-size:10px;color:#64748b;">Subtotal</div>
<div style="font-size:13px;font-weight:600;color:#111827;">${escapeHtml(formatMoneyMx(totalMonth))}</div>
</td>
<td style="text-align:right;padding:0 0 0 16px;vertical-align:top;">
<div style="font-size:10px;color:#64748b;">IVA</div>
<div style="font-size:13px;font-weight:600;color:#111827;">${escapeHtml(formatMoneyMx(totalIvaMonth))}</div>
</td>
<td style="text-align:right;padding:0 0 0 16px;vertical-align:top;">
<div style="font-size:10px;color:#64748b;">Total mes</div>
<div style="font-size:18px;font-weight:800;color:#111827;line-height:1.2;">${escapeHtml(formatMoneyMx(totalConIvaMonth))}</div>
</td>
</tr></table>`;

  const cardHeader = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-bottom:0;">
<tr>
<td valign="top" align="left" style="padding:0 12px 0 0;">
<div style="font-size:15px;font-weight:700;color:${GOLD};line-height:1.3;">${escapeHtml(args.monthHumanLabel)}</div>
<div style="margin-top:8px;line-height:1.5;">
<span style="display:inline-block;background:#e2e8f0;color:#475569;padding:4px 8px;border-radius:4px;font-size:11px;font-weight:600;">${escapeHtml(args.monthYearKey)}</span>
<span style="font-size:11px;color:#64748b;margin-left:8px;">${escapeHtml(String(numTx))} ${numTx === 1 ? 'transacción' : 'transacciones'}</span>
</div>
</td>
<td valign="top" align="right" style="padding:0;">${totalsHeaderRight}</td>
</tr>
</table>
<div style="height:2px;background:${GOLD};margin-top:12px;"></div>
<div style="margin-top:10px;margin-bottom:4px;font-size:11px;color:#64748b;line-height:1.4;">
Comisiones a pagar · Dashboard · Asesor: ${escapeHtml(args.advisorName)} · Filtro: ${escapeHtml(paymentFilterHuman(args.paymentStatusFilter))}
</div>`;

  const thead = `<thead><tr>
<th style="${TH_LEFT}">Concepto</th>
<th style="${TH_LEFT}">Fecha</th>
<th style="${TH_LEFT}">Persona</th>
<th style="${TH_LEFT}">Rol</th>
<th style="${TH_LEFT}">Fase</th>
<th style="${TH_RIGHT}">Comisión</th>
<th style="${TH_RIGHT}">IVA</th>
<th style="${TH_RIGHT}">Total</th>
<th style="${TH_LEFT}">Estado</th>
<th style="${TH_LEFT}">Factura</th>
</tr></thead>`;

  const mainTable = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;border:1px solid #e5e7eb;font-size:13px;">${thead}<tbody>${tableBody}</tbody></table>`;

  return `<div style="max-width:900px;margin:0 auto;background:#f8fafc;padding:14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
<div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px 16px;">${cardHeader}${mainTable}</div>
</div>`;
}
