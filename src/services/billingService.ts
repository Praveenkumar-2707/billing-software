import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BLUEPRINT_LIMITS,
  type Customer,
  type GstFiling,
  type Invoice,
  type InvoiceLineItem,
  type PaymentMethod,
  type StackItem,
  type StackStatus,
  type UserProfile,
} from '../types';
import {
  computeInvoiceTotals,
  getCurrentMonth,
  getDefaultDistrictForState,
  getDefaultDueDate,
  getPreviousMonth,
  round2,
  sanitizeStr,
} from '../utils/format';
import {
  demoAddCustomer,
  demoAddStack,
  demoCollectPayment,
  demoCreateInvoice,
  demoDeleteStack,
  demoPayGst,
  demoSyncGst,
  demoUpdateProfile,
  demoUpdateStack,
  resetDemoStore,
} from './demoStore';

let demoModeEnabled = false;

export function setDemoMode(enabled: boolean) {
  demoModeEnabled = enabled;
}

export function isDemoMode(): boolean {
  return demoModeEnabled;
}

export function computeStackStatus(
  availableQty: number,
  upgoingQty: number,
  reorderLevel: number
): StackStatus {
  if (availableQty <= 0) return 'sold_out';
  if (upgoingQty > 0 || availableQty <= reorderLevel) return 'upgoing';
  return 'in_stock';
}

