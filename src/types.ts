import type { Timestamp } from 'firebase/firestore';

export type AppPage = 'dashboard' | 'inventory' | 'receivables' | 'gst-billing' | 'settings';

export type StackStatus = 'upgoing' | 'in_stock' | 'sold_out';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';
export type PaymentMethod = 'UPI' | 'NEFT' | 'RTGS' | 'Cheque' | 'Cash';
export type GstFilingStatus = 'generated' | 'paid';

export const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]+$/,
  MONTH_PATTERN: /^\d{4}-\d{2}$/,
  DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
  MAX_ID_LEN: 128,
  MAX_EMAIL_LEN: 200,
  MAX_DISPLAY_NAME_LEN: 100,
  MAX_BUSINESS_NAME_LEN: 140,
  MAX_GSTIN_LEN: 20,
  MAX_STATE_LEN: 60,
  MAX_DISTRICT_LEN: 80,
  MAX_ADDRESS_LEN: 300,
  MAX_SKU_LEN: 40,
  MAX_STACK_NAME_LEN: 140,
  MAX_HSN_LEN: 20,
  MAX_CATEGORY_LEN: 60,
  MAX_UNIT_LEN: 20,
  MAX_CUSTOMER_NAME_LEN: 120,
  MAX_PHONE_LEN: 24,
  MAX_INVOICE_NO_LEN: 40,
  MAX_ITEMS_SUMMARY_LEN: 250,
  MAX_NOTES_LEN: 400,
  MAX_REF_NO_LEN: 80,
  MAX_CHALLAN_LEN: 60,
  MAX_LINE_ITEMS: 20,
} as const;

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  businessName: string;
  gstin: string;
  stateCode: string;
  district?: string;
  address: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface StackItem {
  id: string;
  ownerId: string;
  sku: string;
  name: string;
  hsnCode: string;
  category: string;
  unit: string;
  unitPrice: number;
  gstRate: 0 | 5 | 12 | 18 | 28;
  availableQty: number;
  upgoingQty: number;
  soldQty: number;
  reorderLevel: number;
  stackStatus: StackStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface Customer {
  id: string;
  ownerId: string;
  name: string;
  companyName: string;
  gstin: string;
  phone: string;
  email: string;
  stateCode: string;
  address: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface InvoiceLineItem {
  stackId: string;
  sku: string;
  name: string;
  hsnCode: string;
  unit: string;
  qty: number;
  unitPrice: number;
  gstRate: number;
  taxableValue: number;
  gstAmount: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  ownerId: string;
  invoiceNumber: string;
  billingMonth: string;
  customerId: string;
  customerName: string;
  customerCompany: string;
  customerGstin: string;
  customerPhone: string;
  customerState: string;
  isInterState: boolean;
  itemsSummary: string;
  lineItems: InvoiceLineItem[];
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalGstAmount: number;
  grandTotal: number;
  initialPaidAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  dueDate: string;
  notes: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export interface PaymentRecord {
  id: string;
  ownerId: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  referenceNo: string;
  billingMonth: string;
  createdAt?: Timestamp;
}

export interface GstFiling {
  id: string;
  ownerId: string;
  billingMonth: string;
  totalInvoices: number;
  totalTaxableValue: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  totalGstLiability: number;
  gstCollected: number;
  gstPending: number;
  challanNumber: string;
  filingStatus: GstFilingStatus;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
