import { Download, Printer, X } from 'lucide-react';
import type { Invoice, PaymentRecord, UserProfile } from '../types';
import { downloadCustomerBill } from '../utils/billDownload';
import { formatINR, formatMonthLabel } from '../utils/format';

interface InvoicePreviewModalProps {
  invoice: Invoice;
  profile: UserProfile | null;
  payments?: PaymentRecord[];
  onClose: () => void;
}

export function InvoicePreviewModal({
  invoice,
  profile,
  payments = [],
  onClose,
}: InvoicePreviewModalProps) {
  const isPaid = invoice.paymentStatus === 'paid' || invoice.remainingAmount <= 0;
  const remainingAmt = isPaid ? 0 : invoice.remainingAmount;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-3xl my-8 overflow-hidden">
        <div className="no-print px-6 py-4 border-b border-neutral-200 flex items-center justify-between gap-3 bg-neutral-50">
          <div className="text-sm font-semibold text-neutral-900 font-mono truncate">
            Supermarket Tax Invoice · {invoice.invoiceNumber}
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadCustomerBill(invoice, profile, payments)}
              className="px-3.5 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Bill</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="text-neutral-400 hover:text-neutral-700 cursor-pointer p-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Tax Invoice Sheet */}
        <div className="p-8 space-y-6 text-neutral-900">
          <div className="flex flex-col sm:flex-row justify-between gap-6 pb-6 border-b border-neutral-200">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-red-700">
                Supermarket Tax Invoice
              </div>
              <h2 className="mt-1 text-2xl font-display font-bold text-neutral-900">
                {profile?.businessName || 'ArthaMart Supermarket'}
              </h2>
              <div className="mt-1 text-xs text-neutral-600 space-y-0.5">
                <div>GSTIN: <span className="font-mono font-medium">{profile?.gstin || '—'}</span></div>
                <div>
                  State: {profile?.stateCode || '—'}
                  {profile?.district ? ` · District: ${profile.district}` : ''}
                </div>
                <div className="max-w-sm">{profile?.address}</div>
              </div>
            </div>

            <div className="sm:text-right text-xs space-y-1">
              <div>
                <span className="text-neutral-500">Invoice Number: </span>
                <span className="font-mono font-semibold text-neutral-900">{invoice.invoiceNumber}</span>
              </div>
              <div>
                <span className="text-neutral-500">Billing Cycle: </span>
                <span className="font-medium">{formatMonthLabel(invoice.billingMonth)}</span>
              </div>
              <div>
                <span className="text-neutral-500">Due Date: </span>
                <span className="font-mono">{invoice.dueDate}</span>
              </div>
              <div>
                <span className="text-neutral-500">Status: </span>
                <span className={`font-semibold ${isPaid ? 'text-emerald-700' : 'text-red-700'}`}>
                  {isPaid ? 'PAID IN FULL' : 'REMAINING BALANCE PENDING'}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            <div>
              <div className="font-semibold text-neutral-500 mb-1">Billed To</div>
              <div className="text-sm font-semibold text-neutral-900">{invoice.customerName}</div>
              {invoice.customerCompany && (
                <div className="text-neutral-700">{invoice.customerCompany}</div>
              )}
              <div className="text-neutral-600 mt-1">Phone: {invoice.customerPhone}</div>
              <div className="text-neutral-600">
                GSTIN: <span className="font-mono">{invoice.customerGstin || 'Unregistered'}</span>
              </div>
              <div className="text-neutral-600">Place of Supply: {invoice.customerState}</div>
            </div>

            <div className="sm:text-right">
              <div className="font-semibold text-neutral-500 mb-1">Tax Classification</div>
              <div className="text-neutral-800 font-medium">
                {invoice.isInterState ? 'Inter-State Supply (IGST)' : 'Intra-State Supply (CGST + SGST)'}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600">
                  <th className="py-2.5 px-3">Item Description</th>
                  <th className="py-2.5 px-3">HSN</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Rate</th>
                  <th className="py-2.5 px-3 text-right">Taxable</th>
                  <th className="py-2.5 px-3 text-right">GST</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {invoice.lineItems.map((item, idx) => (
                  <tr key={idx}>
                    <td className="py-2.5 px-3 font-medium text-neutral-900">
                      {item.name}
                      <div className="text-[11px] font-mono text-neutral-400">{item.sku}</div>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-neutral-600">{item.hsnCode}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {item.qty} {item.unit}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatINR(item.unitPrice)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatINR(item.taxableValue)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {formatINR(item.gstAmount)} ({item.gstRate}%)
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                      {formatINR(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Payment Receipts Applied to This Bill */}
          {payments.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-neutral-600">Payment Receipts Applied</div>
              <div className="border border-neutral-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-500">
                      <th className="py-2 px-3">Reference No</th>
                      <th className="py-2 px-3">Mode</th>
                      <th className="py-2 px-3 text-right">Amount Paid</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {payments.map((pay) => (
                      <tr key={pay.id}>
                        <td className="py-2 px-3 font-mono text-neutral-700">{pay.referenceNo}</td>
                        <td className="py-2 px-3 text-neutral-600">{pay.paymentMethod}</td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-neutral-900">
                          {formatINR(pay.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Totals & Payment Settlement Breakdown */}
          <div className="flex flex-col sm:flex-row justify-between gap-6 pt-2">
            <div className="text-xs text-neutral-500 max-w-sm">
              <div className="font-semibold text-neutral-700 mb-1">Terms & Remarks</div>
              <p>{invoice.notes || 'Payment due as per agreed terms. Subject to local jurisdiction.'}</p>
            </div>

            <div className="w-full sm:w-80 space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Taxable Amount</span>
                <span className="font-mono tabular-nums">{formatINR(invoice.taxableAmount)}</span>
              </div>
              {invoice.isInterState ? (
                <div className="flex justify-between text-neutral-600">
                  <span>IGST</span>
                  <span className="font-mono tabular-nums">{formatINR(invoice.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-neutral-600">
                    <span>CGST</span>
                    <span className="font-mono tabular-nums">{formatINR(invoice.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>SGST</span>
                    <span className="font-mono tabular-nums">{formatINR(invoice.sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm font-bold text-neutral-900">
                <span>Grand Total</span>
                <span className="font-mono tabular-nums">{formatINR(invoice.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-700 font-medium">
                <span>Initial Advance Paid</span>
                <span className="font-mono tabular-nums">{formatINR(invoice.initialPaidAmount)}</span>
              </div>
              <div className="flex justify-between text-neutral-900 font-semibold">
                <span>Total Paid (Initial + Collected)</span>
                <span className="font-mono tabular-nums">{formatINR(invoice.paidAmount)}</span>
              </div>
              <div
                className={`mt-2 px-3 py-2.5 rounded-lg border flex justify-between items-center font-bold ${
                  isPaid
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <span>Remaining Pending Amount</span>
                <span className="font-mono tabular-nums">
                  {formatINR(remainingAmt)}
                  {isPaid ? ' · PAID' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