export function calculateMonthGstMetrics(invoices: Invoice[]) {
  const totalInvoices = invoices.length;
  const totalTaxableValue = round2(invoices.reduce((s, i) => s + i.taxableAmount, 0));
  const totalCgst = round2(invoices.reduce((s, i) => s + i.cgstAmount, 0));
  const totalSgst = round2(invoices.reduce((s, i) => s + i.sgstAmount, 0));
  const totalIgst = round2(invoices.reduce((s, i) => s + i.igstAmount, 0));
  const totalGstLiability = round2(invoices.reduce((s, i) => s + i.totalGstAmount, 0));
  const gstCollected = round2(
    invoices.reduce((s, i) => {
      if (i.grandTotal <= 0) return s;
      return s + i.totalGstAmount * (i.paidAmount / i.grandTotal);
    }, 0)
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

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserProfile;
    }

    const displayName = sanitizeStr(
      user.displayName || user.email?.split('@')[0] || 'Business Owner',
      BLUEPRINT_LIMITS.MAX_DISPLAY_NAME_LEN
    );
    const profilePayload = {
      uid: user.uid,
      email: sanitizeStr(user.email || '', BLUEPRINT_LIMITS.MAX_EMAIL_LEN),
      displayName,
      businessName: sanitizeStr(`${displayName} Supermarket & Mart`, BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      gstin: '27AABCA1234F1Z5',
      stateCode: '27-Maharashtra',
      district: getDefaultDistrictForState('27-Maharashtra'),
      address: 'Ground Floor, Sunrise Arcade, MG Road, Mumbai, Maharashtra 400001',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, profilePayload);
    const createdSnap = await getDoc(ref);
    return createdSnap.data() as UserProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserProfile(
  uid: string,
  updates: Pick<UserProfile, 'displayName' | 'businessName' | 'gstin' | 'stateCode' | 'district' | 'address'>
): Promise<void> {
  const nextState = sanitizeStr(updates.stateCode || '27-Maharashtra', BLUEPRINT_LIMITS.MAX_STATE_LEN);
  const nextDistrict = sanitizeStr(
    updates.district ?? getDefaultDistrictForState(nextState),
    BLUEPRINT_LIMITS.MAX_DISTRICT_LEN
  );
  if (demoModeEnabled) {
    demoUpdateProfile({
      displayName: sanitizeStr(updates.displayName, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME_LEN),
      businessName: sanitizeStr(updates.businessName || 'My Business', BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      gstin: sanitizeStr(updates.gstin.toUpperCase(), BLUEPRINT_LIMITS.MAX_GSTIN_LEN),
      stateCode: nextState,
      district: nextDistrict,
      address: sanitizeStr(updates.address, BLUEPRINT_LIMITS.MAX_ADDRESS_LEN),
    });
    return;
  }
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      displayName: sanitizeStr(updates.displayName, BLUEPRINT_LIMITS.MAX_DISPLAY_NAME_LEN),
      businessName: sanitizeStr(updates.businessName || 'My Business', BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      gstin: sanitizeStr(updates.gstin.toUpperCase(), BLUEPRINT_LIMITS.MAX_GSTIN_LEN),
      stateCode: nextState,
      district: nextDistrict,
      address: sanitizeStr(updates.address, BLUEPRINT_LIMITS.MAX_ADDRESS_LEN),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function addStackItem(
  ownerId: string,
  input: Omit<StackItem, 'id' | 'ownerId' | 'stackStatus' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  if (demoModeEnabled) {
    return demoAddStack({
      sku: sanitizeStr(input.sku.toUpperCase(), BLUEPRINT_LIMITS.MAX_SKU_LEN),
      name: sanitizeStr(input.name, BLUEPRINT_LIMITS.MAX_STACK_NAME_LEN),
      hsnCode: sanitizeStr(input.hsnCode, BLUEPRINT_LIMITS.MAX_HSN_LEN),
      category: sanitizeStr(input.category, BLUEPRINT_LIMITS.MAX_CATEGORY_LEN),
      unit: sanitizeStr(input.unit, BLUEPRINT_LIMITS.MAX_UNIT_LEN),
      unitPrice: round2(Math.max(0, Number(input.unitPrice) || 0)),
      gstRate: input.gstRate,
      availableQty: Math.max(0, Number(input.availableQty) || 0),
      upgoingQty: Math.max(0, Number(input.upgoingQty) || 0),
      soldQty: Math.max(0, Number(input.soldQty) || 0),
      reorderLevel: Math.max(0, Number(input.reorderLevel) || 0),
    });
  }
  const ref = doc(collection(db, 'stacks'));
  const path = `stacks/${ref.id}`;
  try {
    const availableQty = Math.max(0, Number(input.availableQty) || 0);
    const upgoingQty = Math.max(0, Number(input.upgoingQty) || 0);
    const soldQty = Math.max(0, Number(input.soldQty) || 0);
    const reorderLevel = Math.max(0, Number(input.reorderLevel) || 0);
    const stackStatus = computeStackStatus(availableQty, upgoingQty, reorderLevel);

    await setDoc(ref, {
      ownerId,
      sku: sanitizeStr(input.sku.toUpperCase(), BLUEPRINT_LIMITS.MAX_SKU_LEN),
      name: sanitizeStr(input.name, BLUEPRINT_LIMITS.MAX_STACK_NAME_LEN),
      hsnCode: sanitizeStr(input.hsnCode, BLUEPRINT_LIMITS.MAX_HSN_LEN),
      category: sanitizeStr(input.category, BLUEPRINT_LIMITS.MAX_CATEGORY_LEN),
      unit: sanitizeStr(input.unit, BLUEPRINT_LIMITS.MAX_UNIT_LEN),
      unitPrice: round2(Math.max(0, Number(input.unitPrice) || 0)),
      gstRate: input.gstRate,
      availableQty,
      upgoingQty,
      soldQty,
      reorderLevel,
      stackStatus,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateStackItem(
  stackId: string,
  updates: Omit<StackItem, 'id' | 'ownerId' | 'stackStatus' | 'createdAt' | 'updatedAt'>
): Promise<void> {
  if (demoModeEnabled) {
    demoUpdateStack(stackId, {
      sku: sanitizeStr(updates.sku.toUpperCase(), BLUEPRINT_LIMITS.MAX_SKU_LEN),
      name: sanitizeStr(updates.name, BLUEPRINT_LIMITS.MAX_STACK_NAME_LEN),
      hsnCode: sanitizeStr(updates.hsnCode, BLUEPRINT_LIMITS.MAX_HSN_LEN),
      category: sanitizeStr(updates.category, BLUEPRINT_LIMITS.MAX_CATEGORY_LEN),
      unit: sanitizeStr(updates.unit, BLUEPRINT_LIMITS.MAX_UNIT_LEN),
      unitPrice: round2(Math.max(0, Number(updates.unitPrice) || 0)),
      gstRate: updates.gstRate,
      availableQty: Math.max(0, Number(updates.availableQty) || 0),
      upgoingQty: Math.max(0, Number(updates.upgoingQty) || 0),
      soldQty: Math.max(0, Number(updates.soldQty) || 0),
      reorderLevel: Math.max(0, Number(updates.reorderLevel) || 0),
    });
    return;
  }
  const path = `stacks/${stackId}`;
  try {
    const availableQty = Math.max(0, Number(updates.availableQty) || 0);
    const upgoingQty = Math.max(0, Number(updates.upgoingQty) || 0);
    const soldQty = Math.max(0, Number(updates.soldQty) || 0);
    const reorderLevel = Math.max(0, Number(updates.reorderLevel) || 0);
    const stackStatus = computeStackStatus(availableQty, upgoingQty, reorderLevel);

    await updateDoc(doc(db, 'stacks', stackId), {
      sku: sanitizeStr(updates.sku.toUpperCase(), BLUEPRINT_LIMITS.MAX_SKU_LEN),
      name: sanitizeStr(updates.name, BLUEPRINT_LIMITS.MAX_STACK_NAME_LEN),
      hsnCode: sanitizeStr(updates.hsnCode, BLUEPRINT_LIMITS.MAX_HSN_LEN),
      category: sanitizeStr(updates.category, BLUEPRINT_LIMITS.MAX_CATEGORY_LEN),
      unit: sanitizeStr(updates.unit, BLUEPRINT_LIMITS.MAX_UNIT_LEN),
      unitPrice: round2(Math.max(0, Number(updates.unitPrice) || 0)),
      gstRate: updates.gstRate,
      availableQty,
      upgoingQty,
      soldQty,
      reorderLevel,
      stackStatus,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStackItem(stackId: string): Promise<void> {
  if (demoModeEnabled) {
    demoDeleteStack(stackId);
    return;
  }
  const path = `stacks/${stackId}`;
  try {
    await deleteDoc(doc(db, 'stacks', stackId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addCustomer(
  ownerId: string,
  input: Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<Customer> {
  if (demoModeEnabled) {
    return demoAddCustomer({
      name: sanitizeStr(input.name, BLUEPRINT_LIMITS.MAX_CUSTOMER_NAME_LEN),
      companyName: sanitizeStr(input.companyName, BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      gstin: sanitizeStr(input.gstin.toUpperCase(), BLUEPRINT_LIMITS.MAX_GSTIN_LEN),
      phone: sanitizeStr(input.phone, BLUEPRINT_LIMITS.MAX_PHONE_LEN),
      email: sanitizeStr(input.email, BLUEPRINT_LIMITS.MAX_EMAIL_LEN),
      stateCode: sanitizeStr(input.stateCode, BLUEPRINT_LIMITS.MAX_STATE_LEN),
      address: sanitizeStr(input.address, BLUEPRINT_LIMITS.MAX_ADDRESS_LEN),
    });
  }
  const ref = doc(collection(db, 'customers'));
  const path = `customers/${ref.id}`;
  try {
    const payload = {
      ownerId,
      name: sanitizeStr(input.name, BLUEPRINT_LIMITS.MAX_CUSTOMER_NAME_LEN),
      companyName: sanitizeStr(input.companyName, BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      gstin: sanitizeStr(input.gstin.toUpperCase(), BLUEPRINT_LIMITS.MAX_GSTIN_LEN),
      phone: sanitizeStr(input.phone, BLUEPRINT_LIMITS.MAX_PHONE_LEN),
      email: sanitizeStr(input.email, BLUEPRINT_LIMITS.MAX_EMAIL_LEN),
      stateCode: sanitizeStr(input.stateCode, BLUEPRINT_LIMITS.MAX_STATE_LEN),
      address: sanitizeStr(input.address, BLUEPRINT_LIMITS.MAX_ADDRESS_LEN),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
    return {
      id: ref.id,
      ownerId: payload.ownerId,
      name: payload.name,
      companyName: payload.companyName,
      gstin: payload.gstin,
      phone: payload.phone,
      email: payload.email,
      stateCode: payload.stateCode,
      address: payload.address,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function createGstInvoice(params: {
  ownerId: string;
  invoiceNumber: string;
  billingMonth: string;
  customer: Customer;
  sellerStateCode: string;
  lineItems: InvoiceLineItem[];
  initialPaidAmount: number;
  paymentMethod: PaymentMethod;
  dueDate: string;
  notes: string;
  allStacks: StackItem[];
  monthInvoices: Invoice[];
  existingFiling?: GstFiling;
}): Promise<string> {
  if (demoModeEnabled) {
    return demoCreateInvoice({
      invoiceNumber: sanitizeStr(params.invoiceNumber, BLUEPRINT_LIMITS.MAX_INVOICE_NO_LEN),
      billingMonth: params.billingMonth,
      customer: params.customer,
      sellerStateCode: params.sellerStateCode,
      lineItems: params.lineItems.slice(0, BLUEPRINT_LIMITS.MAX_LINE_ITEMS),
      initialPaidAmount: params.initialPaidAmount,
      paymentMethod: params.paymentMethod,
      dueDate: params.dueDate,
      notes: sanitizeStr(params.notes, BLUEPRINT_LIMITS.MAX_NOTES_LEN),
    });
  }
  const invRef = doc(collection(db, 'invoices'));
  const path = `invoices/${invRef.id}`;

  try {
    const batch = writeBatch(db);
    const boundedItems = params.lineItems.slice(0, BLUEPRINT_LIMITS.MAX_LINE_ITEMS);
    const isInterState = params.customer.stateCode !== params.sellerStateCode;
    const totals = computeInvoiceTotals(boundedItems, isInterState, params.initialPaidAmount);

    const itemsSummary = sanitizeStr(
      boundedItems.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', '),
      BLUEPRINT_LIMITS.MAX_ITEMS_SUMMARY_LEN
    );

    const invoicePayload = {
      ownerId: params.ownerId,
      invoiceNumber: sanitizeStr(params.invoiceNumber, BLUEPRINT_LIMITS.MAX_INVOICE_NO_LEN),
      billingMonth: params.billingMonth,
      customerId: params.customer.id,
      customerName: sanitizeStr(params.customer.name, BLUEPRINT_LIMITS.MAX_CUSTOMER_NAME_LEN),
      customerCompany: sanitizeStr(params.customer.companyName, BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN),
      customerGstin: sanitizeStr(params.customer.gstin, BLUEPRINT_LIMITS.MAX_GSTIN_LEN),
      customerPhone: sanitizeStr(params.customer.phone, BLUEPRINT_LIMITS.MAX_PHONE_LEN),
      customerState: sanitizeStr(params.customer.stateCode, BLUEPRINT_LIMITS.MAX_STATE_LEN),
      isInterState,
      itemsSummary,
      lineItems: boundedItems,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      totalGstAmount: totals.totalGstAmount,
      grandTotal: totals.grandTotal,
      initialPaidAmount: totals.initialPaidAmount,
      paidAmount: totals.paidAmount,
      remainingAmount: totals.remainingAmount,
      paymentStatus: totals.paymentStatus,
      dueDate: params.dueDate,
      notes: sanitizeStr(params.notes, BLUEPRINT_LIMITS.MAX_NOTES_LEN),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(invRef, invoicePayload);

    if (totals.initialPaidAmount > 0) {
      const payRef = doc(collection(db, 'payments'));
      batch.set(payRef, {
        ownerId: params.ownerId,
        invoiceId: invRef.id,
        invoiceNumber: invoicePayload.invoiceNumber,
        customerId: params.customer.id,
        customerName: invoicePayload.customerName,
        amount: totals.initialPaidAmount,
        paymentMethod: params.paymentMethod,
        referenceNo: sanitizeStr(`INIT-${invoicePayload.invoiceNumber}`, BLUEPRINT_LIMITS.MAX_REF_NO_LEN),
        billingMonth: params.billingMonth,
        createdAt: serverTimestamp(),
      });
    }

    // Deduct stock quantities and update sold_out / upgoing status automatically
    for (const item of boundedItems) {
      const stack = params.allStacks.find((s) => s.id === item.stackId);
      if (stack) {
        const nextAvailable = Math.max(0, stack.availableQty - item.qty);
        const nextSold = stack.soldQty + item.qty;
        const nextStatus = computeStackStatus(nextAvailable, stack.upgoingQty, stack.reorderLevel);
        batch.update(doc(db, 'stacks', stack.id), {
          availableQty: nextAvailable,
          soldQty: nextSold,
          stackStatus: nextStatus,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Automatically sync Monthly GST Auto-Bill unless that month is already paid/filed
    const { createdAt: _c, updatedAt: _u, ...invoiceWithoutTimestamps } = invoicePayload;
    const syntheticInvoice: Invoice = {
      id: invRef.id,
      ...invoiceWithoutTimestamps,
    };
    const nextMonthInvoices = [...params.monthInvoices, syntheticInvoice];
    const metrics = calculateMonthGstMetrics(nextMonthInvoices);
    const filingId = `${params.ownerId}_${params.billingMonth}`;
    const filingRef = doc(db, 'gstFilings', filingId);

    if (!params.existingFiling) {
      batch.set(filingRef, {
        ownerId: params.ownerId,
        billingMonth: params.billingMonth,
        ...metrics,
        challanNumber: '',
        filingStatus: 'generated',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (params.existingFiling.filingStatus !== 'paid') {
      batch.update(filingRef, {
        ...metrics,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return invRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function collectRemainingPayment(params: {
  ownerId: string;
  invoice: Invoice;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  monthInvoices: Invoice[];
  existingFiling?: GstFiling;
}): Promise<void> {
  if (demoModeEnabled) {
    demoCollectPayment({
      invoice: params.invoice,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      referenceNo: sanitizeStr(params.referenceNo, BLUEPRINT_LIMITS.MAX_REF_NO_LEN),
    });
    return;
  }
  const path = `invoices/${params.invoice.id}`;
  try {
    const payAmount = round2(Math.min(params.invoice.remainingAmount, Math.max(0.01, params.amount)));
    const isSettlingFull = payAmount >= params.invoice.remainingAmount - 0.01;
    const nextPaid = isSettlingFull
      ? params.invoice.grandTotal
      : round2(Math.min(params.invoice.grandTotal, params.invoice.paidAmount + payAmount));
    const nextRemaining = isSettlingFull
      ? 0
      : round2(Math.max(0, params.invoice.grandTotal - nextPaid));
    const nextStatus = nextRemaining <= 0.01 ? 'paid' : 'partial';
    const finalPaid = nextStatus === 'paid' ? params.invoice.grandTotal : nextPaid;
    const finalRemaining = nextStatus === 'paid' ? 0 : nextRemaining;

    const batch = writeBatch(db);
    const payRef = doc(collection(db, 'payments'));

    batch.set(payRef, {
      ownerId: params.ownerId,
      invoiceId: params.invoice.id,
      invoiceNumber: params.invoice.invoiceNumber,
      customerId: params.invoice.customerId,
      customerName: params.invoice.customerName,
      amount: payAmount,
      paymentMethod: params.paymentMethod,
      referenceNo: sanitizeStr(
        params.referenceNo || `BAL-${Date.now().toString().slice(-6)}`,
        BLUEPRINT_LIMITS.MAX_REF_NO_LEN
      ),
      billingMonth: params.invoice.billingMonth,
      createdAt: serverTimestamp(),
    });

    batch.update(doc(db, 'invoices', params.invoice.id), {
      paidAmount: finalPaid,
      remainingAmount: finalRemaining,
      paymentStatus: nextStatus,
      updatedAt: serverTimestamp(),
    });

    // Update monthly GST filing realization metrics automatically
    if (params.existingFiling && params.existingFiling.filingStatus !== 'paid') {
      const updatedMonthInvoices = params.monthInvoices.map((inv) =>
        inv.id === params.invoice.id
          ? {
              ...inv,
              paidAmount: finalPaid,
              remainingAmount: finalRemaining,
              paymentStatus: nextStatus as Invoice['paymentStatus'],
            }
          : inv
      );
      const metrics = calculateMonthGstMetrics(updatedMonthInvoices);
      batch.update(doc(db, 'gstFilings', params.existingFiling.id), {
        ...metrics,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncMonthlyGstFiling(
  ownerId: string,
  billingMonth: string,
  monthInvoices: Invoice[],
  existingFiling?: GstFiling
): Promise<void> {
  if (demoModeEnabled) {
    demoSyncGst(billingMonth);
    return;
  }
  const filingId = `${ownerId}_${billingMonth}`;
  const path = `gstFilings/${filingId}`;
  try {
    if (existingFiling?.filingStatus === 'paid') return;
    const metrics = calculateMonthGstMetrics(monthInvoices);
    const ref = doc(db, 'gstFilings', filingId);

    if (!existingFiling) {
      await setDoc(ref, {
        ownerId,
        billingMonth,
        ...metrics,
        challanNumber: '',
        filingStatus: 'generated',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        ...metrics,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function payMonthlyGstChallan(
  filingId: string,
  challanNumber: string
): Promise<void> {
  if (demoModeEnabled) {
    demoPayGst(filingId, sanitizeStr(challanNumber, BLUEPRINT_LIMITS.MAX_CHALLAN_LEN));
    return;
  }
  const path = `gstFilings/${filingId}`;
  try {
    await updateDoc(doc(db, 'gstFilings', filingId), {
      challanNumber: sanitizeStr(challanNumber, BLUEPRINT_LIMITS.MAX_CHALLAN_LEN),
      filingStatus: 'paid',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function seedSampleWorkspaceData(
  ownerId: string,
  sellerStateCode: string
): Promise<void> {
  if (demoModeEnabled) {
    resetDemoStore();
    return;
  }
  const batch = writeBatch(db);
  const currentMonth = getCurrentMonth();
  const prevMonth = getPreviousMonth(currentMonth);

  // 1. Seed 6 Supermarket Shelf & Warehouse Stock Items (Sold Out + Upgoing)
  const stackDefs: Array<Omit<StackItem, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>> = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
  ];

  const stackRefs = stackDefs.map((s) => {
    const ref = doc(collection(db, 'stacks'));
    batch.set(ref, {
      ...s,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, ...s };
  });

  // 2. Seed 4 Supermarket Credit / Bulk Customers
  const custDefs: Array<Omit<Customer, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>> = [
    {
      name: 'Ramesh Kulkarni',
      companyName: 'Kulkarni Catering & Mess',
      gstin: '27AAECK8921K1Z8',
      phone: '+91 98204 51209',
      email: 'accounts@kulkarnicatering.in',
      stateCode: sellerStateCode,
      address: 'Shop 8, Station Road Market, Mumbai 400028',
    },
    {
      name: 'Priya Nair',
      companyName: 'GreenLeaf Hostel & Pantry',
      gstin: '29AABCG4410R1Z2',
      phone: '+91 98450 77312',
      email: 'billing@greenleafhostel.com',
      stateCode: sellerStateCode === '29-Karnataka' ? '27-Maharashtra' : '29-Karnataka',
      address: '42 Indiranagar 2nd Stage, Bengaluru 560038',
    },
    {
      name: 'Suresh Agarwal',
      companyName: 'Agarwal Provision & Bakery',
      gstin: '07AAACA7721B1Z4',
      phone: '+91 98112 33940',
      email: 'suresh@agarwalbakery.in',
      stateCode: sellerStateCode === '07-Delhi' ? '27-Maharashtra' : '07-Delhi',
      address: 'B-14 Lajpat Nagar Market, New Delhi 110024',
    },
    {
      name: 'Neha Verma',
      companyName: 'Loyalty Member · Household',
      gstin: '',
      phone: '+91 97654 11890',
      email: 'neha.verma@example.in',
      stateCode: sellerStateCode,
      address: 'Flat 302, Silver Oak Apartments, Pune 411001',
    },
  ];

  const custRefs = custDefs.map((c) => {
    const ref = doc(collection(db, 'customers'));
    batch.set(ref, {
      ...c,
      ownerId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return { id: ref.id, ...c };
  });

  // 3. Seed Supermarket Bills (3 with initial paid & unpaid remaining balances + 1 paid in full)
  const buildLine = (stack: (typeof stackRefs)[number], qty: number): InvoiceLineItem => {
    const taxableValue = round2(stack.unitPrice * qty);
    const gstAmount = round2((taxableValue * stack.gstRate) / 100);
    return {
      stackId: stack.id,
      sku: stack.sku,
      name: stack.name,
      hsnCode: stack.hsnCode,
      unit: stack.unit,
      qty,
      unitPrice: stack.unitPrice,
      gstRate: stack.gstRate,
      taxableValue,
      gstAmount,
      lineTotal: round2(taxableValue + gstAmount),
    };
  };

  const invoiceSeeds = [
    {
      invoiceNumber: 'POS-2026-4081',
      billingMonth: prevMonth,
      customer: custRefs[0],
      items: [buildLine(stackRefs[0], 18), buildLine(stackRefs[2], 6)],
      initialPaid: 8000,
      dueDate: '2026-10-28',
      notes: 'Monthly grocery ration dispatch; initial counter payment received, balance on credit.',
      method: 'UPI' as PaymentMethod,
    },
    {
      invoiceNumber: 'POS-2026-4082',
      billingMonth: currentMonth,
      customer: custRefs[1],
      items: [buildLine(stackRefs[1], 35), buildLine(stackRefs[3], 12)],
      initialPaid: 4000,
      dueDate: getDefaultDueDate(-2),
      notes: 'Hostel dairy & snack supply; part payment settled via NEFT.',
      method: 'NEFT' as PaymentMethod,
    },
    {
      invoiceNumber: 'POS-2026-4083',
      billingMonth: currentMonth,
      customer: custRefs[2],
      items: [buildLine(stackRefs[4], 14), buildLine(stackRefs[5], 8)],
      initialPaid: 5000,
      dueDate: getDefaultDueDate(7),
      notes: 'Initial advance received at billing counter; remaining balance due in 7 days.',
      method: 'UPI' as PaymentMethod,
    },
    {
      invoiceNumber: 'POS-2026-4084',
      billingMonth: currentMonth,
      customer: custRefs[3],
      items: [buildLine(stackRefs[2], 2), buildLine(stackRefs[4], 3), buildLine(stackRefs[5], 2)],
      initialPaid: 4024.1, // Paid in full at counter
      dueDate: getDefaultDueDate(0),
      notes: 'Paid in full at supermarket POS counter.',
      method: 'Cash' as PaymentMethod,
    },
  ];

  const createdInvoices: Invoice[] = [];

  for (const seed of invoiceSeeds) {
    const invRef = doc(collection(db, 'invoices'));
    const isInterState = seed.customer.stateCode !== sellerStateCode;
    const totals = computeInvoiceTotals(seed.items, isInterState, seed.initialPaid);
    const itemsSummary = sanitizeStr(
      seed.items.map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', '),
      BLUEPRINT_LIMITS.MAX_ITEMS_SUMMARY_LEN
    );

    const payload = {
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
      itemsSummary,
      lineItems: seed.items,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      totalGstAmount: totals.totalGstAmount,
      grandTotal: totals.grandTotal,
      initialPaidAmount: totals.initialPaidAmount,
      paidAmount: totals.paidAmount,
      remainingAmount: totals.remainingAmount,
      paymentStatus: totals.paymentStatus,
      dueDate: seed.dueDate,
      notes: seed.notes,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    batch.set(invRef, payload);
    const { createdAt: _c, updatedAt: _u, ...payloadWithoutTimestamps } = payload;
    createdInvoices.push({ id: invRef.id, ...payloadWithoutTimestamps });

    if (totals.initialPaidAmount > 0) {
      const payRef = doc(collection(db, 'payments'));
      batch.set(payRef, {
        ownerId,
        invoiceId: invRef.id,
        invoiceNumber: seed.invoiceNumber,
        customerId: seed.customer.id,
        customerName: seed.customer.name,
        amount: totals.initialPaidAmount,
        paymentMethod: seed.method,
        referenceNo: `INIT-${seed.invoiceNumber}`,
        billingMonth: seed.billingMonth,
        createdAt: serverTimestamp(),
      });
    }
  }

  // 4. Create automated monthly GST filings for prevMonth and currentMonth
  for (const month of [prevMonth, currentMonth]) {
    const monthInvs = createdInvoices.filter((i) => i.billingMonth === month);
    const metrics = calculateMonthGstMetrics(monthInvs);
    const filingRef = doc(db, 'gstFilings', `${ownerId}_${month}`);
    batch.set(filingRef, {
      ownerId,
      billingMonth: month,
      ...metrics,
      challanNumber: '',
      filingStatus: 'generated',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sample_workspace_seed');
  }
}
