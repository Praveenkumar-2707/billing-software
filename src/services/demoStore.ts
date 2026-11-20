import { Timestamp } from 'firebase/firestore';
import type {
  Customer,
  GstFiling,
  Invoice,
  InvoiceLineItem,
  PaymentMethod,
  PaymentRecord,
  StackItem,
  UserProfile,
} from '../types';
import {
  computeInvoiceTotals,
  getCurrentMonth,
  getDefaultDueDate,
  getPreviousMonth,
  round2,
  sanitizeStr,
  toMillisSafe,
} from '../utils/format';
import { BLUEPRINT_LIMITS } from '../types';

export interface DemoSnapshot {
  profile: UserProfile;
  stacks: StackItem[];
  customers: Customer[];
  invoices: Invoice[];
  payments: PaymentRecord[];
  gstFilings: GstFiling[];
}

type Listener = (snapshot: DemoSnapshot) => void;
const listeners = new Set<Listener>();

function computeStatus(availableQty: number, upgoingQty: number, reorderLevel: number) {
  if (availableQty <= 0) return 'sold_out' as const;
  if (upgoingQty > 0 || availableQty <= reorderLevel) return 'upgoing' as const;
  return 'in_stock' as const;
}

function calcGst(invoices: Invoice[]) {
  const totalInvoices = invoices.length;
  const totalTaxableValue = round2(invoices.reduce((s, i) => s + i.taxableAmount, 0));
  const totalCgst = round2(invoices.reduce((s, i) => s + i.cgstAmount, 0));
  const totalSgst = round2(invoices.reduce((s, i) => s + i.sgstAmount, 0));
  const totalIgst = round2(invoices.reduce((s, i) => s + i.igstAmount, 0));
  const totalGstLiability = round2(invoices.reduce((s, i) => s + i.totalGstAmount, 0));
  const gstCollected = round2(
    invoices.reduce((s, i) => (i.grandTotal <= 0 ? s : s + i.totalGstAmount * (i.paidAmount / i.grandTotal)), 0)
  );
  const gstPending = round2(Math.max(0, totalGstLiability - gstCollected));
  return {
    totalInvoices,
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalGstLiability,
    gstCollected,
    gstPending,
  };
}

