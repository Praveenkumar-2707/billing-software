import { Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addCustomer, createGstInvoice } from '../services/billingService';
import type {
  Customer,
  GstFiling,
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  StackItem,
  UserProfile,
} from '../types';
import {
  computeInvoiceTotals,
  formatINR,
  getCurrentMonth,
  getDefaultDueDate,
  INDIAN_STATES,
  round2,
} from '../utils/format';

interface CreateInvoiceModalProps {
  ownerId: string;
  profile: UserProfile | null;
  stacks: StackItem[];
  customers: Customer[];
  invoices: Invoice[];
  gstFilings: GstFiling[];
  preselectedStackId?: string;
  preselectedCustomerId?: string;
  onClose: () => void;
}

interface DraftLine {
  stackId: string;
  qty: number;
}

export function CreateInvoiceModal({
  ownerId,
  profile,
  stacks,
  customers,
  invoices,
  gstFilings,
  preselectedStackId,
  preselectedCustomerId,
  onClose,
}: CreateInvoiceModalProps) {
  const availableStacks = stacks.filter((s) => s.availableQty > 0);
  const sellerState = profile?.stateCode || '27-Maharashtra';

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(
    preselectedCustomerId || customers.length > 0 ? 'existing' : 'new'
  );
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    preselectedCustomerId && customers.some((c) => c.id === preselectedCustomerId)
      ? preselectedCustomerId
      : customers[0]?.id || ''
  );

  const [newCust, setNewCust] = useState({
    name: '',
    companyName: '',
    gstin: '',
    phone: '',
    email: '',
    stateCode: sellerState,
    address: '',
  });

  const [invoiceNumber, setInvoiceNumber] = useState(
    `POS-${new Date().getFullYear()}-${String(4081 + invoices.length)}`
  );
  const [billingMonth, setBillingMonth] = useState(getCurrentMonth());
  const [dueDate, setDueDate] = useState(getDefaultDueDate(15));

  const initialStackId =
    preselectedStackId && availableStacks.some((s) => s.id === preselectedStackId)
      ? preselectedStackId
      : availableStacks[0]?.id || '';

  const [lines, setLines] = useState<DraftLine[]>(
    initialStackId ? [{ stackId: initialStackId, qty: 1 }] : []
  );

  const [itemQuery, setItemQuery] = useState('');
  const [initialPaid, setInitialPaid] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('UPI');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedCustomerState =
    customerMode === 'existing'
      ? customers.find((c) => c.id === selectedCustomerId)?.stateCode || sellerState
      : newCust.stateCode;

  const isInterState = resolvedCustomerState !== sellerState;

  const filteredShelfItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return availableStacks.slice(0, 8);
    return availableStacks
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.sku.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [availableStacks, itemQuery]);

  const computedLineItems: InvoiceLineItem[] = useMemo(() => {
    const items: InvoiceLineItem[] = [];
    for (const line of lines) {
      const stack = stacks.find((s) => s.id === line.stackId);
      if (!stack || line.qty <= 0) continue;
      const taxableValue = round2(stack.unitPrice * line.qty);
      const gstAmount = round2((taxableValue * stack.gstRate) / 100);
      items.push({
        stackId: stack.id,
        sku: stack.sku,
        name: stack.name,
        hsnCode: stack.hsnCode,
        unit: stack.unit,
        qty: line.qty,
        unitPrice: stack.unitPrice,
        gstRate: stack.gstRate,
        taxableValue,
        gstAmount,
        lineTotal: round2(taxableValue + gstAmount),
      });
    }
    return items;
  }, [lines, stacks]);

  const totals = useMemo(
    () => computeInvoiceTotals(computedLineItems, isInterState, Number(initialPaid) || 0),
    [computedLineItems, isInterState, initialPaid]
  );

  const handleQuickAddItem = (stack: StackItem) => {
    const existingIdx = lines.findIndex((l) => l.stackId === stack.id);
    if (existingIdx >= 0) {
      const nextQty = Math.min(stack.availableQty, lines[existingIdx].qty + 1);
      setLines(lines.map((l, idx) => (idx === existingIdx ? { ...l, qty: nextQty } : l)));
      return;
    }
    if (lines.length >= 20) return;
    setLines([...lines, { stackId: stack.id, qty: 1 }]);
  };

  const handleAddLine = () => {
    if (availableStacks.length === 0 || lines.length >= 20) return;
    setLines([...lines, { stackId: availableStacks[0].id, qty: 1 }]);
  };

  const handleLineChange = (idx: number, patch: Partial<DraftLine>) => {
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleRemoveLine = (idx: number) => {
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (computedLineItems.length === 0) {
      setError('Add at least one supermarket product with quantity greater than 0.');
      return;
    }

    for (const line of computedLineItems) {
      const stack = stacks.find((s) => s.id === line.stackId);
      if (stack && line.qty > stack.availableQty) {
        setError(
          `Requested quantity for ${stack.name} exceeds available shelf stock (${stack.availableQty}).`
        );
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      let customerObj: Customer | undefined;
      if (customerMode === 'existing') {
        customerObj = customers.find((c) => c.id === selectedCustomerId);
        if (!customerObj) {
          setError('Please select a valid customer.');
          setSubmitting(false);
          return;
        }
      } else {
        if (!newCust.name.trim() || !newCust.phone.trim()) {
          setError('Customer name and phone number are required.');
          setSubmitting(false);
          return;
        }
        customerObj = await addCustomer(ownerId, newCust);
      }

      const monthInvoices = invoices.filter((i) => i.billingMonth === billingMonth);
      const existingFiling = gstFilings.find((f) => f.billingMonth === billingMonth);

      await createGstInvoice({
        ownerId,
        invoiceNumber,
        billingMonth,
        customer: customerObj,
        sellerStateCode: sellerState,
        lineItems: computedLineItems,
        initialPaidAmount: totals.initialPaidAmount,
        paymentMethod,
        dueDate,
        notes,
        allStacks: stacks,
        monthInvoices,
        existingFiling,
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate supermarket bill.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-4xl my-8 overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-display font-semibold text-neutral-900">
              Supermarket POS Checkout & GST Bill
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Scan or pick shelf items, deduct stock automatically, and split counter payment vs. credit balance
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[84vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* POS Bill Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">POS Bill Number</label>
              <input
                type="text"
                required
                maxLength={40}
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Billing Month</label>
              <input
                type="month"
                required
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Credit Due Date</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
          </div>

          {/* Customer Selection */}
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800">
                Shopper / Credit Account
              </span>
              <div className="flex items-center gap-1 p-0.5 bg-neutral-100 rounded-lg">
                {customers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomerMode('existing')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      customerMode === 'existing' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
                    }`}
                  >
                    Existing Customer
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setCustomerMode('new')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    customerMode === 'new' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600'
                  }`}
                >
                  New Customer
                </button>
              </div>
            </div>

            {customerMode === 'existing' ? (
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.companyName ? `— ${c.companyName}` : ''} ({c.phone})
                  </option>
                ))}
              </select>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Customer Name"
                  maxLength={120}
                  value={newCust.name}
                  onChange={(e) => setNewCust({ ...newCust, name: e.target.value })}
                  className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <input
                  type="text"
                  placeholder="Household / Store / Mess Name (optional)"
                  maxLength={140}
                  value={newCust.companyName}
                  onChange={(e) => setNewCust({ ...newCust, companyName: e.target.value })}
                  className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <input
                  type="text"
                  required
                  placeholder="Mobile Number"
                  maxLength={24}
                  value={newCust.phone}
                  onChange={(e) => setNewCust({ ...newCust, phone: e.target.value })}
                  className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <input
                  type="text"
                  placeholder="Customer GSTIN (optional)"
                  maxLength={20}
                  value={newCust.gstin}
                  onChange={(e) => setNewCust({ ...newCust, gstin: e.target.value })}
                  className="px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <select
                  value={newCust.stateCode}
                  onChange={(e) => setNewCust({ ...newCust, stateCode: e.target.value })}
                  className="px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
                >
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Email Address (optional)"
                  maxLength={160}
                  value={newCust.email}
                  onChange={(e) => setNewCust({ ...newCust, email: e.target.value })}
                  className="px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>
            )}
          </div>

          {/* Quick Shelf Product Picker */}
          {availableStacks.length > 0 && (
            <div className="pt-3 border-t border-neutral-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-xs font-semibold text-neutral-800">
                  Quick Shelf Picker ({isInterState ? 'Inter-State IGST' : 'Intra-State CGST + SGST'})
                </span>
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    placeholder="Search SKU, grocery item, aisle..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {filteredShelfItems.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleQuickAddItem(s)}
                    className="p-2.5 text-left bg-neutral-50 hover:bg-red-50/70 border border-neutral-200 hover:border-red-300 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="text-xs font-medium text-neutral-900 truncate">{s.name}</div>
                    <div className="mt-1 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                      <span>{formatINR(s.unitPrice)}</span>
                      <span>
                        {s.availableQty} {s.unit} · {s.gstRate}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Basket / Bill Line Items */}
          <div className="pt-3 border-t border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-800">
                Checkout Basket ({lines.length} {lines.length === 1 ? 'item' : 'items'})
              </span>
              <button
                type="button"
                onClick={handleAddLine}
                disabled={availableStacks.length === 0}
                className="text-xs font-medium text-red-700 hover:underline inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Row</span>
              </button>
            </div>

            {availableStacks.length === 0 ? (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                All shelf items are currently sold out. Restock items in Supermarket Stock before billing.
              </div>
            ) : (
              <div className="space-y-2">
                {lines.map((line, idx) => {
                  const st = stacks.find((s) => s.id === line.stackId);
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6">
                        <select
                          value={line.stackId}
                          onChange={(e) => handleLineChange(idx, { stackId: e.target.value })}
                          className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
                        >
                          {availableStacks.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} ({s.availableQty} {s.unit} · {formatINR(s.unitPrice)} · {s.gstRate}% GST)
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            handleLineChange(idx, { qty: Math.max(1, line.qty - 1) })
                          }
                          className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={st?.availableQty || 9999}
                          value={line.qty}
                          onChange={(e) => handleLineChange(idx, { qty: Number(e.target.value) })}
                          className="w-full px-2 py-2 text-sm font-mono border border-neutral-300 rounded-lg text-center focus:outline-none focus:border-red-700"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleLineChange(idx, {
                              qty: Math.min(st?.availableQty || 9999, line.qty + 1),
                            })
                          }
                          className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                          aria-label="Increase quantity"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="col-span-2 text-right font-mono text-xs text-neutral-700 tabular-nums">
                        {st ? formatINR(st.unitPrice * line.qty * (1 + st.gstRate / 100)) : '—'}
                      </div>
                      <div className="col-span-1 text-right">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="text-neutral-400 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Counter Payment & Remaining Balance Split */}
          <div className="pt-4 border-t border-neutral-200 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Amount Paid at Counter Now (₹)
                </label>
                <input
                  type="number"
                  min={0}
                  max={totals.grandTotal}
                  step="0.01"
                  value={initialPaid}
                  onChange={(e) => setInitialPaid(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
                <div className="mt-1.5 flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setInitialPaid(String(totals.grandTotal))}
                    className="text-red-700 hover:underline cursor-pointer font-medium"
                  >
                    Full Payment
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialPaid(String(round2(totals.grandTotal * 0.5)))}
                    className="text-neutral-600 hover:underline cursor-pointer"
                  >
                    50% Advance
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialPaid('0')}
                    className="text-neutral-600 hover:underline cursor-pointer"
                  >
                    Full Credit (₹0 Paid)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">
                  Counter Payment Mode
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
                >
                  <option value="UPI">UPI / QR</option>
                  <option value="Cash">Cash</option>
                  <option value="NEFT">NEFT / Card</option>
                  <option value="RTGS">RTGS</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Taxable Subtotal</span>
                <span className="font-mono tabular-nums">{formatINR(totals.taxableAmount)}</span>
              </div>
              {isInterState ? (
                <div className="flex justify-between text-neutral-600">
                  <span>IGST</span>
                  <span className="font-mono tabular-nums">{formatINR(totals.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-neutral-600">
                    <span>CGST</span>
                    <span className="font-mono tabular-nums">{formatINR(totals.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-neutral-600">
                    <span>SGST</span>
                    <span className="font-mono tabular-nums">{formatINR(totals.sgstAmount)}</span>
                  </div>
                </>
              )}
              <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm font-semibold text-neutral-900">
                <span>Grand Total (incl. GST)</span>
                <span className="font-mono tabular-nums">{formatINR(totals.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-800 font-medium">
                <span>Paid at Counter</span>
                <span className="font-mono tabular-nums">{formatINR(totals.initialPaidAmount)}</span>
              </div>
              <div className="flex justify-between text-red-700 font-semibold">
                <span>Remaining Balance (Credit)</span>
                <span className="font-mono tabular-nums">{formatINR(totals.remainingAmount)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Bill Remarks</label>
            <input
              type="text"
              maxLength={400}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional delivery or credit settlement note"
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
            />
          </div>

          <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || computedLineItems.length === 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Generating POS Bill...' : 'Complete & Print GST Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
