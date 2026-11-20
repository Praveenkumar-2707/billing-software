import type { InvoiceLineItem, PaymentStatus } from '../types';

export {
  DISTRICTS_BY_STATE,
  getDefaultDistrictForState,
  getDistrictsForState,
  INDIAN_STATES,
} from './indiaLocations';

export function formatINR(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('en-IN').format(safe);
}

export function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function getPreviousMonth(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-');
  let y = Number(yStr);
  let m = Number(mStr) - 1;
  if (m < 1) {
    m = 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, '0')}`;
}

export function formatMonthLabel(yyyyMm: string): string {
  const [yStr, mStr] = yyyyMm.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return yyyyMm;
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getDefaultDueDate(daysAhead = 15): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getTodayIsoDate(): string {
  return getDefaultDueDate(0);
}

export function round2(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

export function computeInvoiceTotals(
  items: InvoiceLineItem[],
  isInterState: boolean,
  initialPaidRaw: number
): {
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
} {
  const taxableAmount = round2(items.reduce((sum, item) => sum + item.taxableValue, 0));
  const totalGstAmount = round2(items.reduce((sum, item) => sum + item.gstAmount, 0));
  const cgstAmount = isInterState ? 0 : round2(totalGstAmount / 2);
  const sgstAmount = isInterState ? 0 : round2(totalGstAmount - cgstAmount);
  const igstAmount = isInterState ? totalGstAmount : 0;
  const grandTotal = round2(taxableAmount + totalGstAmount);

  const clampedInitial = round2(Math.max(0, Math.min(grandTotal, initialPaidRaw)));
  const remainingAmount = round2(Math.max(0, grandTotal - clampedInitial));

  let paymentStatus: PaymentStatus = 'unpaid';
  if (remainingAmount <= 0.01 && grandTotal > 0) {
    paymentStatus = 'paid';
  } else if (clampedInitial > 0) {
    paymentStatus = 'partial';
  }

  return {
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalGstAmount,
    grandTotal,
    initialPaidAmount: clampedInitial,
    paidAmount: clampedInitial,
    remainingAmount: paymentStatus === 'paid' ? 0 : remainingAmount,
    paymentStatus,
  };
}

export function sanitizeStr(val: string, maxLen: number): string {
  return val.trim().slice(0, maxLen);
}

export function isOverdue(dueDate: string, status: PaymentStatus): boolean {
  if (status === 'paid') return false;
  return dueDate < getTodayIsoDate();
}

export function toMillisSafe(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const rec = ts as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
    };
    if (typeof rec.toMillis === 'function') {
      return rec.toMillis();
    }
    const sec = typeof rec.seconds === 'number' ? rec.seconds : rec._seconds;
    const ns = typeof rec.nanoseconds === 'number' ? rec.nanoseconds : rec._nanoseconds || 0;
    if (typeof sec === 'number') {
      return sec * 1000 + Math.floor(ns / 1_000_000);
    }
  }
  return 0;
}

export function toDateSafe(ts: unknown): Date | null {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  if (typeof ts === 'object' && typeof (ts as { toDate?: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate();
  }
  const ms = toMillisSafe(ts);
  return ms > 0 ? new Date(ms) : null;
}