function createInitialDemoState(): DemoSnapshot {
  const now = Timestamp.now();
  const currentMonth = getCurrentMonth();
  const prevMonth = getPreviousMonth(currentMonth);
  const sellerState = '27-Maharashtra';
  const ownerId = 'demo-supermarket-owner';

  const profile: UserProfile = {
    uid: ownerId,
    email: 'store-demo@arthamart.in',
    displayName: 'Store Manager (Demo)',
    businessName: 'ArthaMart Supermarket & Groceries',
    gstin: '27AABCA1234F1Z5',
    stateCode: sellerState,
    district: 'Mumbai City',
    address: 'Ground Floor, Sunrise Arcade, MG Road, Mumbai, Maharashtra 400001',
    createdAt: now,
    updatedAt: now,
  };

  const stacks: StackItem[] = [
    {
      id: 'demo-stk-1',
      ownerId,
      sku: 'SM-GRC-101',
      name: 'Organic Toor Dal & Pulses (5kg Pack)',
      hsnCode: '0713',
      category: 'Groceries & Staples',
      unit: 'Packs',
      unitPrice: 640,
      gstRate: 5,
      availableQty: 0,
      upgoingQty: 0,
      soldQty: 185,
      reorderLevel: 20,
      stackStatus: 'sold_out',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-stk-2',
      ownerId,
      sku: 'SM-DRY-204',
      name: 'FarmFresh Full Cream Milk (1L Carton)',
      hsnCode: '0401',
      category: 'Dairy & Chilled',
      unit: 'Cartons',
      unitPrice: 68,
      gstRate: 0,
      availableQty: 0,
      upgoingQty: 40,
      soldQty: 420,
      reorderLevel: 30,
      stackStatus: 'sold_out',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-stk-3',
      ownerId,
      sku: 'SM-OIL-310',
      name: 'Cold-Pressed Sunflower Cooking Oil (5L Jar)',
      hsnCode: '1512',
      category: 'Oils & Pantry',
      unit: 'Jars',
      unitPrice: 780,
      gstRate: 5,
      availableQty: 18,
      upgoingQty: 45,
      soldQty: 96,
      reorderLevel: 20,
      stackStatus: 'upgoing',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-stk-4',
      ownerId,
      sku: 'SM-SNK-412',
      name: 'Assorted Family Biscuit & Snack Case',
      hsnCode: '1905',
      category: 'Snacks & Bakery',
      unit: 'Cases',
      unitPrice: 420,
      gstRate: 18,
      availableQty: 26,
      upgoingQty: 30,
      soldQty: 142,
      reorderLevel: 20,
      stackStatus: 'upgoing',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-stk-5',
      ownerId,
      sku: 'SM-HOM-508',
      name: 'Liquid Laundry Detergent (2L Bottle)',
      hsnCode: '3402',
      category: 'Home & Hygiene',
      unit: 'Bottles',
      unitPrice: 345,
      gstRate: 18,
      availableQty: 64,
      upgoingQty: 25,
      soldQty: 110,
      reorderLevel: 25,
      stackStatus: 'upgoing',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-stk-6',
      ownerId,
      sku: 'SM-BEV-615',
      name: 'Arabica Instant Coffee & Tea Combo',
      hsnCode: '0901',
      category: 'Beverages',
      unit: 'Packs',
      unitPrice: 520,
      gstRate: 12,
      availableQty: 38,
      upgoingQty: 20,
      soldQty: 74,
      reorderLevel: 15,
      stackStatus: 'upgoing',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const customers: Customer[] = [
    {
      id: 'demo-cust-1',
      ownerId,
      name: 'Ramesh Kulkarni',
      companyName: 'Kulkarni Catering & Mess',
      gstin: '27AAECK8921K1Z8',
      phone: '+91 98204 51209',
      email: 'accounts@kulkarnicatering.in',
      stateCode: sellerState,
      address: 'Shop 8, Station Road Market, Mumbai 400028',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-cust-2',
      ownerId,
      name: 'Priya Nair',
      companyName: 'GreenLeaf Hostel & Pantry',
      gstin: '29AABCG4410R1Z2',
      phone: '+91 98450 77312',
      email: 'billing@greenleafhostel.com',
      stateCode: '29-Karnataka',
      address: '42 Indiranagar 2nd Stage, Bengaluru 560038',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-cust-3',
      ownerId,
      name: 'Suresh Agarwal',
      companyName: 'Agarwal Provision & Bakery',
      gstin: '07AAACA7721B1Z4',
      phone: '+91 98112 33940',
      email: 'suresh@agarwalbakery.in',
      stateCode: '07-Delhi',
      address: 'B-14 Lajpat Nagar Market, New Delhi 110024',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'demo-cust-4',
      ownerId,
      name: 'Neha Verma',
      companyName: 'Loyalty Member · Household',
      gstin: '',
      phone: '+91 97654 11890',
      email: 'neha.verma@example.in',
      stateCode: sellerState,
      address: 'Flat 302, Silver Oak Apartments, Pune 411001',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const mkLine = (s: StackItem, qty: number): InvoiceLineItem => {
    const taxableValue = round2(s.unitPrice * qty);
    const gstAmount = round2((taxableValue * s.gstRate) / 100);
    return {
      stackId: s.id,
      sku: s.sku,
      name: s.name,
      hsnCode: s.hsnCode,
      unit: s.unit,
      qty,
      unitPrice: s.unitPrice,
      gstRate: s.gstRate,
      taxableValue,
      gstAmount,
      lineTotal: round2(taxableValue + gstAmount),
    };
  };

  const seeds = [
    {
      id: 'demo-inv-1',
      invoiceNumber: 'POS-2026-4081',
      billingMonth: prevMonth,
      customer: customers[0],
      items: [mkLine(stacks[0], 18), mkLine(stacks[2], 6)],
      initialPaid: 8000,
      dueDate: '2026-10-28',
      notes: 'Monthly grocery ration dispatch; initial counter payment received, balance on credit.',
      method: 'UPI' as PaymentMethod,
    },
    {
      id: 'demo-inv-2',
      invoiceNumber: 'POS-2026-4082',
      billingMonth: currentMonth,
      customer: customers[1],
      items: [mkLine(stacks[1], 35), mkLine(stacks[3], 12)],
      initialPaid: 4000,
      dueDate: getDefaultDueDate(-2),
      notes: 'Hostel dairy & snack supply; part payment settled via NEFT.',
      method: 'NEFT' as PaymentMethod,
    },
    {
      id: 'demo-inv-3',
      invoiceNumber: 'POS-2026-4083',
      billingMonth: currentMonth,
      customer: customers[2],
      items: [mkLine(stacks[4], 14), mkLine(stacks[5], 8)],
      initialPaid: 5000,
      dueDate: getDefaultDueDate(7),
      notes: 'Initial advance received at billing counter; remaining balance due in 7 days.',
      method: 'UPI' as PaymentMethod,
    },
    {
      id: 'demo-inv-4',
      invoiceNumber: 'POS-2026-4084',
      billingMonth: currentMonth,
      customer: customers[3],
      items: [mkLine(stacks[2], 2), mkLine(stacks[4], 3), mkLine(stacks[5], 2)],
      initialPaid: 4024.1,
      dueDate: getDefaultDueDate(0),
      notes: 'Paid in full at supermarket POS counter.',
      method: 'Cash' as PaymentMethod,
    },
  ];

  const invoices: Invoice[] = [];
  const payments: PaymentRecord[] = [];

  for (const seed of seeds) {
    const isInterState = seed.customer.stateCode !== sellerState;
    const totals = computeInvoiceTotals(seed.items, isInterState, seed.initialPaid);
    invoices.push({
      id: seed.id,
      ownerId,
      invoiceNumber: seed.invoiceNumber,
      billingMonth: seed.billingMonth,
      customerId: seed.customer.id,
      customerName: seed.customer.name,
      customerCompany: seed.customer.companyName,
      customerGstin: seed.customer.gstin,
      customerPhone: seed.customer.phone,
      customerState: seed.customer.stateCode,
      isInterState,
      itemsSummary: sanitizeStr(
        seed.items.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', '),
        BLUEPRINT_LIMITS.MAX_ITEMS_SUMMARY_LEN
      ),
      lineItems: seed.items,
      ...totals,
      dueDate: seed.dueDate,
      notes: seed.notes,
      createdAt: now,
      updatedAt: now,
    });

    if (totals.initialPaidAmount > 0) {
      payments.push({
        id: `demo-pay-${seed.id}`,
        ownerId,
        invoiceId: seed.id,
        invoiceNumber: seed.invoiceNumber,
        customerId: seed.customer.id,
        customerName: seed.customer.name,
        amount: totals.initialPaidAmount,
        paymentMethod: seed.method,
        referenceNo: `INIT-${seed.invoiceNumber}`,
        billingMonth: seed.billingMonth,
        createdAt: now,
      });
    }
  }

  const gstFilings: GstFiling[] = [currentMonth, prevMonth].map((month) => ({
    id: `${ownerId}_${month}`,
    ownerId,
    billingMonth: month,
    ...calcGst(invoices.filter((i) => i.billingMonth === month)),
    challanNumber: '',
    filingStatus: 'generated',
    createdAt: now,
    updatedAt: now,
  }));

  return { profile, stacks, customers, invoices, payments, gstFilings };
}

const WORKSPACE_STORAGE_KEY = 'arthamart_local_workspace_v1';

function prepareForStorage(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (typeof (value as { toMillis?: () => number }).toMillis === 'function') {
    return { __tsMillis: (value as { toMillis: () => number }).toMillis() };
  }
  if (Array.isArray(value)) {
    return value.map(prepareForStorage);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = prepareForStorage(v);
  }
  return out;
}

function serializeWithTimestamps(snapshot: DemoSnapshot): string {
  return JSON.stringify(prepareForStorage(snapshot));
}

function reviveTimestamps(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(reviveTimestamps);
  }
  if (obj && typeof obj === 'object') {
    const rec = obj as Record<string, unknown>;
    if (typeof rec.__tsMillis === 'number' && Object.keys(rec).length === 1) {
      return Timestamp.fromMillis(rec.__tsMillis);
    }
    if (
      typeof rec.seconds === 'number' &&
      typeof rec.nanoseconds === 'number' &&
      Object.keys(rec).every((k) => k === 'seconds' || k === 'nanoseconds' || k === 'type')
    ) {
      return new Timestamp(rec.seconds, rec.nanoseconds);
    }
    if (
      typeof rec._seconds === 'number' &&
      typeof rec._nanoseconds === 'number' &&
      Object.keys(rec).every((k) => k === '_seconds' || k === '_nanoseconds')
    ) {
      return new Timestamp(rec._seconds, rec._nanoseconds);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      out[k] = reviveTimestamps(v);
    }
    return out;
  }
  return obj;
}

function loadInitialDemoState(): DemoSnapshot {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (raw) {
        const parsed = reviveTimestamps(JSON.parse(raw)) as Partial<DemoSnapshot>;
        if (
          parsed &&
          parsed.profile &&
          Array.isArray(parsed.stacks) &&
          Array.isArray(parsed.customers) &&
          Array.isArray(parsed.invoices) &&
          Array.isArray(parsed.payments) &&
          Array.isArray(parsed.gstFilings)
        ) {
          return parsed as DemoSnapshot;
        }
      }
    } catch {
      // Fallback to fresh initial state
    }
  }
  return createInitialDemoState();
}

