import { UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { addCustomer } from '../services/billingService';
import { BLUEPRINT_LIMITS, type Customer, type UserProfile } from '../types';
import { INDIAN_STATES } from '../utils/format';

interface CreateCustomerModalProps {
  ownerId: string;
  profile: UserProfile | null;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
}

export function CreateCustomerModal({
  ownerId,
  profile,
  onClose,
  onCreated,
}: CreateCustomerModalProps) {
  const defaultState = profile?.stateCode || '27-Maharashtra';

  const [form, setForm] = useState({
    name: '',
    phone: '',
    companyName: '',
    gstin: '',
    email: '',
    stateCode: defaultState,
    address: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Customer name is required.');
      return;
    }
    if (!form.phone.trim()) {
      setError('Customer phone number is required.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await addCustomer(ownerId, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        companyName: form.companyName.trim(),
        gstin: form.gstin.trim().toUpperCase(),
        email: form.email.trim(),
        stateCode: form.stateCode,
        address: form.address.trim(),
      });
      onCreated?.(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add customer.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/40 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-lg overflow-hidden my-6">
        <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-red-700" />
            <h2 className="text-base font-display font-semibold text-neutral-900">
              Add New Customer
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add customer modal"
            className="text-neutral-400 hover:text-neutral-700 cursor-pointer p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Customer Full Name *
              </label>
              <input
                type="text"
                required
                maxLength={BLUEPRINT_LIMITS.MAX_CUSTOMER_NAME_LEN}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Rajesh Sharma"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Phone Number *
              </label>
              <input
                type="tel"
                required
                maxLength={BLUEPRINT_LIMITS.MAX_PHONE_LEN}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. +91 98201 44510"
                className="w-full px-3 py-2 text-sm font-mono tabular-nums border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Company / Account Label
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.MAX_BUSINESS_NAME_LEN}
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g. Sharma Superstore or Household"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Customer GSTIN (Optional)
              </label>
              <input
                type="text"
                maxLength={BLUEPRINT_LIMITS.MAX_GSTIN_LEN}
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                placeholder="e.g. 27AABCS1234F1Z5"
                className="w-full px-3 py-2 text-sm font-mono uppercase border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                Email (Optional)
              </label>
              <input
                type="email"
                maxLength={BLUEPRINT_LIMITS.MAX_EMAIL_LEN}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="customer@example.com"
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 mb-1">
                State (Place of Supply) *
              </label>
              <select
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg bg-white focus:outline-none focus:border-red-700"
              >
                {INDIAN_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Billing Address (Optional)
            </label>
            <textarea
              rows={2}
              maxLength={BLUEPRINT_LIMITS.MAX_ADDRESS_LEN}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Shop / Flat number, street, city, PIN"
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
              disabled={submitting}
              className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{submitting ? 'Saving Customer...' : 'Create Customer'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
