import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  Circle,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  UserCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  type AdminSession,
  getAdminCredentials,
  saveAdminSession,
  validateAdminPassword,
  verifyAdminLogin,
} from '../services/adminAuth';
import { getStoredStoreProfile } from '../services/demoStore';

interface LoginScreenProps {
  onAdminLogin: (session: AdminSession) => void;
}

interface FloatingAlert {
  id: number;
  title: string;
  detail?: string;
}

export function LoginScreen({ onAdminLogin }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [floatingAlert, setFloatingAlert] = useState<FloatingAlert | null>(null);

  const passwordCheck = validateAdminPassword(password);
  const defaultCreds = getAdminCredentials();
  const storeProfile = getStoredStoreProfile();

  useEffect(() => {
    if (!floatingAlert) return;
    const timer = window.setTimeout(() => {
      setFloatingAlert(null);
    }, 5500);
    return () => window.clearTimeout(timer);
  }, [floatingAlert]);

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const result = verifyAdminLogin(loginId, password);
    if (!result.ok) {
      setFloatingAlert({
        id: Date.now(),
        title: 'The password and the user ID is incorrect.',
        detail: result.policyFailed
          ? 'Password must contain at least 8 characters, 1 number, and 1 symbol.'
          : 'Check your phone number / user ID and password, then try again.',
      });
      return;
    }

    setFloatingAlert(null);
    saveAdminSession(result.session);
    onAdminLogin(result.session);
  };

  const handleFillDefaultCreds = () => {
    setLoginId(defaultCreds.userId);
    setPassword(defaultCreds.password);
    setFloatingAlert(null);
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-6 relative">
      {floatingAlert && (
        <div
          key={floatingAlert.id}
          role="alert"
          aria-live="assertive"
          className="fixed top-5 right-5 z-50 max-w-sm w-[calc(100%-2.5rem)] bg-neutral-900 text-white rounded-xl shadow-lg border-2 border-red-600 px-4 py-3.5 flex items-start gap-3 transition-transform duration-200"
        >
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold leading-snug">{floatingAlert.title}</div>
            {floatingAlert.detail && (
              <p className="text-xs text-neutral-300 mt-1 leading-relaxed">{floatingAlert.detail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFloatingAlert(null)}
            aria-label="Dismiss alert"
            className="text-neutral-300 hover:text-white p-0.5 rounded cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Company Details */}
        <section className="lg:col-span-6 bg-white border border-neutral-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-neutral-200">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-6 rounded-xs bg-red-700 shrink-0" aria-hidden="true" />
                <span className="text-xs font-semibold uppercase tracking-wider text-red-700">
                  Company Details
                </span>
              </div>
              <h1 className="mt-2.5 text-2xl sm:text-3xl font-display font-bold tracking-tight text-neutral-900 [text-wrap:balance]">
                {storeProfile.businessName || 'ArthaMart Supermarket & Groceries'}
              </h1>
              <p className="mt-1 text-sm text-neutral-600">
                Owner: <span className="font-medium text-neutral-900">{storeProfile.displayName}</span>
              </p>
            </div>
            <Building2 className="w-6 h-6 text-red-700 shrink-0 mt-1" />
          </div>

          <dl className="space-y-4 text-sm">
            <div className="flex items-start justify-between gap-4 pb-3.5 border-b border-neutral-100">
              <dt className="text-xs font-medium text-neutral-500 shrink-0">GSTIN</dt>
              <dd className="font-mono font-semibold text-neutral-900 text-right tabular-nums">
                {storeProfile.gstin || '—'}
              </dd>
            </div>

            <div className="flex items-start justify-between gap-4 pb-3.5 border-b border-neutral-100">
              <dt className="text-xs font-medium text-neutral-500 shrink-0">State &amp; District</dt>
              <dd className="text-neutral-900 font-medium text-right">
                {storeProfile.stateCode || '—'}
                {storeProfile.district ? ` · ${storeProfile.district}` : ''}
              </dd>
            </div>

            <div className="flex items-start gap-3 pb-3.5 border-b border-neutral-100">
              <MapPin className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <dt className="text-xs font-medium text-neutral-500">Registered Address</dt>
                <dd className="mt-0.5 text-sm text-neutral-800 leading-relaxed">
                  {storeProfile.address || '—'}
                </dd>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0.5">
              <div className="flex items-start gap-2.5">
                <Phone className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-neutral-500">Contact Phone</dt>
                  <dd className="mt-0.5 font-mono text-sm text-neutral-900 tabular-nums">
                    {defaultCreds.phone}
                  </dd>
                </div>
              </div>
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-neutral-500">Email</dt>
                  <dd className="mt-0.5 text-sm text-neutral-900 truncate">
                    {storeProfile.email || '—'}
                  </dd>
                </div>
              </div>
            </div>
          </dl>
        </section>

        {/* Admin Login */}
        <section className="lg:col-span-6">
          <div className="bg-white border border-neutral-200 rounded-xl p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-display font-semibold text-neutral-900">
                  Admin Login
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Enter your Admin Phone Number or User ID and password.
                </p>
              </div>
              <KeyRound className="w-5 h-5 text-red-700 shrink-0" />
            </div>

            <form onSubmit={handleAdminSubmit} noValidate className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="admin-login-id"
                  className="block text-xs font-medium text-neutral-700 mb-1.5"
                >
                  Login ID (Phone Number or User ID)
                </label>
                <div className="relative">
                  <UserCheck className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="admin-login-id"
                    type="text"
                    autoComplete="username"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g. admin or 9876543210"
                    className="w-full pl-9 pr-3.5 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/15"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="admin-password"
                  className="block text-xs font-medium text-neutral-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimum 8 chars, 1 number & 1 symbol"
                    className="w-full pl-3.5 pr-11 py-2.5 text-sm text-neutral-900 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700 focus:ring-2 focus:ring-red-700/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCheck.hasMinLength ? 'text-emerald-700 font-medium' : 'text-neutral-500'
                    }`}
                  >
                    {passwordCheck.hasMinLength ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 shrink-0 text-neutral-300" />
                    )}
                    <span>8+ characters</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCheck.hasNumber ? 'text-emerald-700 font-medium' : 'text-neutral-500'
                    }`}
                  >
                    {passwordCheck.hasNumber ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 shrink-0 text-neutral-300" />
                    )}
                    <span>At least 1 number</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordCheck.hasSymbol ? 'text-emerald-700 font-medium' : 'text-neutral-500'
                    }`}
                  >
                    {passwordCheck.hasSymbol ? (
                      <Check className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 shrink-0 text-neutral-300" />
                    )}
                    <span>At least 1 symbol</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 transition-colors cursor-pointer"
              >
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-4 pt-4 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="text-neutral-600 leading-relaxed">
                <span className="font-medium text-neutral-800">Admin Access:</span>{' '}
                <span className="font-mono tabular-nums">{defaultCreds.userId}</span>
                <span className="mx-1.5 text-neutral-400">·</span>
                <span className="font-mono tabular-nums">{defaultCreds.phone}</span>
                <span className="mx-1.5 text-neutral-400">·</span>
                <span className="font-mono">{defaultCreds.password}</span>
              </div>
              <button
                type="button"
                onClick={handleFillDefaultCreds}
                className="text-xs font-semibold text-red-700 hover:text-red-900 hover:underline whitespace-nowrap shrink-0 cursor-pointer text-left"
              >
                Auto-fill
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