let state: DemoSnapshot = loadInitialDemoState();

function persistState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serializeWithTimestamps(state));
  } catch {
    // Ignore storage quota issues
  }
}

function notify() {
  persistState();
  const snapshot: DemoSnapshot = {
    profile: state.profile,
    stacks: [...state.stacks],
    customers: [...state.customers],
    invoices: [...state.invoices],
    payments: [...state.payments],
    gstFilings: [...state.gstFilings],
  };
  listeners.forEach((l) => l(snapshot));
}

export function subscribeDemoStore(listener: Listener): () => void {
  listeners.add(listener);
  listener({
    profile: state.profile,
    stacks: [...state.stacks],
    customers: [...state.customers],
    invoices: [...state.invoices],
    payments: [...state.payments],
    gstFilings: [...state.gstFilings],
  });
  return () => {
    listeners.delete(listener);
  };
}

export function getStoredStoreProfile(): UserProfile {
  return state.profile;
}

export function resetDemoStore() {
  state = createInitialDemoState();
  notify();
}

export function demoUpdateProfile(
  updates: Pick<UserProfile, 'displayName' | 'businessName' | 'gstin' | 'stateCode' | 'district' | 'address'>
) {
  state.profile = { ...state.profile, ...updates, updatedAt: Timestamp.now() };
  notify();
}

