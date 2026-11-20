import { Check, CheckCircle2, Circle, KeyRound } from 'lucide-react';
import { useState } from 'react';
import {
  type AdminCredentials,
  getAdminCredentials,
  updateAdminCredentials,
  validateAdminPassword,
} from '../services/adminAuth';
import { updateUserProfile } from '../services/billingService';
import type { UserProfile } from '../types';
import { getDefaultDistrictForState, getDistrictsForState, INDIAN_STATES } from '../utils/format';

interface SettingsViewProps {
  profile: UserProfile;
  isAdminSession?: boolean;
  onAdminCredentialsUpdated?: (creds: AdminCredentials) => void;
}

export function SettingsView({
  profile,
  isAdminSession,
  onAdminCredentialsUpdated,
}: SettingsViewProps) {
  const [form, setForm] = useState({
    displayName: profile.displayName,
    businessName: profile.businessName,
    gstin: profile.gstin,
    stateCode: profile.stateCode,
    district: profile.district || getDefaultDistrictForState(profile.stateCode),
    address: profile.address,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const stateDistricts = getDistrictsForState(form.stateCode);
  const districtOptions =
    form.district && !stateDistricts.includes(form.district)
      ? [form.district, ...stateDistricts]
      : stateDistricts;
  const stateOptions =
    form.stateCode && !(INDIAN_STATES as readonly string[]).includes(form.stateCode)
      ? [form.stateCode, ...INDIAN_STATES]
      : INDIAN_STATES;

  const initialCreds = getAdminCredentials();
  const [adminForm, setAdminForm] = useState({
    userId: initialCreds.userId,
    phone: initialCreds.phone,
    password: initialCreds.password,
  });
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSaved, setAdminSaved] = useState(false);

  const passwordCheck = validateAdminPassword(adminForm.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await updateUserProfile(profile.uid, form);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const handleAdminCredsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError(null);
    setAdminSaved(false);

    const res = updateAdminCredentials({
      userId: adminForm.userId,
      phone: adminForm.phone,
      password: adminForm.password,
      displayName: form.displayName,
    });

    if (!res.ok || !res.creds) {
      setAdminError(res.error || 'Unable to update admin credentials.');
      return;
    }

    setAdminSaved(true);
    onAdminCredentialsUpdated?.(res.creds);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-xl font-display font-semibold text-neutral-900">
          Supermarket Store & GST Registration Settings
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Store details printed on POS Tax Invoices and used for intra-state vs inter-state GST calculations
        </p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4">
        {saved && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Business GST profile updated.</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Account Owner</label>
            <input
              type="text"
              required
              maxLength={100}
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Registered Email</label>
            <input
              type="text"
              disabled
              value={profile.email}
              className="w-full px-3 py-2 text-sm bg-neutral-100 text-neutral-500 border border-neutral-200 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Legal Business Name</label>
            <input
              type="text"
              required
              maxLength={140}
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Merchant GSTIN</label>
            <input
              type="text"
              maxLength={20}
              value={form.gstin}
              onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Home State (Place of Origin)</label>
            <select
              value={form.stateCode}
              onChange={(e) => {
                const nextState = e.target.value;
                const nextDistricts = getDistrictsForState(nextState);
                setForm((prev) => ({
                  ...prev,
                  stateCode: nextState,
                  district: nextDistricts.includes(prev.district)
                    ? prev.district
                    : getDefaultDistrictForState(nextState),
                }));
              }}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
            >
              {stateOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Home District</label>
            <select
              value={form.district}
              onChange={(e) => setForm({ ...form, district: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
            >
              {districtOptions.map((dist) => (
                <option key={dist} value={dist}>
                  {dist}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Registered Address</label>
          <textarea
            rows={2}
            maxLength={300}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
          />
        </div>

        <div className="pt-3 border-t border-neutral-200 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 cursor-pointer"
          >
            {saving ? 'Saving...' : 'Save Business Settings'}
          </button>
        </div>
      </form>

      {isAdminSession && (
        <form
          onSubmit={handleAdminCredsSubmit}
          className="bg-white border border-neutral-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-display font-semibold text-neutral-900">
                Admin Login Credentials
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                Update the User ID, Phone Number, or Password used on the admin login screen
              </p>
            </div>
            <KeyRound className="w-4 h-4 text-red-700 shrink-0 mt-1" />
          </div>

          {adminError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {adminError}
            </div>
          )}

          {adminSaved && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Admin login credentials updated.</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Admin User ID</label>
              <input
                type="text"
                required
                value={adminForm.userId}
                onChange={(e) => setAdminForm({ ...adminForm, userId: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">Admin Phone Number</label>
              <input
                type="tel"
                required
                value={adminForm.phone}
                onChange={(e) => setAdminForm({ ...adminForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Admin Password</label>
            <input
              type="text"
              required
              value={adminForm.password}
              onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
              className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
            />
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 text-[11px]">
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

          <div className="pt-3 border-t border-neutral-200 flex justify-end">
            <button
              type="submit"
              className="px-5 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 cursor-pointer"
            >
              Update Admin Credentials
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
