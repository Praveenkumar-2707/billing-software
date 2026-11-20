import type { Invoice, PaymentRecord, UserProfile } from '../types';
import { formatINR, formatMonthLabel } from './format';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildCustomerBillHtml(
  invoice: Invoice,
  profile: UserProfile | null,
  invoicePayments: PaymentRecord[] = [],
  latestPaymentNote?: { amount: number; method: string; referenceNo: string }
): string {
  const isPaid = invoice.paymentStatus === 'paid' || invoice.remainingAmount <= 0;
  const remainingAmt = isPaid ? 0 : invoice.remainingAmount;
  const storeName = escapeHtml(profile?.businessName || 'ArthaMart Supermarket');
  const storeGstin = escapeHtml(profile?.gstin || '—');
  const storeState = escapeHtml(profile?.stateCode || '—');
  const storeDistrict = profile?.district ? ` · District: ${escapeHtml(profile.district)}` : '';
  const storeAddress = escapeHtml(profile?.address || '');

  const lineRows = invoice.lineItems
    .map(
      (item) => `
      <tr>
        <td>
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="mono muted">${escapeHtml(item.sku)}</div>
        </td>
        <td class="mono">${escapeHtml(item.hsnCode)}</td>
        <td class="right mono">${item.qty} ${escapeHtml(item.unit)}</td>
        <td class="right mono">${escapeHtml(formatINR(item.unitPrice))}</td>
        <td class="right mono">${escapeHtml(formatINR(item.taxableValue))}</td>
        <td class="right mono">${escapeHtml(formatINR(item.gstAmount))} (${item.gstRate}%)</td>
        <td class="right mono bold">${escapeHtml(formatINR(item.lineTotal))}</td>
      </tr>`
    )
    .join('');

  const paymentRows =
    invoicePayments.length > 0
      ? invoicePayments
          .map(
            (p) => `
          <tr>
            <td class="mono">${escapeHtml(p.referenceNo || '—')}</td>
            <td>${escapeHtml(p.paymentMethod)}</td>
            <td class="right mono">${escapeHtml(formatINR(p.amount))}</td>
          </tr>`
          )
          .join('')
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tax Invoice & Payment Bill - ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #171717;
      background: #f5f5f5;
      margin: 0;
      padding: 28px 16px;
      line-height: 1.5;
    }
    .sheet {
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #d4d4d4;
      border-radius: 12px;
      padding: 32px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e5e5e5;
      flex-wrap: wrap;
    }
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #b91c1c; }
    h1 { margin: 4px 0 6px; font-size: 22px; color: #171717; }
    .meta { font-size: 12px; color: #525252; }
    .right { text-align: right; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .muted { color: #737373; font-size: 11px; }
    .bold { font-weight: 700; }
    .status-paid { color: #047857; font-weight: 700; }
    .status-pending { color: #b91c1c; font-weight: 700; }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin: 20px 0;
      font-size: 12px;
    }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th {
      background: #f5f5f5;
      color: #525252;
      font-weight: 600;
      padding: 10px 12px;
      border-bottom: 1px solid #d4d4d4;
      text-align: left;
    }
    th.right { text-align: right; }
    td { padding: 10px 12px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
    .table-box { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-top: 16px; }
    .summary-wrap {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      margin-top: 22px;
      flex-wrap: wrap;
    }
    .totals { width: 320px; margin-left: auto; font-size: 12px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; color: #525252; }
    .totals-grand {
      display: flex;
      justify-content: space-between;
      padding: 10px 0 6px;
      margin-top: 6px;
      border-top: 1px solid #d4d4d4;
      font-size: 14px;
      font-weight: 700;
      color: #171717;
    }
    .pending-box {
      margin-top: 10px;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid ${isPaid ? '#a7f3d0' : '#fecaca'};
      background: ${isPaid ? '#ecfdf5' : '#fef2f2'};
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      font-weight: 700;
      color: ${isPaid ? '#065f46' : '#991b1b'};
    }
    .receipt-notice {
      margin-top: 16px;
      padding: 10px 14px;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      font-size: 12px;
      color: #991b1b;
    }
    .print-bar { max-width: 820px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    .print-btn {
      padding: 8px 16px;
      background: #b91c1c;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .print-bar { display: none; }
      .sheet { border: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="kicker">Supermarket Tax Invoice &amp; Payment Statement</div>
        <h1>${storeName}</h1>
        <div class="meta">
          <div>GSTIN: <span class="mono bold">${storeGstin}</span></div>
          <div>State: ${storeState}${storeDistrict}</div>
          <div>${storeAddress}</div>
        </div>
      </div>
      <div class="meta right">
        <div>Invoice Number: <span class="mono bold">${escapeHtml(invoice.invoiceNumber)}</span></div>
        <div>Billing Cycle: <strong>${escapeHtml(formatMonthLabel(invoice.billingMonth))}</strong></div>
        <div>Due Date: <span class="mono">${escapeHtml(invoice.dueDate)}</span></div>
        <div>Status: <span class="${isPaid ? 'status-paid' : 'status-pending'}">${isPaid ? 'PAID IN FULL' : 'REMAINING BALANCE PENDING'}</span></div>
      </div>
    </div>

    ${
      latestPaymentNote
        ? `<div class="receipt-notice">
            <strong>Payment Recorded:</strong> ${escapeHtml(formatINR(latestPaymentNote.amount))} received via ${escapeHtml(latestPaymentNote.method)} (Ref: <span class="mono">${escapeHtml(latestPaymentNote.referenceNo)}</span>). Remaining pending amount updated below.
          </div>`
        : ''
    }

    <div class="grid-2">
      <div>
        <div class="muted bold">Billed To</div>
        <div style="font-size:14px;font-weight:700;margin-top:2px;">${escapeHtml(invoice.customerName)}</div>
        ${invoice.customerCompany ? `<div>${escapeHtml(invoice.customerCompany)}</div>` : ''}
        <div class="meta">Phone: ${escapeHtml(invoice.customerPhone)}</div>
        <div class="meta">GSTIN: <span class="mono">${escapeHtml(invoice.customerGstin || 'Unregistered')}</span></div>
        <div class="meta">Place of Supply: ${escapeHtml(invoice.customerState)}</div>
      </div>
      <div class="right">
        <div class="muted bold">Tax Classification</div>
        <div style="font-weight:600;margin-top:2px;">
          ${invoice.isInterState ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)'}
        </div>
        <div class="meta" style="margin-top:4px;">Generated: ${escapeHtml(new Date().toLocaleString('en-IN'))}</div>
      </div>
    </div>

    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Item Description</th>
            <th>HSN</th>
            <th class="right">Qty</th>
            <th class="right">Rate</th>
            <th class="right">Taxable</th>
            <th class="right">GST</th>
            <th class="right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>
    </div>

    ${
      paymentRows
        ? `<div style="margin-top:18px;">
            <div class="muted bold">Payments Recorded on This Bill</div>
            <div class="table-box" style="margin-top:6px;">
              <table>
                <thead>
                  <tr>
                    <th>Reference No</th>
                    <th>Payment Mode</th>
                    <th class="right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody>${paymentRows}</tbody>
              </table>
            </div>
          </div>`
        : ''
    }

    <div class="summary-wrap">
      <div class="meta" style="max-width:340px;">
        <div class="bold" style="color:#404040;margin-bottom:4px;">Terms &amp; Remarks</div>
        <div>${escapeHtml(invoice.notes || 'Payment due as per agreed terms. Subject to local jurisdiction.')}</div>
      </div>
      <div class="totals">
        <div class="totals-row">
          <span>Taxable Amount</span>
          <span class="mono">${escapeHtml(formatINR(invoice.taxableAmount))}</span>
        </div>
        ${
          invoice.isInterState
            ? `<div class="totals-row"><span>IGST</span><span class="mono">${escapeHtml(formatINR(invoice.igstAmount))}</span></div>`
            : `<div class="totals-row"><span>CGST</span><span class="mono">${escapeHtml(formatINR(invoice.cgstAmount))}</span></div>
               <div class="totals-row"><span>SGST</span><span class="mono">${escapeHtml(formatINR(invoice.sgstAmount))}</span></div>`
        }
        <div class="totals-grand">
          <span>Grand Total</span>
          <span class="mono">${escapeHtml(formatINR(invoice.grandTotal))}</span>
        </div>
        <div class="totals-row" style="color:#047857;font-weight:600;">
          <span>Initial Advance Paid</span>
          <span class="mono">${escapeHtml(formatINR(invoice.initialPaidAmount))}</span>
        </div>
        <div class="totals-row" style="color:#047857;font-weight:700;">
          <span>Total Amount Paid</span>
          <span class="mono">${escapeHtml(formatINR(invoice.paidAmount))}</span>
        </div>
        <div class="pending-box">
          <span>Remaining Pending Amount</span>
          <span class="mono">${escapeHtml(formatINR(remainingAmt))}${isPaid ? ' · PAID' : ''}</span>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function downloadCustomerBill(
  invoice: Invoice,
  profile: UserProfile | null,
  invoicePayments: PaymentRecord[] = [],
  latestPaymentNote?: { amount: number; method: string; referenceNo: string }
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const html = buildCustomerBillHtml(invoice, profile, invoicePayments, latestPaymentNote);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeInv = invoice.invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
  anchor.href = url;
  anchor.download = `Bill-${safeInv}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadMonthlyGstPaidBill(params: {
  billingMonth: string;
  profile: UserProfile | null;
  invoices: Invoice[];
  filing?: {
    filingStatus: 'generated' | 'paid';
    challanNumber: string;
  };
  metrics: {
    totalInvoices: number;
    totalTaxableValue: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    totalGstLiability: number;
    gstCollected: number;
    gstPending: number;
  };
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isTaxPaid = params.filing?.filingStatus === 'paid';
  const challan = params.filing?.challanNumber || 'Pending Filing';
  const storeName = escapeHtml(params.profile?.businessName || 'ArthaMart Supermarket');
  const storeGstin = escapeHtml(params.profile?.gstin || '—');
  const storeState = escapeHtml(params.profile?.stateCode || '—');
  const storeDistrict = params.profile?.district
    ? ` · District: ${escapeHtml(params.profile.district)}`
    : '';
  const storeAddress = escapeHtml(params.profile?.address || '');
  const monthLabel = escapeHtml(formatMonthLabel(params.billingMonth));

  const invoiceRows = params.invoices
    .map(
      (inv) => `
      <tr>
        <td class="mono bold">${escapeHtml(inv.invoiceNumber)}</td>
        <td>
          <div>${escapeHtml(inv.customerName)}</div>
          <div class="muted">${escapeHtml(inv.customerCompany || '')}</div>
        </td>
        <td class="mono">${escapeHtml(inv.customerGstin || 'Unregistered')}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.taxableAmount))}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.cgstAmount))}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.sgstAmount))}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.igstAmount))}</td>
        <td class="right mono bold">${escapeHtml(formatINR(inv.totalGstAmount))}</td>
        <td class="${inv.paymentStatus === 'paid' ? 'status-paid' : 'status-pending'}">
          ${inv.paymentStatus === 'paid' ? 'Paid' : `Due ${escapeHtml(formatINR(inv.remainingAmount))}`}
        </td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Monthly GST Tax Paid Statement - ${escapeHtml(params.billingMonth)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #171717; background: #f5f5f5; margin: 0; padding: 28px 16px; line-height: 1.5; }
    .sheet { max-width: 920px; margin: 0 auto; background: #fff; border: 1px solid #d4d4d4; border-radius: 12px; padding: 32px; }
    .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid #e5e5e5; flex-wrap: wrap; }
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #b91c1c; }
    h1 { margin: 4px 0 6px; font-size: 22px; }
    .meta { font-size: 12px; color: #525252; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .muted { color: #737373; font-size: 11px; }
    .bold { font-weight: 700; }
    .right { text-align: right; }
    .status-paid { color: #047857; font-weight: 700; }
    .status-pending { color: #b91c1c; font-weight: 700; }
    .banner {
      margin: 18px 0;
      padding: 14px 16px;
      border-radius: 8px;
      border: 1px solid ${isTaxPaid ? '#a7f3d0' : '#fecaca'};
      background: ${isTaxPaid ? '#ecfdf5' : '#fef2f2'};
      color: ${isTaxPaid ? '#065f46' : '#991b1b'};
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 13px;
      font-weight: 700;
    }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 18px 0; }
    .kpi { border: 1px solid #e5e5e5; border-radius: 8px; padding: 12px; background: #f5f5f5; }
    .kpi-label { font-size: 11px; color: #737373; }
    .kpi-val { font-size: 15px; font-weight: 700; margin-top: 4px; }
    .table-box { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f5f5f5; color: #525252; font-weight: 600; padding: 10px 10px; border-bottom: 1px solid #d4d4d4; text-align: left; }
    th.right { text-align: right; }
    td { padding: 9px 10px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
    .print-bar { max-width: 920px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    .print-btn { padding: 8px 16px; background: #b91c1c; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    @media print { body { background: #fff; padding: 0; } .print-bar { display: none; } .sheet { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="kicker">Monthly GST Tax Paid Statement &amp; Challan Receipt</div>
        <h1>${storeName}</h1>
        <div class="meta">
          <div>GSTIN: <span class="mono bold">${storeGstin}</span></div>
          <div>State: ${storeState}${storeDistrict}</div>
          <div>${storeAddress}</div>
        </div>
      </div>
      <div class="meta right">
        <div>Tax Period: <strong>${monthLabel}</strong></div>
        <div>Total Bills: <span class="mono bold">${params.metrics.totalInvoices}</span></div>
        <div>Challan / PMT-06: <span class="mono bold">${escapeHtml(challan)}</span></div>
        <div>Generated: ${escapeHtml(new Date().toLocaleString('en-IN'))}</div>
      </div>
    </div>

    <div class="banner">
      <span>GST Payment Status: ${isTaxPaid ? 'MONTHLY GST PAID & FILED' : 'GST PAYMENT PENDING'}</span>
      <span class="mono">${isTaxPaid ? `Tax Paid: ${escapeHtml(formatINR(params.metrics.totalGstLiability))} · Challan ${escapeHtml(challan)}` : `Tax Payable: ${escapeHtml(formatINR(params.metrics.totalGstLiability))}`}</span>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Taxable Value</div><div class="kpi-val mono">${escapeHtml(formatINR(params.metrics.totalTaxableValue))}</div></div>
      <div class="kpi"><div class="kpi-label">CGST</div><div class="kpi-val mono">${escapeHtml(formatINR(params.metrics.totalCgst))}</div></div>
      <div class="kpi"><div class="kpi-label">SGST</div><div class="kpi-val mono">${escapeHtml(formatINR(params.metrics.totalSgst))}</div></div>
      <div class="kpi"><div class="kpi-label">IGST</div><div class="kpi-val mono">${escapeHtml(formatINR(params.metrics.totalIgst))}</div></div>
      <div class="kpi"><div class="kpi-label">Total Monthly GST</div><div class="kpi-val mono">${escapeHtml(formatINR(params.metrics.totalGstLiability))}</div></div>
    </div>

    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Customer</th>
            <th>GSTIN</th>
            <th class="right">Taxable</th>
            <th class="right">CGST</th>
            <th class="right">SGST</th>
            <th class="right">IGST</th>
            <th class="right">Total GST</th>
            <th>Bill Status</th>
          </tr>
        </thead>
        <tbody>${invoiceRows}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `GST-Tax-Paid-Bill-${params.billingMonth}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadClientMonthlyGstBill(params: {
  billingMonth: string;
  profile: UserProfile | null;
  customerName: string;
  customerCompany: string;
  customerGstin: string;
  clientInvoices: Invoice[];
  filing?: {
    filingStatus: 'generated' | 'paid';
    challanNumber: string;
  };
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isGstFiledPaid = params.filing?.filingStatus === 'paid';
  const challan = params.filing?.challanNumber || 'Pending Monthly Filing';
  const storeName = escapeHtml(params.profile?.businessName || 'ArthaMart Supermarket');
  const storeGstin = escapeHtml(params.profile?.gstin || '—');
  const storeAddress = escapeHtml(params.profile?.address || '');
  const monthLabel = escapeHtml(formatMonthLabel(params.billingMonth));

  const taxableTotal = params.clientInvoices.reduce((s, i) => s + i.taxableAmount, 0);
  const cgstTotal = params.clientInvoices.reduce((s, i) => s + i.cgstAmount, 0);
  const sgstTotal = params.clientInvoices.reduce((s, i) => s + i.sgstAmount, 0);
  const igstTotal = params.clientInvoices.reduce((s, i) => s + i.igstAmount, 0);
  const gstTotal = params.clientInvoices.reduce((s, i) => s + i.totalGstAmount, 0);
  const grandTotal = params.clientInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const paidTotal = params.clientInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const remainingTotal = params.clientInvoices.reduce((s, i) => s + i.remainingAmount, 0);
  const isClientPaid = remainingTotal <= 0.01;

  const rows = params.clientInvoices
    .map(
      (inv) => `
      <tr>
        <td class="mono bold">${escapeHtml(inv.invoiceNumber)}</td>
        <td>${escapeHtml(inv.itemsSummary)}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.taxableAmount))}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.totalGstAmount))}</td>
        <td class="right mono bold">${escapeHtml(formatINR(inv.grandTotal))}</td>
        <td class="right mono">${escapeHtml(formatINR(inv.paidAmount))}</td>
        <td class="right mono ${inv.remainingAmount <= 0 ? 'status-paid' : 'status-pending'}">
          ${inv.remainingAmount <= 0 ? `${escapeHtml(formatINR(0))} · Paid` : escapeHtml(formatINR(inv.remainingAmount))}
        </td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Client Monthly Tax Reference Bill - ${escapeHtml(params.customerName)} (${escapeHtml(params.billingMonth)})</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #171717; background: #f5f5f5; margin: 0; padding: 28px 16px; line-height: 1.5; }
    .sheet { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #d4d4d4; border-radius: 12px; padding: 32px; }
    .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 18px; border-bottom: 1px solid #e5e5e5; flex-wrap: wrap; }
    .kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #b91c1c; }
    h1 { margin: 4px 0 6px; font-size: 21px; }
    .meta { font-size: 12px; color: #525252; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .bold { font-weight: 700; }
    .right { text-align: right; }
    .status-paid { color: #047857; font-weight: 700; }
    .status-pending { color: #b91c1c; font-weight: 700; }
    .status-strip {
      margin: 16px 0;
      padding: 12px 14px;
      border-radius: 8px;
      border: 1px solid ${isGstFiledPaid ? '#a7f3d0' : '#fecaca'};
      background: ${isGstFiledPaid ? '#ecfdf5' : '#fef2f2'};
      color: ${isGstFiledPaid ? '#065f46' : '#991b1b'};
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      font-weight: 600;
    }
    .table-box { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-top: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #f5f5f5; color: #525252; font-weight: 600; padding: 10px; border-bottom: 1px solid #d4d4d4; text-align: left; }
    th.right { text-align: right; }
    td { padding: 10px; border-bottom: 1px solid #f5f5f5; vertical-align: top; }
    .totals { width: 320px; margin-left: auto; margin-top: 20px; font-size: 12px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; color: #525252; }
    .totals-grand { display: flex; justify-content: space-between; padding: 10px 0 6px; margin-top: 6px; border-top: 1px solid #d4d4d4; font-size: 14px; font-weight: 700; color: #171717; }
    .pending-box {
      margin-top: 10px; padding: 11px 13px; border-radius: 8px;
      border: 1px solid ${isClientPaid ? '#a7f3d0' : '#fecaca'};
      background: ${isClientPaid ? '#ecfdf5' : '#fef2f2'};
      color: ${isClientPaid ? '#065f46' : '#991b1b'};
      display: flex; justify-content: space-between; font-weight: 700; font-size: 13px;
    }
    .print-bar { max-width: 860px; margin: 0 auto 12px; display: flex; justify-content: flex-end; }
    .print-btn { padding: 8px 16px; background: #b91c1c; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; }
    @media print { body { background: #fff; padding: 0; } .print-bar { display: none; } .sheet { border: none; padding: 0; } }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="header">
      <div>
        <div class="kicker">Client Monthly Tax Paid &amp; Billing Reference</div>
        <h1>${escapeHtml(params.customerName)}</h1>
        <div class="meta">
          <div>${escapeHtml(params.customerCompany)}</div>
          <div>Client GSTIN: <span class="mono bold">${escapeHtml(params.customerGstin || 'Unregistered')}</span></div>
          <div>Billing Month: <strong>${monthLabel}</strong></div>
        </div>
      </div>
      <div class="meta right">
        <div class="bold" style="font-size:14px;color:#171717;">${storeName}</div>
        <div>Store GSTIN: <span class="mono bold">${storeGstin}</span></div>
        <div>${storeAddress}</div>
      </div>
    </div>

    <div class="status-strip">
      <span>Monthly GST Tax Remittance Status: ${isGstFiledPaid ? 'PAID & FILED BY STORE' : 'GENERATED · FILING PENDING'}</span>
      <span class="mono">${isGstFiledPaid ? `Challan ${escapeHtml(challan)}` : 'Challan Pending'}</span>
    </div>

    <div class="table-box">
      <table>
        <thead>
          <tr>
            <th>Invoice #</th>
            <th>Items Billed</th>
            <th class="right">Taxable</th>
            <th class="right">GST Tax</th>
            <th class="right">Bill Total</th>
            <th class="right">Paid</th>
            <th class="right">Remaining</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-row"><span>Total Taxable Value</span><span class="mono">${escapeHtml(formatINR(taxableTotal))}</span></div>
      <div class="totals-row"><span>CGST + SGST</span><span class="mono">${escapeHtml(formatINR(cgstTotal + sgstTotal))}</span></div>
      <div class="totals-row"><span>IGST</span><span class="mono">${escapeHtml(formatINR(igstTotal))}</span></div>
      <div class="totals-row bold"><span>Total GST Tax</span><span class="mono">${escapeHtml(formatINR(gstTotal))}</span></div>
      <div class="totals-grand"><span>Monthly Billed Total</span><span class="mono">${escapeHtml(formatINR(grandTotal))}</span></div>
      <div class="totals-row status-paid"><span>Total Paid by Client</span><span class="mono">${escapeHtml(formatINR(paidTotal))}</span></div>
      <div class="pending-box">
        <span>Remaining Pending Amount</span>
        <span class="mono">${escapeHtml(formatINR(isClientPaid ? 0 : remainingTotal))}${isClientPaid ? ' · PAID' : ''}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeClient = params.customerName.replace(/[^a-zA-Z0-9_-]/g, '_');
  anchor.href = url;
  anchor.download = `Client-Tax-Bill-${safeClient}-${params.billingMonth}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