export function demoAddStack(
  input: Omit<StackItem, 'id' | 'ownerId' | 'stackStatus' | 'createdAt' | 'updatedAt'>
): string {
  const id = `demo-stk-${Date.now()}`;
  const now = Timestamp.now();
  const stackStatus = computeStatus(input.availableQty, input.upgoingQty, input.reorderLevel);
  state.stacks = [
    { ...input, id, ownerId: state.profile.uid, stackStatus, createdAt: now, updatedAt: now },
    ...state.stacks,
  ];
  notify();
  return id;
}

export function demoUpdateStack(
  stackId: string,
  updates: Omit<StackItem, 'id' | 'ownerId' | 'stackStatus' | 'createdAt' | 'updatedAt'>
) {
  const now = Timestamp.now();
  const stackStatus = computeStatus(updates.availableQty, updates.upgoingQty, updates.reorderLevel);
  state.stacks = state.stacks.map((s) =>
    s.id === stackId ? { ...s, ...updates, stackStatus, updatedAt: now } : s
  );
  notify();
}

export function demoDeleteStack(stackId: string) {
  state.stacks = state.stacks.filter((s) => s.id !== stackId);
  notify();
}

export function demoAddCustomer(
  input: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Customer {
  const now = Timestamp.now();
  const created: Customer = {
    ...input,
    id: `demo-cust-${Date.now()}`,
    ownerId: state.profile.uid,
    createdAt: now,
    updatedAt: now,
  };
  state.customers = [...state.customers, created];
  notify();
  return created;
}

export function demoCreateInvoice(params: {
  invoiceNumber: string;
  billingMonth: string;
  customer: Customer;
  sellerStateCode: string;
  lineItems: InvoiceLineItem[];
  initialPaidAmount: number;
  paymentMethod: PaymentMethod;
  dueDate: string;
  notes: string;
}): string {
  const now = Timestamp.now();
  const id = `demo-inv-${Date.now()}`;
  const isInterState = params.customer.stateCode !== params.sellerStateCode;
  const totals = computeInvoiceTotals(params.lineItems, isInterState, params.initialPaidAmount);

  const newInv: Invoice = {
    id,
    ownerId: state.profile.uid,
    invoiceNumber: params.invoiceNumber,
    billingMonth: params.billingMonth,
    customerId: params.customer.id,
    customerName: params.customer.name,
    customerCompany: params.customer.companyName,
    customerGstin: params.customer.gstin,
    customerPhone: params.customer.phone,
    customerState: params.customer.stateCode,
    isInterState,
    itemsSummary: sanitizeStr(
      params.lineItems.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', '),
      BLUEPRINT_LIMITS.MAX_ITEMS_SUMMARY_LEN
    ),
    lineItems: params.lineItems,
    ...totals,
    dueDate: params.dueDate,
    notes: params.notes,
    createdAt: now,
    updatedAt: now,
  };

  state.invoices = [newInv, ...state.invoices];

  if (totals.initialPaidAmount > 0) {
    state.payments = [
      {
        id: `demo-pay-${Date.now()}`,
        ownerId: state.profile.uid,
        invoiceId: id,
        invoiceNumber: params.invoiceNumber,
        customerId: params.customer.id,
        customerName: params.customer.name,
        amount: totals.initialPaidAmount,
        paymentMethod: params.paymentMethod,
        referenceNo: `INIT-${params.invoiceNumber}`,
        billingMonth: params.billingMonth,
        createdAt: now,
      },
      ...state.payments,
    ];
  }

  state.stacks = state.stacks.map((s) => {
    const soldLine = params.lineItems.find((l) => l.stackId === s.id);
    if (!soldLine) return s;
    const nextAvail = Math.max(0, s.availableQty - soldLine.qty);
    const nextSold = s.soldQty + soldLine.qty;
    return {
      ...s,
      availableQty: nextAvail,
      soldQty: nextSold,
      stackStatus: computeStatus(nextAvail, s.upgoingQty, s.reorderLevel),
      updatedAt: now,
    };
  });

  demoSyncGst(params.billingMonth);
  notify();
  return id;
}

