import {
  CheckCircle2,
  Download,
  FileText,
  Landmark,
  Plus,
  Printer,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  calculateMonthGstMetrics,
  payMonthlyGstChallan,
  syncMonthlyGstFiling,
} from '../services/billingService';
import type { GstFiling, Invoice, PaymentRecord, UserProfile } from '../types';
import {
  downloadClientMonthlyGstBill,
  downloadCustomerBill,
  downloadMonthlyGstPaidBill,
} from '../utils/billDownload';
import { formatINR, formatMonthLabel, getCurrentMonth } from '../utils/format';

interface GstBillingViewProps {
  ownerId: string;
  profile: UserProfile | null;
  invoices: Invoice[];
  payments?: PaymentRecord[];
  gstFilings: GstFiling[];
  onOpenNewInvoice: () => void;
  onViewInvoice: (invoice: Invoice) => void;
}

export function GstBillingView({
  ownerId,
  profile,
  invoices,
  payments = [],
  gstFilings,
  onOpenNewInvoice,
  onViewInvoice,
}: GstBillingViewProps) {
  const currentMonth = getCurrentMonth();
  const availableMonths = useMemo(() => {
    const set = new Set<string>([currentMonth]);
    invoices.forEach((i) => set.add(i.billingMonth));
    gstFilings.forEach((f) => set.add(f.billingMonth));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [currentMonth, invoices, gstFilings]);

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [challanNumber, setChallanNumber] = useState('');
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState<{ message: string; paidMonth?: string; challan?: string } | null>(
    null
  );

  const monthInvoices = useMemo(
    () => invoices.filter((i) => i.billingMonth === selectedMonth),
    [invoices, selectedMonth]
  );

  const existingFiling = useMemo(
    () => gstFilings.find((f) => f.billingMonth === selectedMonth),
    [gstFilings, selectedMonth]
  );

  const liveMetrics = useMemo(() => calculateMonthGstMetrics(monthInvoices), [monthInvoices]);

  const monthlyLedgerRows = useMemo(() => {
    return availableMonths.map((month) => {
      const mInvoices = invoices.filter((i) => i.billingMonth === month);
      const mFiling = gstFilings.find((f) => f.billingMonth === month);
      const mMetrics = calculateMonthGstMetrics(mInvoices);
      return {
        month,
        invoices: mInvoices,
        filing: mFiling,
        metrics: mMetrics,
        isTaxPaid: mFiling?.filingStatus === 'paid',
      };
    });
  }, [availableMonths, invoices, gstFilings]);

  // Client-side monthly consolidated GST breakdown grouped by customer
  const clientMonthlySummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        customerCompany: string;
        customerGstin: string;
        invoiceCount: number;
        taxableTotal: number;
        gstTotal: number;
        grandTotal: number;
        paidTotal: number;
        remainingTotal: number;
        clientInvoices: Invoice[];
      }
    >();

    for (const inv of monthInvoices) {
      const current = map.get(inv.customerId) || {
        customerId: inv.customerId,
        customerName: inv.customerName,
        customerCompany: inv.customerCompany,
        customerGstin: inv.customerGstin,
        invoiceCount: 0,
        taxableTotal: 0,
        gstTotal: 0,
        grandTotal: 0,
        paidTotal: 0,
        remainingTotal: 0,
        clientInvoices: [],
      };
      current.invoiceCount += 1;
      current.taxableTotal += inv.taxableAmount;
      current.gstTotal += inv.totalGstAmount;
      current.grandTotal += inv.grandTotal;
      current.paidTotal += inv.paidAmount;
      current.remainingTotal += inv.remainingAmount;
      current.clientInvoices.push(inv);
      map.set(inv.customerId, current);
    }

    return Array.from(map.values());
  }, [monthInvoices]);

  const filteredInvoices = monthInvoices.filter((inv) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      inv.customerName.toLowerCase().includes(q) ||
      inv.customerCompany.toLowerCase().includes(q) ||
      inv.customerGstin.toLowerCase().includes(q)
    );
  });

  const handleAutoSync = async () => {
    setSyncing(true);
    try {
      await syncMonthlyGstFiling(ownerId, selectedMonth, monthInvoices, existingFiling);
      setToast({
        message: `Monthly GST statement for ${formatMonthLabel(selectedMonth)} generated and synced.`,
      });
    } finally {
      setSyncing(false);
    }
  };

  const openPayChallanModal = () => {
    setChallanNumber(`PMT06-${selectedMonth.replace('-', '')}-${Date.now().toString().slice(-4)}`);
    setPayModalOpen(true);
  };

  const handlePayChallan = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanChallan = challanNumber.trim();
    if (!cleanChallan) return;
    setPaying(true);
    try {
      if (!existingFiling) {
        await syncMonthlyGstFiling(ownerId, selectedMonth, monthInvoices, undefined);
      }
      const filingId = `${ownerId}_${selectedMonth}`;
      await payMonthlyGstChallan(filingId, cleanChallan);
      setPayModalOpen(false);

      // Automatically download Monthly GST Tax Paid Bill for client & audit reference
      downloadMonthlyGstPaidBill({
        billingMonth: selectedMonth,
        profile,
        invoices: monthInvoices,
        filing: {
          filingStatus: 'paid',
          challanNumber: cleanChallan,
        },
        metrics: liveMetrics,
      });

      setToast({
        message: `Monthly GST for ${formatMonthLabel(selectedMonth)} marked Paid (Challan ${cleanChallan}). Tax Paid Bill downloaded for client reference.`,
        paidMonth: selectedMonth,
        challan: cleanChallan,
      });
    } finally {
      setPaying(false);
    }
  };

  const isPaid = existingFiling?.filingStatus === 'paid';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-neutral-900">
            Supermarket Monthly GST Billing & Tax Ledger
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Automatic monthly GST statement generation, tax payment status tracking, and downloadable tax paid bills for client reference
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 text-sm font-medium bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
          >
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {formatMonthLabel(m)}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onOpenNewInvoice}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Generate GST Bill</span>
          </button>
        </div>
      </div>

      {toast && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm text-emerald-900">
          <div className="flex items-start sm:items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
            <span>{toast.message}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {toast.paidMonth && (
              <button
                type="button"
                onClick={() =>
                  downloadMonthlyGstPaidBill({
                    billingMonth: toast.paidMonth!,
                    profile,
                    invoices: invoices.filter((i) => i.billingMonth === toast.paidMonth),
                    filing: {
                      filingStatus: 'paid',
                      challanNumber: toast.challan || '',
                    },
                    metrics: calculateMonthGstMetrics(
                      invoices.filter((i) => i.billingMonth === toast.paidMonth)
                    ),
                  })
                }
                className="px-3 py-1.5 text-xs font-semibold text-red-800 bg-white border border-red-200 rounded-lg hover:bg-red-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Tax Paid Bill</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Monthly Automated GST Liability & Payment Card */}
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-neutral-200">
          <div>
            <div className="text-xs font-medium text-neutral-500">
              {profile?.businessName} · GSTIN {profile?.gstin || 'Not Set'}
            </div>
            <h2 className="text-lg font-display font-semibold text-neutral-900 mt-0.5">
              {formatMonthLabel(selectedMonth)} — Automated Monthly GST Statement
            </h2>
            <div className="mt-1.5 text-xs">
              <span className="text-neutral-500">Payment Status: </span>
              {isPaid ? (
                <span className="font-semibold text-emerald-700">
                  Monthly GST Tax Paid · Challan {existingFiling?.challanNumber}
                </span>
              ) : (
                <span className="font-semibold text-red-700">
                  GST Payment Pending ({formatINR(liveMetrics.totalGstLiability)} due)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isPaid && (
              <button
                type="button"
                onClick={handleAutoSync}
                disabled={syncing}
                className="px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Generating...' : 'Auto-Sync Monthly Bill'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                downloadMonthlyGstPaidBill({
                  billingMonth: selectedMonth,
                  profile,
                  invoices: monthInvoices,
                  filing: existingFiling
                    ? {
                        filingStatus: existingFiling.filingStatus,
                        challanNumber: existingFiling.challanNumber,
                      }
                    : undefined,
                  metrics: liveMetrics,
                })
              }
              className="px-3.5 py-2 text-xs font-semibold text-neutral-800 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isPaid ? 'Download Tax Paid Bill' : 'Download GST Statement'}</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            {isPaid ? (
              <div className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg whitespace-nowrap">
                Tax Paid · {existingFiling?.challanNumber}
              </div>
            ) : (
              <button
                type="button"
                onClick={openPayChallanModal}
                disabled={liveMetrics.totalGstLiability <= 0}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Landmark className="w-3.5 h-3.5" />
                <span>Pay & File Monthly GST</span>
              </button>
            )}
          </div>
        </div>

        <div className="pt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
          <div>
            <div className="text-xs text-neutral-500">Taxable Value</div>
            <div className="mt-1 text-lg font-mono tabular-nums font-semibold text-neutral-900">
              {formatINR(liveMetrics.totalTaxableValue)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Output CGST</div>
            <div className="mt-1 text-lg font-mono tabular-nums font-semibold text-neutral-900">
              {formatINR(liveMetrics.totalCgst)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Output SGST</div>
            <div className="mt-1 text-lg font-mono tabular-nums font-semibold text-neutral-900">
              {formatINR(liveMetrics.totalSgst)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">Output IGST</div>
            <div className="mt-1 text-lg font-mono tabular-nums font-semibold text-neutral-900">
              {formatINR(liveMetrics.totalIgst)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">
              {isPaid ? 'Monthly GST Paid' : 'Total GST Liability'}
            </div>
            <div
              className={`mt-1 text-lg font-mono tabular-nums font-bold ${
                isPaid ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {formatINR(liveMetrics.totalGstLiability)}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">GST Realized / Pending</div>
            <div className="mt-1 text-sm font-mono tabular-nums font-semibold text-neutral-900">
              {formatINR(liveMetrics.gstCollected)}
            </div>
            <div className="text-xs font-mono tabular-nums text-red-700">
              Pending {formatINR(liveMetrics.gstPending)}
            </div>
          </div>
        </div>
      </section>

      {/* Monthly GST Payment Status & Tax Paid Bills Ledger */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="text-base font-display font-semibold text-neutral-900">
            Monthly GST Payment Status & Tax Paid Bills
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track monthly tax remittance status and download Tax Paid Bills for audit and client reference
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                <th className="py-2.5 px-4">Billing Month</th>
                <th className="py-2.5 px-4 text-right">Bills</th>
                <th className="py-2.5 px-4 text-right">Taxable Value</th>
                <th className="py-2.5 px-4 text-right">Total GST Tax</th>
                <th className="py-2.5 px-4">GST Payment Status</th>
                <th className="py-2.5 px-4">Challan / PMT-06</th>
                <th className="py-2.5 px-4 text-right">Tax Paid Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-sm">
              {monthlyLedgerRows.map((row) => (
                <tr
                  key={row.month}
                  className={`hover:bg-neutral-50/70 ${
                    row.month === selectedMonth ? 'bg-red-50/40' : ''
                  }`}
                >
                  <td className="py-3 px-4 font-medium text-neutral-900">
                    <button
                      type="button"
                      onClick={() => setSelectedMonth(row.month)}
                      className="hover:underline text-left cursor-pointer"
                    >
                      {formatMonthLabel(row.month)}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                    {row.metrics.totalInvoices}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-900">
                    {formatINR(row.metrics.totalTaxableValue)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                    {formatINR(row.metrics.totalGstLiability)}
                  </td>
                  <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                    {row.isTaxPaid ? (
                      <span className="text-emerald-700">Paid</span>
                    ) : (
                      <span className="text-red-700">Payment Pending</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-neutral-600">
                    {row.filing?.challanNumber || '—'}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        downloadMonthlyGstPaidBill({
                          billingMonth: row.month,
                          profile,
                          invoices: row.invoices,
                          filing: row.filing
                            ? {
                                filingStatus: row.filing.filingStatus,
                                challanNumber: row.filing.challanNumber,
                              }
                            : undefined,
                          metrics: row.metrics,
                        })
                      }
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{row.isTaxPaid ? 'Download Tax Paid Bill' : 'Download Statement'}</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Client-Side Monthly Consolidated GST Summary */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200">
          <h2 className="text-base font-display font-semibold text-neutral-900">
            Client-Wise Monthly GST Billing Summary ({formatMonthLabel(selectedMonth)})
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Monthly tax totals, payment status, and downloadable tax bills for client reference
          </p>
        </div>

        {clientMonthlySummaries.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            No client bills recorded for {formatMonthLabel(selectedMonth)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                  <th className="py-2.5 px-4">Client / Company</th>
                  <th className="py-2.5 px-4">Customer GSTIN</th>
                  <th className="py-2.5 px-4 text-right">Bills</th>
                  <th className="py-2.5 px-4 text-right">Taxable Value</th>
                  <th className="py-2.5 px-4 text-right">Total GST</th>
                  <th className="py-2.5 px-4 text-right">Monthly Billed</th>
                  <th className="py-2.5 px-4 text-right">Collected</th>
                  <th className="py-2.5 px-4 text-right">Remaining</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Client Tax Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {clientMonthlySummaries.map((row) => {
                  const clientSettled = row.remainingTotal <= 0.01;
                  return (
                    <tr key={row.customerId} className="hover:bg-neutral-50/70">
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900">{row.customerName}</div>
                        <div className="text-xs text-neutral-500">{row.customerCompany}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-neutral-600">
                        {row.customerGstin || 'Unregistered'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                        {row.invoiceCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-900">
                        {formatINR(row.taxableTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                        {formatINR(row.gstTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                        {formatINR(row.grandTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-800">
                        {formatINR(row.paidTotal)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-medium">
                        {clientSettled ? (
                          <span className="text-emerald-700">{formatINR(0)}</span>
                        ) : (
                          <span className="text-red-700">{formatINR(row.remainingTotal)}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold whitespace-nowrap">
                        {clientSettled ? (
                          <span className="text-emerald-700">
                            Paid{isPaid ? ' · Tax Filed' : ''}
                          </span>
                        ) : (
                          <span className="text-red-700">
                            Pending{isPaid ? ' · Tax Filed' : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            downloadClientMonthlyGstBill({
                              billingMonth: selectedMonth,
                              profile,
                              customerName: row.customerName,
                              customerCompany: row.customerCompany,
                              customerGstin: row.customerGstin,
                              clientInvoices: row.clientInvoices,
                              filing: existingFiling
                                ? {
                                    filingStatus: existingFiling.filingStatus,
                                    challanNumber: existingFiling.challanNumber,
                                  }
                                : undefined,
                            })
                          }
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Bill</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Individual Tax Invoices */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900">
              Tax Invoices ({filteredInvoices.length})
            </h2>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, customer, GSTIN..."
              className="w-full pl-9 pr-3 py-1.5 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 focus:bg-white"
            />
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            No tax invoices found for {formatMonthLabel(selectedMonth)}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                  <th className="py-2.5 px-4">Invoice #</th>
                  <th className="py-2.5 px-4">Customer</th>
                  <th className="py-2.5 px-4 text-right">Taxable</th>
                  <th className="py-2.5 px-4 text-right">CGST + SGST / IGST</th>
                  <th className="py-2.5 px-4 text-right">Grand Total</th>
                  <th className="py-2.5 px-4">Payment Status</th>
                  <th className="py-2.5 px-4 text-right">Tax Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-neutral-50/70">
                    <td className="py-3 px-4 font-mono text-xs font-semibold text-neutral-900">
                      {inv.invoiceNumber}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{inv.customerName}</div>
                      <div className="text-xs text-neutral-500">
                        {inv.customerCompany} · {inv.customerState}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                      {formatINR(inv.taxableAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                      {formatINR(inv.totalGstAmount)}
                      <div className="text-[11px] text-neutral-400">
                        {inv.isInterState
                          ? `IGST ${formatINR(inv.igstAmount)}`
                          : `CGST ${formatINR(inv.cgstAmount)} + SGST ${formatINR(inv.sgstAmount)}`}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                      {formatINR(inv.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-xs font-medium whitespace-nowrap">
                      {inv.paymentStatus === 'paid' ? (
                        <span className="text-emerald-700 font-semibold">
                          Paid{isPaid ? ' · Tax Filed' : ''}
                        </span>
                      ) : (
                        <span className="text-red-700">
                          Due {formatINR(inv.remainingAmount)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View</span>
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
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Bill</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pay Monthly GST Challan Modal */}
      {payModalOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-neutral-900">
                Pay & File Monthly GST ({formatMonthLabel(selectedMonth)})
              </h2>
              <button
                type="button"
                onClick={() => setPayModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePayChallan} className="p-6 space-y-4">
              <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">CGST + SGST</span>
                  <span className="font-mono font-medium text-neutral-900">
                    {formatINR(liveMetrics.totalCgst + liveMetrics.totalSgst)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">IGST</span>
                  <span className="font-mono font-medium text-neutral-900">
                    {formatINR(liveMetrics.totalIgst)}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-neutral-200 flex justify-between font-semibold text-sm text-red-700">
                  <span>Total GST Payable</span>
                  <span className="font-mono">{formatINR(liveMetrics.totalGstLiability)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  GST Challan / PMT-06 Reference Number
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={challanNumber}
                  onChange={(e) => setChallanNumber(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={paying}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 cursor-pointer"
                >
                  {paying ? 'Filing...' : 'Confirm GST Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
