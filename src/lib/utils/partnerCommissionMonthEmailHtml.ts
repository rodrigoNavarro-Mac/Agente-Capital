import type { CommissionConfig, CommissionSale, PartnerCommission, PartnerInvoice } from '@/types/commissions';

/**
 * Minimal HTML escaping for text nodes pasted into emails.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoneyMx(n: number): string {
  return (
    '$' +
    n.toLocaleString('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const TH_STYLE =
  'padding:10px 8px;text-align:left;border:1px solid #e5e7eb;background:#f3f4f6;font-weight:700;font-size:12px;color:#374151;';
const TD_STYLE =
  'padding:10px 8px;border:1px solid #e5e7eb;vertical-align:top;font-size:13px;color:#111827;line-height:1.4;';
const MONO = "font-family:ui-monospace,'Cascadia Code','Segoe UI Mono',Consolas,monospace;";

function collectionStatusSpanish(
  status: string | null | undefined,
): string {
  if (status === 'pending_invoice') return 'Pendiente Facturar';
  if (status === 'invoiced') return 'Facturado';
  if (status === 'collected') return 'Cobrado';
  return status ? String(status) : '—';
}

type PartnerRowSource = PartnerCommission & {
  sale_info?: CommissionSale | null;
  saleInfo?: CommissionSale | null;
};

/**
 * Table-based, inline-styled HTML for email clients (no Tailwind).
 */