export function demoCollectPayment(params: {
  invoice: Invoice;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
}) {
  const now = Timestamp.now();
  const payAmount = round2(Math.min(params.invoice.remainingAmount, Math.max(0.01, params.amount)));
  const isFull = payAmount >= params.invoice.remainingAmount - 0.01;
  const finalPaid = isFull ? params.invoice.grandTotal : round2(params.invoice.paidAmount + payAmount);
  const finalRemaining = isFull ? 0 : round2(Math.max(0, params.invoice.grandTotal - finalPaid));
  const nextStatus = finalRemaining <= 0.01 ? 'paid' : 'partial';

  state.invoices = state.invoices
    .map((inv) =>
      inv.id === params.invoice.id
        ? {
            ...inv,
            paidAmount: nextStatus === 'paid' ? inv.grandTotal : finalPaid,
            remainingAmount: nextStatus === 'paid' ? 0 : finalRemaining,
            paymentStatus: nextStatus as Invoice['paymentStatus'],
            updatedAt: now,
          }
        : inv
    )
    .sort((a, b) => {
      const aTime = Math.max(toMillisSafe(a.updatedAt), toMillisSafe(a.createdAt));
      const bTime = Math.max(toMillisSafe(b.updatedAt), toMillisSafe(b.createdAt));
      return bTime - aTime;
    });

  state.payments = [
    {
      id: `demo-pay-${Date.now()}`,
      ownerId: state.profile.uid,
      invoiceId: params.invoice.id,
      invoiceNumber: params.invoice.invoiceNumber,
      customerId: params.invoice.customerId,
      customerName: params.invoice.customerName,
      amount: payAmount,
      paymentMethod: params.paymentMethod,
      referenceNo: params.referenceNo || `BAL-${Date.now().toString().slice(-6)}`,
      billingMonth: params.invoice.billingMonth,
      createdAt: now,
    },
    ...state.payments,
  ];

  demoSyncGst(params.invoice.billingMonth);
  notify();
}

export function demoSyncGst(billingMonth: string) {
  const now = Timestamp.now();
  const monthInvoices = state.invoices.filter((i) => i.billingMonth === billingMonth);
  const metrics = calcGst(monthInvoices);
  const existing = state.gstFilings.find((f) => f.billingMonth === billingMonth);
  if (existing?.filingStatus === 'paid') return;

  if (!existing) {
    state.gstFilings = [
      {
        id: `${state.profile.uid}_${billingMonth}`,
        ownerId: state.profile.uid,
        billingMonth,
        ...metrics,
        challanNumber: '',
        filingStatus: 'generated',
        createdAt: now,
        updatedAt: now,
      },
      ...state.gstFilings,
    ];
  } else {
    state.gstFilings = state.gstFilings.map((f) =>
      f.billingMonth === billingMonth ? { ...f, ...metrics, updatedAt: now } : f
    );
  }
  notify();
}

export function demoPayGst(filingId: string, challanNumber: string) {
  const now = Timestamp.now();
  state.gstFilings = state.gstFilings.map((f) =>
    f.id === filingId ? { ...f, challanNumber, filingStatus: 'paid', updatedAt: now } : f
  );
  notify();
}
