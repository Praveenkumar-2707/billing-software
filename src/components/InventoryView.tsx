import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { addStackItem, deleteStackItem, updateStackItem } from '../services/billingService';
import type { StackItem } from '../types';
import { formatINR, formatNumber } from '../utils/format';

interface InventoryViewProps {
  ownerId: string;
  stacks: StackItem[];
  onOpenNewInvoice: (preselectedStackId?: string) => void;
}

type StackFilter = 'all' | 'sold_out' | 'upgoing' | 'in_stock';

const SUPERMARKET_CATEGORIES = [
  'Groceries & Staples',
  'Dairy & Chilled',
  'Oils & Pantry',
  'Snacks & Bakery',
  'Beverages',
  'Home & Hygiene',
  'Personal Care',
  'Fresh Produce',
];

const EMPTY_FORM = {
  sku: '',
  name: '',
  hsnCode: '',
  category: 'Groceries & Staples',
  unit: 'Packs',
  unitPrice: 0,
  gstRate: 5 as 0 | 5 | 12 | 18 | 28,
  availableQty: 0,
  upgoingQty: 0,
  soldQty: 0,
  reorderLevel: 15,
};

export function InventoryView({ ownerId, stacks, onOpenNewInvoice }: InventoryViewProps) {
  const [filter, setFilter] = useState<StackFilter>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StackItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredGraphId, setHoveredGraphId] = useState<string | null>(null);

  const filtered = stacks.filter((item) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'sold_out' && (item.availableQty <= 0 || item.stackStatus === 'sold_out')) ||
      (filter === 'upgoing' && item.availableQty > 0 && item.stackStatus === 'upgoing') ||
      (filter === 'in_stock' && item.availableQty > 0 && item.stackStatus === 'in_stock');

    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.hsnCode.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q);

    return matchesFilter && matchesSearch;
  });

  const openAddModal = () => {
    setEditingItem(null);
    setForm({
      ...EMPTY_FORM,
      sku: `SM-${String(stacks.length + 101)}`,
    });
    setError(null);
    setModalOpen(true);
  };

  const openEditModal = (item: StackItem) => {
    setEditingItem(item);
    setForm({
      sku: item.sku,
      name: item.name,
      hsnCode: item.hsnCode,
      category: item.category,
      unit: item.unit,
      unitPrice: item.unitPrice,
      gstRate: item.gstRate,
      availableQty: item.availableQty,
      upgoingQty: item.upgoingQty,
      soldQty: item.soldQty,
      reorderLevel: item.reorderLevel,
    });
    setError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.sku.trim() || !form.hsnCode.trim()) {
      setError('SKU, stack name, and HSN code are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingItem) {
        await updateStackItem(editingItem.id, form);
      } else {
        await addStackItem(ownerId, form);
      }
      setModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stack item.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: StackItem) => {
    await deleteStackItem(item.id);
  };

  const soldOutCount = stacks.filter((s) => s.availableQty <= 0 || s.stackStatus === 'sold_out').length;
  const upgoingCount = stacks.filter((s) => s.availableQty > 0 && s.stackStatus === 'upgoing').length;
  const inStockCount = stacks.filter((s) => s.availableQty > 0 && s.stackStatus === 'in_stock').length;

  const totalFilteredRemaining = filtered.reduce((sum, s) => sum + Math.max(0, s.availableQty), 0);
  const totalFilteredSold = filtered.reduce((sum, s) => sum + Math.max(0, s.soldQty), 0);
  const totalFilteredStored = totalFilteredRemaining + totalFilteredSold;
  const maxFilteredStored = Math.max(
    1,
    ...filtered.map((s) => Math.max(0, s.availableQty) + Math.max(0, s.soldQty))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-display font-semibold text-neutral-900">
            Supermarket Shelf & Stock Inventory
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Manage sold-out aisles, incoming upgoing stock, HSN codes, and supermarket GST slabs
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 transition-colors inline-flex items-center gap-2 cursor-pointer whitespace-nowrap self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Add Grocery / Stock Item</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-neutral-100 rounded-lg">
          {(
            [
              { id: 'all', label: `All Stacks (${stacks.length})` },
              { id: 'sold_out', label: `Sold Out (${soldOutCount})` },
              { id: 'upgoing', label: `Upgoing (${upgoingCount})` },
              { id: 'in_stock', label: `In Stock (${inStockCount})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU, stack name, HSN..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-red-700 focus:bg-white"
          />
        </div>
      </div>

      {/* Stack Inventory Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm text-neutral-600">No stack batches match your current filter.</p>
            <button
              type="button"
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 cursor-pointer"
            >
              Add Stack Batch
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/70 text-xs font-medium text-neutral-500">
                  <th className="py-2.5 px-4">SKU & Stack Name</th>
                  <th className="py-2.5 px-4">HSN</th>
                  <th className="py-2.5 px-4 text-right">Unit Price</th>
                  <th className="py-2.5 px-4 text-right">GST</th>
                  <th className="py-2.5 px-4 text-right">Available</th>
                  <th className="py-2.5 px-4 text-right">Upgoing</th>
                  <th className="py-2.5 px-4 text-right">Sold</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 text-sm">
                {filtered.map((item) => {
                  const isSoldOut = item.availableQty <= 0 || item.stackStatus === 'sold_out';
                  const isUpgoing = !isSoldOut && item.stackStatus === 'upgoing';

                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-neutral-900">{item.name}</div>
                        <div className="text-xs text-neutral-500 font-mono">
                          {item.sku} · {item.category} · {item.unit}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-neutral-600">{item.hsnCode}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-900">
                        {formatINR(item.unitPrice)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-600">
                        {item.gstRate}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-neutral-900">
                        {formatNumber(item.availableQty)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                        +{formatNumber(item.upgoingQty)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-neutral-700">
                        {formatNumber(item.soldQty)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold">
                        {isSoldOut ? (
                          <span className="text-red-700">Sold Out</span>
                        ) : isUpgoing ? (
                          <span className="text-neutral-700">Upgoing</span>
                        ) : (
                          <span className="text-neutral-900">In Stock</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-3">
                          {!isSoldOut && (
                            <button
                              type="button"
                              onClick={() => onOpenNewInvoice(item.id)}
                              className="text-xs font-medium text-red-700 hover:underline cursor-pointer"
                            >
                              Bill
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            title="Edit / Restock"
                            className="text-neutral-500 hover:text-neutral-900 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            title="Delete Stack"
                            className="text-neutral-400 hover:text-red-700 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock Graph Under Table: Remaining vs Sold & Total Stored */}
      {filtered.length > 0 && (
        <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-neutral-900">
                Stock Graph: Remaining Inventory vs. Sold &amp; Total Stored
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
                Remaining {formatNumber(totalFilteredRemaining)} · Sold {formatNumber(totalFilteredSold)} · Total Stored{' '}
                {formatNumber(totalFilteredStored)} units across {filtered.length}{' '}
                {filtered.length === 1 ? 'SKU' : 'SKUs'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-neutral-600 inline-block" />
                <span>Remaining in Inventory</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-red-700 inline-block" />
                <span>Stack Sold</span>
              </span>
              <span className="text-neutral-500">Bar length = Total Stored</span>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="hidden sm:flex items-center justify-between text-[11px] font-mono tabular-nums text-neutral-400 border-b border-neutral-100 pb-2">
              <span>0 units</span>
              <span>{formatNumber(Math.round(maxFilteredStored * 0.25))}</span>
              <span>{formatNumber(Math.round(maxFilteredStored * 0.5))}</span>
              <span>{formatNumber(Math.round(maxFilteredStored * 0.75))}</span>
              <span>{formatNumber(maxFilteredStored)} max stored</span>
            </div>

            <div className="space-y-3.5">
              {filtered.map((item) => {
                const remainingQty = Math.max(0, item.availableQty);
                const soldQty = Math.max(0, item.soldQty);
                const totalStoredQty = remainingQty + soldQty;
                const remShare =
                  totalStoredQty > 0 ? Math.round((remainingQty / totalStoredQty) * 100) : 0;
                const soldShare = totalStoredQty > 0 ? 100 - remShare : 0;

                const svgWidth = 600;
                const scaledTotalW =
                  totalStoredQty > 0
                    ? Math.max(12, (totalStoredQty / maxFilteredStored) * svgWidth)
                    : 0;
                const rawRemW =
                  totalStoredQty > 0 ? (remainingQty / totalStoredQty) * scaledTotalW : 0;
                const remW =
                  remainingQty > 0 && soldQty > 0
                    ? Math.max(6, Math.min(scaledTotalW - 6, rawRemW))
                    : rawRemW;
                const soldW = totalStoredQty > 0 ? Math.max(0, scaledTotalW - remW) : 0;
                const isHovered = hoveredGraphId === item.id;

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredGraphId(item.id)}
                    onMouseLeave={() => setHoveredGraphId(null)}
                    className="space-y-1.5"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 text-xs">
                      <div className="min-w-0 flex items-baseline gap-2">
                        <span className="font-medium text-neutral-900 truncate">{item.name}</span>
                        <span className="font-mono text-[11px] text-neutral-400 shrink-0">
                          {item.sku}
                        </span>
                      </div>
                      <div className="font-mono tabular-nums shrink-0 flex flex-wrap items-center gap-2 text-[11px] sm:text-xs">
                        <span
                          className={
                            remainingQty === 0
                              ? 'text-red-700 font-semibold'
                              : 'text-neutral-700 font-medium'
                          }
                        >
                          Remaining {formatNumber(remainingQty)} ({remShare}%)
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span className="text-red-700 font-medium">
                          Sold {formatNumber(soldQty)} ({soldShare}%)
                        </span>
                        <span className="text-neutral-300">·</span>
                        <span className="text-neutral-900 font-semibold">
                          Total Stored {formatNumber(totalStoredQty)} {item.unit}
                        </span>
                      </div>
                    </div>

                    <svg
                      viewBox={`0 0 ${svgWidth} 18`}
                      preserveAspectRatio="none"
                      className="w-full h-5 rounded-md overflow-hidden block"
                      role="img"
                      aria-label={`${item.name}: Remaining ${formatNumber(remainingQty)}, Sold ${formatNumber(soldQty)}, Total Stored ${formatNumber(totalStoredQty)} ${item.unit}`}
                    >
                      <title>
                        {`Remaining: ${formatNumber(remainingQty)} ${item.unit} (${remShare}%) · Sold: ${formatNumber(soldQty)} ${item.unit} (${soldShare}%) · Total Stored: ${formatNumber(totalStoredQty)} ${item.unit}`}
                      </title>
                      <rect
                        x={0}
                        y={0}
                        width={svgWidth}
                        height={18}
                        rx={4}
                        fill="#f5f5f5"
                      />
                      {[0.25, 0.5, 0.75].map((tick) => (
                        <line
                          key={tick}
                          x1={svgWidth * tick}
                          y1={0}
                          x2={svgWidth * tick}
                          y2={18}
                          stroke="#e5e5e5"
                          strokeWidth={1}
                        />
                      ))}
                      {remW > 0 && (
                        <rect
                          x={0}
                          y={0}
                          width={remW}
                          height={18}
                          fill={isHovered ? '#404040' : '#525252'}
                        />
                      )}
                      {soldW > 0 && (
                        <rect
                          x={remW}
                          y={0}
                          width={soldW}
                          height={18}
                          fill={isHovered ? '#991b1b' : '#b91c1c'}
                        />
                      )}
                      {remW > 0 && soldW > 0 && (
                        <line
                          x1={remW}
                          y1={0}
                          x2={remW}
                          y2={18}
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      )}
                    </svg>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Add / Edit Stack Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-900/40 flex items-center justify-center p-4">
          <div className="bg-white border border-neutral-200 rounded-xl w-full max-w-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-200 flex items-center justify-between">
              <h2 className="text-base font-display font-semibold text-neutral-900">
                {editingItem ? 'Update / Restock Stack Batch' : 'Add New Stack Batch'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">SKU Code</label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">HSN / SAC Code</label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={form.hsnCode}
                    onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
                    placeholder="e.g. 7210"
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Product / Stock Name</label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Organic Toor Dal (5kg Pack)"
                  className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Aisle Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700 bg-white"
                  >
                    {SUPERMARKET_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    {!SUPERMARKET_CATEGORIES.includes(form.category) && (
                      <option value={form.category}>{form.category}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Unit</label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="Bundles / Tons / Crates"
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">GST Slab (%)</label>
                  <select
                    value={form.gstRate}
                    onChange={(e) =>
                      setForm({ ...form, gstRate: Number(e.target.value) as 0 | 5 | 12 | 18 | 28 })
                    }
                    className="w-full px-3 py-2 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700 bg-white"
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Rate (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={form.unitPrice}
                    onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Available Qty</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.availableQty}
                    onChange={(e) => setForm({ ...form, availableQty: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Upgoing Qty</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.upgoingQty}
                    onChange={(e) => setForm({ ...form, upgoingQty: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Sold Qty</label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={form.soldQty}
                    onChange={(e) => setForm({ ...form, soldQty: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm font-mono border border-neutral-300 rounded-lg focus:outline-none focus:border-red-700"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingItem ? 'Save Changes' : 'Create Stack'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
