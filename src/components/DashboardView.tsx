import {
  ArrowUpRight,
  Database,
  FileText,
  Plus,
  ReceiptIndianRupee,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import type { AppPage, Customer, GstFiling, Invoice, StackItem } from '../types';
import { formatINR, formatMonthLabel, formatNumber, getCurrentMonth, isOverdue } from '../utils/format';
import { DashboardStockChart } from './DashboardStockChart';

interface DashboardViewProps {
  stacks: StackItem[];
  customers: Customer[];
  invoices: Invoice[];
  gstFilings: GstFiling[];
  loading: boolean;
  onNavigate: (page: AppPage) => void;
  onOpenNewInvoice: (preselectedStackId?: string) => void;
  onOpenNewInvoiceForCustomer: (customerId: string) => void;
  onOpenAddCustomer: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onSeedSampleData: () => Promise<void>;
}

export function DashboardView({
  stacks,
  customers,
  invoices,
  gstFilings,
  loading,
  onNavigate,
  onOpenNewInvoice,
  onOpenNewInvoiceForCustomer,
  onOpenAddCustomer,
  onViewInvoice,
  onSeedSampleData,
}: DashboardViewProps) {
  const [seeding, setSeeding] = useState(false);

  const currentMonth = getCurrentMonth();
  const totalCollected = invoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const totalRemaining = invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0);
  const pendingCustomersCount = invoices.filter(
    (inv) => inv.paymentStatus !== 'paid' && inv.remainingAmount > 0
  ).length;

  const currentMonthInvoices = invoices.filter((inv) => inv.billingMonth === currentMonth);
  const currentMonthGstTotal = currentMonthInvoices.reduce((s, i) => s + i.totalGstAmount, 0);
  const currentMonthFiling = gstFilings.find((f) => f.billingMonth === currentMonth);

  const totalRemainingUnits = stacks.reduce((s, item) => s + Math.max(0, item.availableQty), 0);
  const totalSoldUnits = stacks.reduce((s, item) => s + Math.max(0, item.soldQty), 0);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await onSeedSampleData();
    } finally {
      setSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className="bg-white border border-neutral-200 rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white border border-neutral-200 rounded-xl h-72 animate-pulse" />
          <div className="bg-white border border-neutral-200 rounded-xl h-72 animate-pulse" />
        </div>
      </div>
    );
  }

  if (stacks.length === 0 && invoices.length === 0 && customers.length === 0) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl p-10 max-w-2xl mx-auto mt-8 text-center">
        <div className="w-12 h-12 rounded-lg bg-red-50 text-red-700 flex items-center justify-center mx-auto">
          <Database className="w-6 h-6" />
        </div>
        <h2 className="mt-4 text-xl font-display font-semibold text-neutral-900">
          Your supermarket billing ledger is ready
        </h2>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed max-w-lg mx-auto">
          Start by adding your supermarket stock items and customers, or load realistic
          supermarket sample data with sold-out aisles, upgoing stock, credit customers, and monthly GST bills.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap"
          >
            {seeding ? 'Loading Supermarket Data...' : 'Load Supermarket Sample Data'}
          </button>
          <button
            type="button"
            onClick={onOpenAddCustomer}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4 text-red-700" />
            <span>Add New Customer</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inventory')}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            Add First Product
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Store Dashboard Top Action Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-display font-semibold text-neutral-900">
            Supermarket Store Overview
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Live shelf inventory, daily sales velocity, customer accounts, and monthly GST status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAddCustomer}
            className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-neutral-800 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-4 h-4 text-red-700" />
            <span>Add New Customer</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenNewInvoice()}
            className="px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New POS Bill</span>
          </button>
        </div>
      </div>
      {/* KPI Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
            <span>Total Revenue Collected</span>
            <ReceiptIndianRupee className="w-4 h-4 text-red-700" />
          </div>
          <div className="mt-2.5 text-2xl font-display font-bold text-neutral-900 tabular-nums font-mono">
            {formatINR(totalCollected)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 tabular-nums">
            Across {invoices.length} supermarket bills · Updates live on collection
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
            <span>Customer Credit Due</span>
            <button
              type="button"
              onClick={() => onNavigate('receivables')}
              className="text-red-700 hover:text-red-900 font-medium inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
            >
              <span>View Page</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5 text-2xl font-display font-bold text-red-700 tabular-nums font-mono">
            {formatINR(totalRemaining)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 tabular-nums">
            {pendingCustomersCount} {pendingCustomersCount === 1 ? 'customer' : 'customers'} with remaining balance
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
            <span>Supermarket Stock</span>
            <button
              type="button"
              onClick={() => onNavigate('inventory')}
              className="text-red-700 hover:text-red-900 font-medium inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
            >
              <span>Inventory</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-display font-bold text-neutral-900">
              {stacks.length}
            </span>
            <span className="text-xs text-neutral-500 font-sans">SKUs tracked</span>
          </div>
          <div className="mt-1.5 text-xs text-neutral-500 tabular-nums">
            {formatNumber(totalRemainingUnits)} in inventory · {formatNumber(totalSoldUnits)} sold
          </div>
        </div>

        <div className="bg-white border border-neutral-200 rounded-xl p-5">
          <div className="flex items-center justify-between text-xs font-medium text-neutral-500">
            <span>GST Liability ({formatMonthLabel(currentMonth)})</span>
            <button
              type="button"
              onClick={() => onNavigate('gst-billing')}
              className="text-red-700 hover:text-red-900 font-medium inline-flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
            >
              <span>GST Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-2.5 text-2xl font-display font-bold text-neutral-900 tabular-nums font-mono">
            {formatINR(currentMonthGstTotal)}
          </div>
          <div className="mt-1.5 text-xs text-neutral-500">
            {currentMonthFiling?.filingStatus === 'paid'
              ? `Paid · Challan ${currentMonthFiling.challanNumber}`
              : 'Auto-generated · Ready for remittance'}
          </div>
        </div>
      </section>

      {/* Stack Sold in One Day & Stock Velocity Graph */}
      <DashboardStockChart
        stacks={stacks}
        invoices={invoices}
        onOpenNewInvoice={onOpenNewInvoice}
      />

      {/* Recent Billing & Real-Time Payment Status Ledger */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900">
              Recent Customer Billing & Payment Status
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Automatically updates when customers settle remaining balances
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCustomersCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('receivables')}
                className="px-3 py-1.5 text-xs font-medium text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100/80 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Collect {pendingCustomersCount} Remaining Balances</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('gst-billing')}
              className="px-3 py-1.5 text-xs font-medium text-neutral-700 border border-neutral-300 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              All Invoices
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500">
                <th className="py-2.5 px-4">Invoice</th>
                <th className="py-2.5 px-4">Customer</th>
                <th className="py-2.5 px-4 text-right">Total (incl. GST)</th>
                <th className="py-2.5 px-4 text-right">Paid</th>
                <th className="py-2.5 px-4 text-right">Remaining</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4 text-right">Bill</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 text-sm">
              {invoices.slice(0, 8).map((inv) => {
                const isFullyPaid = inv.paymentStatus === 'paid' || inv.remainingAmount <= 0;
                const overdue = isOverdue(inv.dueDate, inv.paymentStatus);
                return (
                  <tr key={inv.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-xs font-medium text-neutral-900 whitespace-nowrap">
                      {inv.invoiceNumber}
                      <div className="text-neutral-400 font-sans">{inv.billingMonth}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{inv.customerName}</div>
                      <div className="text-xs text-neutral-500 truncate max-w-xs">
                        {inv.customerCompany || inv.itemsSummary}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-900">
                      {formatINR(inv.grandTotal)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-800">
                      {formatINR(inv.paidAmount)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                      {isFullyPaid ? (
                        <span className="text-emerald-700">{formatINR(0)} · Paid</span>
                      ) : (
                        <span className="text-red-700">{formatINR(inv.remainingAmount)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs font-medium">
                      {isFullyPaid ? (
                        <span className="text-emerald-700 font-semibold">Paid</span>
                      ) : overdue ? (
                        <span className="text-red-700 font-semibold">Overdue · Due {inv.dueDate}</span>
                      ) : (
                        <span className="text-neutral-600">Partial Paid · Due {inv.dueDate}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        {!isFullyPaid && (
                          <button
                            type="button"
                            onClick={() => onNavigate('receivables')}
                            className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                          >
                            Pay
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onViewInvoice(inv)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 hover:underline cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Store Customers Directory */}
      <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900">
              Store Customers ({customers.length})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Registered retail & B2B customers ready for supermarket POS billing
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAddCustomer}
            className="px-3.5 py-1.5 text-xs font-semibold text-red-800 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100/80 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add New Customer</span>
          </button>
        </div>

        {customers.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-500">
            No customers added yet. Click &ldquo;Add New Customer&rdquo; to register your first client.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium text-neutral-500">
                  <th className="py-2.5 px-4">Customer Name</th>
                  <th className="py-2.5 px-4">Phone</th>
                  <th className="py-2.5 px-4">GSTIN</th>
                  <th className="py-2.5 px-4">State</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-medium text-neutral-900">{cust.name}</div>
                      {cust.companyName && (
                        <div className="text-xs text-neutral-500">{cust.companyName}</div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-neutral-700 tabular-nums whitespace-nowrap">
                      {cust.phone}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-neutral-600 whitespace-nowrap">
                      {cust.gstin || 'Unregistered'}
                    </td>
                    <td className="py-3 px-4 text-xs text-neutral-600 whitespace-nowrap">
                      {cust.stateCode}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenNewInvoiceForCustomer(cust.id)}
                        className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                      >
                        Create Bill
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