export function buildPartnerSalePhaseMonthEmailHtml(args: {
  monthLabel: string;
  monthKey: string;
  totalSocios: number;
  totalTransacciones: number;
  socios: string[];
  monthData: Record<string, PartnerRowSource[]>;
  sales: CommissionSale[];
  configs: CommissionConfig[];
  partnerInvoices: PartnerInvoice[];
  ivaPercent: number;
}): string {
  const calculateIva = (amount: number, isCash: boolean) =>
    isCash ? 0 : Number(((amount * args.ivaPercent) / 100).toFixed(2));
  const calculateTotalWithIva = (amount: number, isCash: boolean) =>
    Number((amount + calculateIva(amount, isCash)).toFixed(2));

  const NAVY = '#1e3d5c';
  const YELLOW = '#eab308';
  const LIGHT_YELLOW_BG = '#fefce8';
  const LIGHT_YELLOW_BORDER = '#fde047';

  let body = '';

  for (const socioName of args.socios) {
    const list = args.monthData[socioName] || [];
    const txnLabel = `${list.length} ${list.length === 1 ? 'transacción' : 'transacciones'}`;
    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td style="padding:12px 14px;background:${LIGHT_YELLOW_BG};border:1px solid ${LIGHT_YELLOW_BORDER};border-radius:6px;"><span style="font-size:15px;font-weight:700;color:#713f12;">${escapeHtml(
      socioName,
    )}</span> <span style="font-size:12px;color:#78716c;">${escapeHtml(txnLabel)}</span></td></tr></table>`;

    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;margin-bottom:22px;font-size:13px;"><thead><tr>
<th style="${TH_STYLE}">Concepto</th>
<th style="${TH_STYLE}">Lote</th>
<th style="${TH_STYLE}">Cliente</th>
<th style="${TH_STYLE}">Part.</th>
<th style="${TH_STYLE}">Monto</th>
<th style="${TH_STYLE}">IVA</th>
<th style="${TH_STYLE}">Total</th>
<th style="${TH_STYLE}">Estado</th>
<th style="${TH_STYLE}">Acciones</th>
</tr></thead><tbody>`;

    for (const commission of list) {
      const saleInfo =
        (commission as PartnerRowSource).sale_info ||
        commission.saleInfo ||
        args.sales.find((s) => s.id === commission.commission_sale_id);
      const lote = saleInfo?.producto || 'N/A';
      const cliente = saleInfo?.cliente_nombre || 'N/A';
      const desarrollo = saleInfo?.desarrollo || 'N/A';
      const desarrolloCapitalizado =
        desarrollo !== 'N/A' ? desarrollo.charAt(0).toUpperCase() + desarrollo.slice(1) : desarrollo;
      const concepto = `Comisión venta de lote ${lote} desarrollo ${desarrolloCapitalizado}`;

      const saleInfoFromAPI = (commission as PartnerRowSource).sale_info || commission.saleInfo;
      const saleInfoFromSales = args.sales.find((s) => s.id === commission.commission_sale_id);
      const saleInfoData = saleInfoFromAPI || saleInfoFromSales;

      const valorTotal = saleInfoData?.valor_total != null ? Number(saleInfoData.valor_total) : 0;
      const salePhasePercentFromSale =
        saleInfoData?.calculated_phase_sale_percent != null
          ? Number(saleInfoData.calculated_phase_sale_percent)
          : null;

      const config =
        desarrollo !== 'N/A'
          ? args.configs.find((c) => c.desarrollo.toLowerCase() === desarrollo.toLowerCase())
          : null;
      const salePhasePercentFromConfig = config ? Number(config.phase_sale_percent) : 0;
      const salePhasePercent =
        salePhasePercentFromSale != null ? salePhasePercentFromSale : salePhasePercentFromConfig;

      const salePhaseTotal =
        salePhasePercent > 0 && valorTotal > 0
          ? Number(((valorTotal * salePhasePercent) / 100).toFixed(2))
          : 0;

      const isCash = !!commission.sale_phase_is_cash_payment;
      const ivaAmt = calculateIva(salePhaseTotal, isCash);
      const totalAmt = calculateTotalWithIva(salePhaseTotal, isCash);

      const st = commission.sale_phase_collection_status || commission.collection_status;
      let estadoCell = escapeHtml(collectionStatusSpanish(st));
      if (isCash) {
        estadoCell += `<br/><span style="font-size:11px;color:#6b7280;">Efectivo (sin IVA)</span>`;
      }

      const invoice = args.partnerInvoices.find((inv) => inv.partner_commission_id === commission.id);
      const hasInvoice = invoice?.invoice_pdf_path != null && invoice?.invoice_pdf_path !== undefined;
      const accionesTxt = hasInvoice ? 'Factura registrada' : '—';

      body += `<tr>
<td style="${TD_STYLE}">${escapeHtml(concepto)}</td>
<td style="${TD_STYLE}">${escapeHtml(lote)}</td>
<td style="${TD_STYLE}">${escapeHtml(cliente)}</td>
<td style="${TD_STYLE}">${escapeHtml(Number(commission.participacion).toFixed(2) + '%')}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(salePhaseTotal))}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(ivaAmt))}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(totalAmt))}</td>
<td style="${TD_STYLE}">${estadoCell}</td>
<td style="${TD_STYLE}">${escapeHtml(accionesTxt)}</td>
</tr>`;

      if (Number(commission.post_sale_phase_amount || 0) > 0) {
        const valorTotalPV = saleInfo?.valor_total != null ? Number(saleInfo.valor_total) : 0;
        const postSalePhasePercent =
          saleInfo?.calculated_phase_post_sale_percent != null
            ? Number(saleInfo.calculated_phase_post_sale_percent)
            : (() => {
                const dev = saleInfo?.desarrollo;
                const cfg = dev
                  ? args.configs.find((c) => c.desarrollo.toLowerCase() === dev.toLowerCase())
                  : null;
                return cfg ? Number(cfg.phase_post_sale_percent) : 0;
              })();
        const postSalePhaseTotal =
          postSalePhasePercent > 0 && valorTotalPV > 0
            ? Number(((valorTotalPV * postSalePhasePercent) / 100).toFixed(2))
            : 0;
        const pst = commission.post_sale_phase_collection_status || commission.collection_status;
        const postLabel = collectionStatusSpanish(pst);
        body += `<tr><td colspan="9" style="padding:12px 14px;background:#eff6ff;border:1px solid #bfdbfe;">
<div style="font-size:12px;color:#1e40af;font-weight:700;margin-bottom:6px;">Fase postventa (referencia)</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:12px;color:#1d4ed8;">Monto fase</td>
<td style="font-size:12px;color:#1d4ed8;text-align:right;font-weight:600;">${escapeHtml(formatMoneyMx(postSalePhaseTotal))}</td>
</tr><tr><td colspan="2" style="padding-top:8px;">
<span style="display:inline-block;padding:3px 10px;border-radius:999px;border:1px solid #93c5fd;font-size:11px;color:#1e3a8a;background:#ffffff;">${escapeHtml(postLabel)}</span>
</td></tr></table></td></tr>`;
      }
    }

    body += `</tbody></table>`;
  }

  const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border-collapse:collapse;"><tr><td style="background:${NAVY};color:#ffffff;padding:16px 18px;border-radius:8px 8px 0 0;">
<div style="font-size:20px;font-weight:700;line-height:1.25;">${escapeHtml(args.monthLabel)}</div>
<div style="margin-top:10px;font-size:13px;opacity:0.95;">
<span style="display:inline-block;padding:5px 12px;background:${YELLOW};border-radius:999px;font-weight:700;color:#422006;margin-right:8px;">${escapeHtml(args.monthKey)}</span>
${escapeHtml(String(args.totalSocios))} ${args.totalSocios === 1 ? 'socio' : 'socios'} · ${escapeHtml(String(args.totalTransacciones))} ${args.totalTransacciones === 1 ? 'transacción' : 'transacciones'}
</div>
<div style="margin-top:8px;font-size:12px;opacity:0.9;">Comisiones a socios · Fase venta</div>
</td></tr></table>`;

  return `<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">${header}${body}</div>`;
}

