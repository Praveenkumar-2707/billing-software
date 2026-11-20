export interface AdminCredentials {
  userId: string;
  phone: string;
  password: string;
  displayName: string;
}

export interface AdminSession {
  userId: string;
  phone: string;
  displayName: string;
  loggedInAt: number;
}

export interface PasswordValidation {
  hasMinLength: boolean;
  hasNumber: boolean;
  hasSymbol: boolean;
  isValid: boolean;
}

const CREDS_STORAGE_KEY = 'arthamart_admin_creds_v1';
const SESSION_STORAGE_KEY = 'arthamart_admin_session_v1';

const DEFAULT_ADMIN_CREDS: AdminCredentials = {
  userId: 'admin',
  phone: '9876543210',
  password: 'Admin@123',
  displayName: 'Store Admin',
};

export function normalizePhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
}

export function validateAdminPassword(password: string): PasswordValidation {
  const hasMinLength = password.length >= 8;
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);
  return {
    hasMinLength,
    hasNumber,
    hasSymbol,
    isValid: hasMinLength && hasNumber && hasSymbol,
  };
}

export function getAdminCredentials(): AdminCredentials {
  if (typeof window === 'undefined') return DEFAULT_ADMIN_CREDS;
  try {
    const raw = window.localStorage.getItem(CREDS_STORAGE_KEY);
    if (!raw) return DEFAULT_ADMIN_CREDS;
    const parsed = JSON.parse(raw) as Partial<AdminCredentials>;
    if (
      typeof parsed.userId === 'string' &&
      typeof parsed.phone === 'string' &&
      typeof parsed.password === 'string' &&
      validateAdminPassword(parsed.password).isValid
    ) {
      return {
        userId: parsed.userId.trim() || DEFAULT_ADMIN_CREDS.userId,
        phone: normalizePhoneDigits(parsed.phone) || DEFAULT_ADMIN_CREDS.phone,
        password: parsed.password,
        displayName: parsed.displayName?.trim() || DEFAULT_ADMIN_CREDS.displayName,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_ADMIN_CREDS;
}

export function updateAdminCredentials(next: {
  userId: string;
  phone: string;
  password: string;
  displayName?: string;
}): { ok: boolean; error?: string; creds?: AdminCredentials } {
  const cleanUserId = next.userId.trim();
  const cleanPhone = normalizePhoneDigits(next.phone);
  if (cleanUserId.length < 3) {
    return { ok: false, error: 'Admin User ID must be at least 3 characters.' };
  }
  if (cleanPhone.length < 10) {
    return { ok: false, error: 'Admin Phone Number must have at least 10 digits.' };
  }
  const policy = validateAdminPassword(next.password);
  if (!policy.isValid) {
    return {
      ok: false,
      error: 'Password must contain at least 8 characters, 1 number, and 1 symbol.',
    };
  }

  const updated: AdminCredentials = {
    userId: cleanUserId,
    phone: cleanPhone,
    password: next.password,
    displayName: next.displayName?.trim() || 'Store Admin',
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CREDS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore storage errors
    }
  }

  const currentSession = getAdminSession();
  if (currentSession) {
    saveAdminSession({
      userId: updated.userId,
      phone: updated.phone,
      displayName: updated.displayName,
      loggedInAt: currentSession.loggedInAt,
    });
  }

  return { ok: true, creds: updated };
}

export function verifyAdminLogin(
  loginId: string,
  password: string
): { ok: true; session: AdminSession } | { ok: false; message: string; policyFailed: boolean } {
  const trimmedId = loginId.trim();
  const creds = getAdminCredentials();
  const policy = validateAdminPassword(password);

  if (!trimmedId) {
    return {
      ok: false,
      policyFailed: !policy.isValid,
      message: 'The password and the user ID is incorrect.',
    };
  }

  const normalizedInputPhone = normalizePhoneDigits(trimmedId);
  const normalizedStoredPhone = normalizePhoneDigits(creds.phone);

  const matchesUserId = trimmedId.toLowerCase() === creds.userId.toLowerCase();
  const matchesPhone =
    normalizedInputPhone.length >= 10 && normalizedInputPhone === normalizedStoredPhone;

  if (!policy.isValid) {
    return {
      ok: false,
      policyFailed: true,
      message: 'The password and the user ID is incorrect.',
    };
  }

  if ((!matchesUserId && !matchesPhone) || password !== creds.password) {
    return {
      ok: false,
      policyFailed: false,
      message: 'The password and the user ID is incorrect.',
    };
  }

  const session: AdminSession = {
    userId: creds.userId,
    phone: creds.phone,
    displayName: creds.displayName,
    loggedInAt: Date.now(),
  };

  return { ok: true, session };
}

export function saveAdminSession(session: AdminSession): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore storage errors
  }
}

export function getAdminSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    if (typeof parsed.userId === 'string' && typeof parsed.phone === 'string') {
      return {
        userId: parsed.userId,
        phone: parsed.phone,
        displayName: parsed.displayName || 'Store Admin',
        loggedInAt: parsed.loggedInAt || Date.now(),
      };
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

export function clearAdminSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
