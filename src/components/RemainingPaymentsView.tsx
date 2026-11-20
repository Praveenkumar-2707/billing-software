import { CheckCircle2, Download, FileText, IndianRupee, Search, X } from 'lucide-react';
import { useState } from 'react';
import { collectRemainingPayment } from '../services/billingService';
import type { GstFiling, Invoice, PaymentMethod, PaymentRecord, UserProfile } from '../types';
import { downloadCustomerBill } from '../utils/billDownload';
import { formatINR, isOverdue, round2 } from '../utils/format';

interface RemainingPaymentsViewProps {
  ownerId: string;
  profile: UserProfile | null;
  invoices: Invoice[];
  payments: PaymentRecord[];
  gstFilings: GstFiling[];
  onViewInvoice: (invoice: Invoice) => void;
}

type ReceivableTab = 'pending' | 'settled' | 'all';

export function RemainingPaymentsView({
  ownerId,
  profile,
  invoices,
  payments,
  gstFilings,
  onViewInvoice,
}: RemainingPaymentsViewProps) {
  const [tab, setTab] = useState<ReceivableTab>('pending');
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [collectAmount, setCollectAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [referenceNo, setReferenceNo] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);
  const [lastUpdatedBill, setLastUpdatedBill] = useState<{
    invoice: Invoice;
    payments: PaymentRecord[];
    latestNote: { amount: number; method: string; referenceNo: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pendingInvoices = invoices.filter(
    (inv) => inv.paymentStatus !== 'paid' && inv.remainingAmount > 0
  );
  const settledInvoices = invoices.filter(
    (inv) => inv.paymentStatus === 'paid' || inv.remainingAmount <= 0
  );

  const sourceList =
    tab === 'pending' ? pendingInvoices : tab === 'settled' ? settledInvoices : invoices;

  const activeList = sourceList.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.customerName.toLowerCase().includes(q) ||
      inv.customerCompany.toLowerCase().includes(q) ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerPhone.toLowerCase().includes(q) ||
      inv.itemsSummary.toLowerCase().includes(q)
    );
  });

  const totalPendingAmount = pendingInvoices.reduce((s, i) => s + i.remainingAmount, 0);
  const totalInitialAdvances = pendingInvoices.reduce((s, i) => s + i.paidAmount, 0);
  const overdueCount = pendingInvoices.filter((i) => isOverdue(i.dueDate, i.paymentStatus)).length;

  const openCollectModal = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setCollectAmount(String(invoice.remainingAmount));
    setPaymentMethod('UPI');
    setReferenceNo(`UTR-${Date.now().toString().slice(-6)}`);
    setError(null);
  };

  const buildUpdatedBillSnapshot = (
    invoice: Invoice,
    paidNow: number,
    method: PaymentMethod,
    refNo: string
  ) => {
    const payAmount = round2(Math.min(invoice.remainingAmount, Math.max(0.01, paidNow)));
    const isFull = payAmount >= invoice.remainingAmount - 0.01;
    const nextPaid = isFull ? invoice.grandTotal : round2(Math.min(invoice.grandTotal, invoice.paidAmount + payAmount));
    const nextRemaining = isFull ? 0 : round2(Math.max(0, invoice.grandTotal - nextPaid));
    const nextStatus = nextRemaining <= 0.01 ? 'paid' : 'partial';

    const updatedInvoice: Invoice = {
      ...invoice,
      paidAmount: nextStatus === 'paid' ? invoice.grandTotal : nextPaid,
      remainingAmount: nextStatus === 'paid' ? 0 : nextRemaining,
      paymentStatus: nextStatus,
    };

    const existingInvPayments = payments.filter((p) => p.invoiceId === invoice.id);
    const newPaymentRecord: PaymentRecord = {
      id: `receipt-${Date.now()}`,
      ownerId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      amount: payAmount,
      paymentMethod: method,
      referenceNo: refNo,
      billingMonth: invoice.billingMonth,
    };

    return {
      updatedInvoice,
      updatedPayments: [newPaymentRecord, ...existingInvPayments],
      latestNote: { amount: payAmount, method, referenceNo: refNo },
    };
  };

  const handleCollectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;
    const numericAmt = Number(collectAmount);
    if (!Number.isFinite(numericAmt) || numericAmt <= 0) {
      setError('Enter a valid payment amount greater than zero.');
      return;
    }
    if (numericAmt > selectedInvoice.remainingAmount + 0.01) {
      setError(`Amount cannot exceed remaining balance of ${formatINR(selectedInvoice.remainingAmount)}.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const monthInvoices = invoices.filter(
        (inv) => inv.billingMonth === selectedInvoice.billingMonth
      );
      const existingFiling = gstFilings.find(
        (f) => f.billingMonth === selectedInvoice.billingMonth
      );
      const cleanRef = referenceNo.trim() || `UTR-${Date.now().toString().slice(-6)}`;
      await collectRemainingPayment({
        ownerId,
        invoice: selectedInvoice,
        amount: numericAmt,
        paymentMethod,
        referenceNo: cleanRef,
        monthInvoices,
        existingFiling,
      });

      const snapshot = buildUpdatedBillSnapshot(selectedInvoice, numericAmt, paymentMethod, cleanRef);
      setLastUpdatedBill({
        invoice: snapshot.updatedInvoice,
        payments: snapshot.updatedPayments,
        latestNote: snapshot.latestNote,
      });
      setBannerMessage(
        `Recorded ${formatINR(numericAmt)} from ${selectedInvoice.customerName} (${selectedInvoice.invoiceNumber}). Remaining pending amount: ${formatINR(snapshot.updatedInvoice.remainingAmount)}.`
      );
      setSelectedInvoice(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickPayFull = async (invoice: Invoice) => {
    setSubmitting(true);
    setError(null);
    try {
      const monthInvoices = invoices.filter((inv) => inv.billingMonth === invoice.billingMonth);
      const existingFiling = gstFilings.find((f) => f.billingMonth === invoice.billingMonth);
      const cleanRef = `FULL-${Date.now().toString().slice(-6)}`;
      await collectRemainingPayment({
        ownerId,
        invoice,
        amount: invoice.remainingAmount,
        paymentMethod: 'UPI',
        referenceNo: cleanRef,
        monthInvoices,
        existingFiling,
      });

      const snapshot = buildUpdatedBillSnapshot(invoice, invoice.remainingAmount, 'UPI', cleanRef);
      setLastUpdatedBill({
        invoice: snapshot.updatedInvoice,
        payments: snapshot.updatedPayments,
        latestNote: snapshot.latestNote,
      });
      setBannerMessage(
        `Full payment (${formatINR(invoice.remainingAmount)}) recorded for ${invoice.customerName} (${invoice.invoiceNumber}). Remaining pending amount: ${formatINR(0)} (Paid).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to mark invoice paid.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-neutral-900">
            Remaining Customer Payments (Credit Ledger)
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Supermarket customers who paid an initial amount at checkout with unpaid remaining credit balances
          </p>
        </div>
      </div>

      {bannerMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-start sm:items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>{bannerMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastUpdatedBill && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    downloadCustomerBill(
                      lastUpdatedBill.invoice,
                      profile,
                      lastUpdatedBill.payments,
                      lastUpdatedBill.latestNote
                    )
                  }
                  className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-white border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => onViewInvoice(lastUpdatedBill.invoice)}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>View Bill</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => {
                setBannerMessage(null);
                setLastUpdatedBill(null);
              }}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Total Remaining Balance Due</div>
          <div className="mt-2 text-2xl font-display font-bold text-red-700 font-mono tabular-nums">
            {formatINR(totalPendingAmount)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Across {pendingInvoices.length} unpaid/partial store bills
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Initial Counter Payments Received</div>
          <div className="mt-2 text-2xl font-display font-bold text-neutral-900 font-mono tabular-nums">
            {formatINR(totalInitialAdvances)}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Collected at supermarket POS counter
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="text-xs font-medium text-neutral-500">Overdue Customer Accounts</div>
          <div className="mt-2 text-2xl font-display font-bold text-red-700 font-mono tabular-nums">
            {overdueCount}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Past payment due date
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'pending'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Unpaid Remaining Balances ({pendingInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('settled')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'settled'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            Paid / Settled ({settledInvoices.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
              tab === 'all'
                ? 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            All Bills ({invoices.length})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, invoice, stack..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 focus:bg-white"
          />
        </div>
      </div>

      {/* Customer Remaining Balance Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {activeList.length === 0 ? (
          <div className="p-10 text-center text-sm text-neutral-500">
            {tab === 'pending'
              ? 'All customers have settled their remaining balances.'
              : 'No fully settled invoices recorded yet.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                  <th className="py-2.5 px-4">Customer Details</th>
                  <th className="py-2.5 px-4">Sold Stack & Invoice</th>
                  <th className="py-2.5 px-4 text-right">Total Bill</th>
                  <th className="py-2.5 px-4 text-right">Initial / Paid</th>
                  <th className="py-2.5 px-4 text-right">Remaining Due</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {activeList.map((inv) => {
                  const isFullyPaid = inv.paymentStatus === 'paid' || inv.remainingAmount <= 0;
                  const overdue = isOverdue(inv.dueDate, inv.paymentStatus);
                  return (
                    <tr key={inv.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-neutral-900">{inv.customerName}</div>
                        <div className="text-xs text-neutral-500">
                          {inv.customerCompany} · {inv.customerPhone}
                        </div>
                        {inv.customerGstin && (
                          <div className="text-xs text-neutral-400 font-mono">
                            GSTIN {inv.customerGstin}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-mono text-xs font-medium text-neutral-900">
                          {inv.invoiceNumber}
                        </div>
                        <div className="text-xs text-neutral-500 max-w-xs truncate">
                          {inv.itemsSummary}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-neutral-900">
                        {formatINR(inv.grandTotal)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums text-neutral-800">
                        {formatINR(inv.paidAmount)}
                        <div className="text-[11px] text-neutral-400">
                          Init {formatINR(inv.initialPaidAmount)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                        {isFullyPaid ? (
                          <span className="text-emerald-700">{formatINR(0)} · Paid</span>
                        ) : (
                          <span className="text-red-700">{formatINR(inv.remainingAmount)}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        {isFullyPaid ? (
                          <span className="font-semibold text-emerald-700">Paid</span>
                        ) : overdue ? (
                          <span className="font-semibold text-red-700">Overdue · {inv.dueDate}</span>
                        ) : (
                          <span className="text-neutral-600">{inv.dueDate}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onViewInvoice(inv)}
                            className="text-xs font-medium text-neutral-600 hover:text-neutral-900 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Bill</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadCustomerBill(
                                inv,
                                profile,
                                payments.filter((p) => p.invoiceId === inv.id)
                              )
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                            title="Download Bill with Remaining Pending Amount"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                          {!isFullyPaid && (
                            <>
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleQuickPayFull(inv)}
                                className="px-2.5 py-1.5 text-xs font-semibold text-neutral-800 bg-neutral-100 border border-neutral-300 rounded-lg hover:bg-neutral-200 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                              >
                                Pay Full
                              </button>
                              <button
                                type="button"
                                onClick={() => openCollectModal(inv)}
                                className="px-3 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                              >
                                <IndianRupee className="w-3.5 h-3.5" />
                                <span>Collect</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Payment Receipts Log */}
      {payments.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-neutral-200">
            <h2 className="text-sm font-display font-semibold text-neutral-900">
              Payment Receipts History
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                  <th className="py-2 px-4">Customer</th>
                  <th className="py-2 px-4">Invoice #</th>
                  <th className="py-2 px-4">Mode</th>
                  <th className="py-2 px-4">Reference No</th>
                  <th className="py-2 px-4 text-right">Amount Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-xs">
                {payments.slice(0, 10).map((pay) => (
                  <tr key={pay.id}>
                    <td className="py-2.5 px-4 font-medium text-neutral-900">{pay.customerName}</td>
                    <td className="py-2.5 px-4 font-mono text-neutral-600">{pay.invoiceNumber}</td>
                    <td className="py-2.5 px-4 text-neutral-600">{pay.paymentMethod}</td>
                    <td className="py-2.5 px-4 font-mono text-neutral-500">{pay.referenceNo}</td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                      {formatINR(pay.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Collect Remaining Balance Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 bg-neutral-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-neutral-900">
                Record Remaining Payment
              </h2>
              <button
                type="button"
                onClick={() => setSelectedInvoice(null)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCollectSubmit} className="p-6 space-y-4">
              <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1 text-xs">
                <div className="font-semibold text-neutral-900 text-sm">
                  {selectedInvoice.customerName} · {selectedInvoice.customerCompany}
                </div>
                <div className="text-neutral-600 font-mono">
                  {selectedInvoice.invoiceNumber} · Total {formatINR(selectedInvoice.grandTotal)}
                </div>
                <div className="text-red-700 font-mono font-semibold">
                  Remaining Balance: {formatINR(selectedInvoice.remainingAmount)}
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Payment Amount (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={selectedInvoice.remainingAmount}
                  required
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setCollectAmount(String(selectedInvoice.remainingAmount))}
                    className="text-red-700 hover:underline font-medium cursor-pointer"
                  >
                    Full Settlement ({formatINR(selectedInvoice.remainingAmount)})
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCollectAmount(String(Math.round((selectedInvoice.remainingAmount / 2) * 100) / 100))
                    }
                    className="text-neutral-600 hover:underline cursor-pointer"
                  >
                    50% Installment
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    Payment Mode
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700 bg-white"
                  >
                    <option value="UPI">UPI</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">
                    UTR / Reference No
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    required
                    value={referenceNo}
                    onChange={(e) => setReferenceNo(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? 'Updating Ledger...' : 'Confirm Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