export function buildPartnerPostPhaseMonthEmailHtml(args: {
  monthLabel: string;
  monthKey: string;
  totalSocios: number;
  totalTransacciones: number;
  socios: string[];
  monthData: Record<string, PartnerRowSource[]>;
  sales: CommissionSale[];
  configs: CommissionConfig[];
  partnerInvoices: PartnerInvoice[];
  ivaPercent: number;
}): string {
  const calculateIva = (amount: number, isCash: boolean) =>
    isCash ? 0 : Number(((amount * args.ivaPercent) / 100).toFixed(2));
  const calculateTotalWithIva = (amount: number, isCash: boolean) =>
    Number((amount + calculateIva(amount, isCash)).toFixed(2));

  const NAVY = '#1e3d5c';
  const YELLOW = '#eab308';
  const LIGHT_YELLOW_BG = '#fefce8';
  const LIGHT_YELLOW_BORDER = '#fde047';

  let body = '';

  for (const socioName of args.socios) {
    const list = args.monthData[socioName] || [];
    const txnLabel = `${list.length} ${list.length === 1 ? 'transacción' : 'transacciones'}`;
    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;"><tr><td style="padding:12px 14px;background:${LIGHT_YELLOW_BG};border:1px solid ${LIGHT_YELLOW_BORDER};border-radius:6px;"><span style="font-size:15px;font-weight:700;color:#713f12;">${escapeHtml(
      socioName,
    )}</span> <span style="font-size:12px;color:#78716c;">${escapeHtml(txnLabel)}</span></td></tr></table>`;

    body += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;margin-bottom:22px;font-size:13px;"><thead><tr>
<th style="${TH_STYLE}">Concepto</th>
<th style="${TH_STYLE}">Lote</th>
<th style="${TH_STYLE}">Cliente</th>
<th style="${TH_STYLE}">Part.</th>
<th style="${TH_STYLE}">Monto</th>
<th style="${TH_STYLE}">IVA</th>
<th style="${TH_STYLE}">Total</th>
<th style="${TH_STYLE}">Estado</th>
<th style="${TH_STYLE}">Acciones</th>
</tr></thead><tbody>`;

    for (const commission of list) {
      const saleInfoFromAPI = (commission as PartnerRowSource).sale_info || commission.saleInfo;
      const saleInfoFromSales = args.sales.find((s) => s.id === commission.commission_sale_id);
      const saleInfo = saleInfoFromAPI || saleInfoFromSales;

      const lote = saleInfo?.producto || 'N/A';
      const cliente = saleInfo?.cliente_nombre || 'N/A';
      const esContado = (commission as PartnerRowSource & { esContado?: boolean }).esContado === true;
      let concepto = `Comisión por fase postventa de ${lote} ${cliente}`;
      if (esContado) {
        concepto += ' (Contado)';
      }

      const valorTotal =
        saleInfo?.valor_total != null
          ? Number(saleInfo.valor_total)
          : saleInfoFromSales?.valor_total != null
            ? Number(saleInfoFromSales.valor_total)
            : 0;

      const postSalePhasePercentFromSale =
        saleInfo?.calculated_phase_post_sale_percent != null
          ? Number(saleInfo.calculated_phase_post_sale_percent)
          : saleInfoFromSales?.calculated_phase_post_sale_percent != null
            ? Number(saleInfoFromSales.calculated_phase_post_sale_percent)
            : null;

      const desarrollo = saleInfo?.desarrollo || saleInfoFromSales?.desarrollo;
      const config = desarrollo
        ? args.configs.find((c) => c.desarrollo.toLowerCase() === desarrollo.toLowerCase())
        : null;
      const postSalePhasePercentFromConfig = config ? Number(config.phase_post_sale_percent) : 0;
      const postSalePhasePercent =
        postSalePhasePercentFromSale != null ? postSalePhasePercentFromSale : postSalePhasePercentFromConfig;

      const postSalePhaseTotal =
        postSalePhasePercent > 0 && valorTotal > 0
          ? Number(((valorTotal * postSalePhasePercent) / 100).toFixed(2))
          : 0;

      const isCash = !!commission.post_sale_phase_is_cash_payment;
      const ivaAmt = calculateIva(postSalePhaseTotal, isCash);
      const totalAmt = calculateTotalWithIva(postSalePhaseTotal, isCash);

      const st = commission.post_sale_phase_collection_status || commission.collection_status;
      let estadoCell = escapeHtml(collectionStatusSpanish(st));
      if (isCash) {
        estadoCell += `<br/><span style="font-size:11px;color:#6b7280;">Efectivo (sin IVA)</span>`;
      }

      const invoice = args.partnerInvoices.find((inv) => inv.partner_commission_id === commission.id);
      const hasInvoice = invoice?.invoice_pdf_path != null && invoice?.invoice_pdf_path !== undefined;
      const accionesTxt = hasInvoice ? 'Factura registrada' : '—';

      body += `<tr>
<td style="${TD_STYLE}">${escapeHtml(concepto)}</td>
<td style="${TD_STYLE}">${escapeHtml(lote)}</td>
<td style="${TD_STYLE}">${escapeHtml(cliente)}</td>
<td style="${TD_STYLE}">${escapeHtml(Number(commission.participacion).toFixed(2) + '%')}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(postSalePhaseTotal))}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(ivaAmt))}</td>
<td style="${TD_STYLE};${MONO}">${escapeHtml(formatMoneyMx(totalAmt))}</td>
<td style="${TD_STYLE}">${estadoCell}</td>
<td style="${TD_STYLE}">${escapeHtml(accionesTxt)}</td>
</tr>`;
    }

    body += `</tbody></table>`;
  }

  const header = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;border-collapse:collapse;"><tr><td style="background:${NAVY};color:#ffffff;padding:16px 18px;border-radius:8px 8px 0 0;">
<div style="font-size:20px;font-weight:700;line-height:1.25;">${escapeHtml(args.monthLabel)}</div>
<div style="margin-top:10px;font-size:13px;opacity:0.95;">
<span style="display:inline-block;padding:5px 12px;background:${YELLOW};border-radius:999px;font-weight:700;color:#422006;margin-right:8px;">${escapeHtml(args.monthKey)}</span>
${escapeHtml(String(args.totalSocios))} ${args.totalSocios === 1 ? 'socio' : 'socios'} · ${escapeHtml(String(args.totalTransacciones))} ${args.totalTransacciones === 1 ? 'transacción' : 'transacciones'}
</div>
<div style="margin-top:8px;font-size:12px;opacity:0.9;">Comisiones a socios · Fase postventa</div>
</td></tr></table>`;

  return `<div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;padding:18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">${header}${body}</div>`;
}
