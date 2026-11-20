import { Calendar, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Invoice, StackItem } from '../types';
import { formatINR, formatNumber, getTodayIsoDate, toDateSafe } from '../utils/format';

interface DashboardStockChartProps {
  stacks: StackItem[];
  invoices: Invoice[];
  onOpenNewInvoice: (preselectedStackId?: string) => void;
}

type ChartMode = 'daily' | 'inventory';

function getInvoiceIsoDate(inv: Invoice): string {
  const d = toDateSafe(inv.createdAt);
  if (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return getTodayIsoDate();
}

function getInvoiceHourLabel(inv: Invoice): string {
  const d = toDateSafe(inv.createdAt);
  if (d) {
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return 'Just now';
}

export function DashboardStockChart({
  stacks,
  invoices,
  onOpenNewInvoice,
}: DashboardStockChartProps) {
  const today = getTodayIsoDate();
  const [mode, setMode] = useState<ChartMode>('daily');
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Build last 7 days list ending today for quick day comparison
  const recentDays = useMemo(() => {
    const days: Array<{ iso: string; shortLabel: string; units: number; revenue: number }> = [];
    const base = new Date();
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date(base);
      d.setDate(base.getDate() - offset);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const shortLabel =
        offset === 0
          ? 'Today'
          : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      days.push({ iso, shortLabel, units: 0, revenue: 0 });
    }

    for (const inv of invoices) {
      const invDate = getInvoiceIsoDate(inv);
      const bucket = days.find((d) => d.iso === invDate);
      if (bucket) {
        const units = inv.lineItems.reduce((s, li) => s + li.qty, 0);
        bucket.units += units;
        bucket.revenue += inv.grandTotal;
      }
    }
    return days;
  }, [invoices]);

  // Aggregate stacks sold on the selected single day
  const dailySoldByStack = useMemo(() => {
    const dayInvoices = invoices.filter((inv) => getInvoiceIsoDate(inv) === selectedDate);
    const map = new Map<
      string,
      {
        stackId: string;
        sku: string;
        name: string;
        unit: string;
        qtySold: number;
        revenue: number;
        invoiceCount: number;
        lastTime: string;
      }
    >();

    for (const inv of dayInvoices) {
      const timeLabel = getInvoiceHourLabel(inv);
      for (const li of inv.lineItems) {
        const existing = map.get(li.stackId) || {
          stackId: li.stackId,
          sku: li.sku,
          name: li.name,
          unit: li.unit,
          qtySold: 0,
          revenue: 0,
          invoiceCount: 0,
          lastTime: timeLabel,
        };
        existing.qtySold += li.qty;
        existing.revenue += li.lineTotal;
        existing.invoiceCount += 1;
        existing.lastTime = timeLabel;
        map.set(li.stackId, existing);
      }
    }

    return Array.from(map.values()).sort((a, b) => b.qtySold - a.qtySold);
  }, [invoices, selectedDate]);

  const totalDayUnits = dailySoldByStack.reduce((s, item) => s + item.qtySold, 0);
  const totalDayRevenue = dailySoldByStack.reduce((s, item) => s + item.revenue, 0);
  const maxDayStackQty = Math.max(1, ...dailySoldByStack.map((d) => d.qtySold));
  const maxRecentDayUnits = Math.max(1, ...recentDays.map((d) => d.units));

  const maxInventoryBar = Math.max(
    1,
    ...stacks.map((s) => Math.max(s.soldQty, s.availableQty + s.upgoingQty))
  );

  const selectedDayLabel =
    selectedDate === today
      ? `Today (${selectedDate})`
      : new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

  return (
    <section className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-semibold text-neutral-900">
            {mode === 'daily'
              ? `Supermarket Stock Sold in One Day · ${selectedDayLabel}`
              : 'Shelf Stock vs. Cumulative Units Sold'}
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5 font-mono tabular-nums">
            {mode === 'daily'
              ? `${formatNumber(totalDayUnits)} items sold across ${dailySoldByStack.length} products · ${formatINR(totalDayRevenue)} billed`
              : `${stacks.length} store products · Comparing sold units against available & incoming stock`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {mode === 'daily' && (
            <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-lg text-xs text-neutral-700">
              <Calendar className="w-3.5 h-3.5 text-neutral-500" />
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => setSelectedDate(e.target.value || today)}
                className="bg-transparent font-mono text-xs text-neutral-900 focus:outline-none cursor-pointer"
                aria-label="Select date for daily stack sales"
              />
            </label>
          )}

          <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
            <button
              type="button"
              onClick={() => setMode('daily')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'daily'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Sold in One Day
            </button>
            <button
              type="button"
              onClick={() => setMode('inventory')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                mode === 'inventory'
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              Stock vs Sold
            </button>
          </div>
        </div>
      </div>

      {mode === 'daily' ? (
        <div className="p-5 grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Left 8 cols: Per-Stack Units Sold on Selected Single Day */}
          <div className="xl:col-span-8 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-medium text-neutral-600">
                Units Sold by Stack Batch ({selectedDayLabel})
              </span>
              <span className="text-xs text-neutral-400">Hover bar for invoice details</span>
            </div>

            {dailySoldByStack.length === 0 ? (
              <div className="py-12 px-4 text-center border border-dashed border-neutral-200 rounded-lg bg-neutral-50/70">
                <p className="text-sm text-neutral-600">
                  No stack sales recorded on <span className="font-mono font-medium">{selectedDate}</span>.
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  {selectedDate !== today && (
                    <button
                      type="button"
                      onClick={() => setSelectedDate(today)}
                      className="px-3.5 py-1.5 text-xs font-medium text-neutral-700 bg-white border border-neutral-300 rounded-lg hover:bg-neutral-50 cursor-pointer"
                    >
                      Jump to Today
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onOpenNewInvoice()}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-700 rounded-lg hover:bg-red-800 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create POS Bill Today</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                {dailySoldByStack.map((row) => {
                  const pct = Math.max(6, Math.round((row.qtySold / maxDayStackQty) * 100));
                  const isHovered = hoveredId === row.stackId;
                  return (
                    <div
                      key={row.stackId}
                      onMouseEnter={() => setHoveredId(row.stackId)}
                      onMouseLeave={() => setHoveredId(null)}
                      className="group"
                    >
                      <div className="flex items-baseline justify-between gap-4 text-xs mb-1.5">
                        <div className="min-w-0 flex items-baseline gap-2">
                          <span className="font-medium text-neutral-900 truncate">{row.name}</span>
                          <span className="font-mono text-[11px] text-neutral-400 shrink-0">
                            {row.sku}
                          </span>
                        </div>
                        <div className="font-mono tabular-nums shrink-0 text-right">
                          <span className="font-semibold text-neutral-900">
                            {formatNumber(row.qtySold)} {row.unit}
                          </span>
                          <span className="text-neutral-400 mx-1.5">·</span>
                          <span className="text-neutral-600">{formatINR(row.revenue)}</span>
                        </div>
                      </div>
                      <div className="w-full h-7 bg-neutral-100 rounded-md overflow-hidden relative flex items-center">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-md transition-all duration-200 ${
                            isHovered ? 'bg-red-800' : 'bg-red-700'
                          }`}
                        />
                        {isHovered && (
                          <span className="ml-2.5 text-[11px] font-mono text-neutral-600 whitespace-nowrap">
                            {row.invoiceCount} {row.invoiceCount === 1 ? 'bill' : 'bills'} · Last {row.lastTime}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right 4 cols: 7-Day Single-Day Comparison Bar Chart (SVG) */}
          <div className="xl:col-span-4 xl:border-l xl:border-neutral-200 xl:pl-6 flex flex-col justify-between">
            <div>
              <div className="text-xs font-medium text-neutral-600">
                7-Day Daily Dispatch Volume
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Click any day bar to inspect stack sold on that day
              </p>
            </div>

            <div className="mt-5">
              <svg
                viewBox="0 0 280 160"
                className="w-full h-44 overflow-visible"
                role="img"
                aria-label="Daily stack units sold over the last 7 days"
              >
                {/* Horizontal reference gridlines */}
                {[0, 0.5, 1].map((ratio, idx) => {
                  const y = 124 - ratio * 100;
                  const val = Math.round(maxRecentDayUnits * ratio);
                  return (
                    <g key={idx}>
                      <line
                        x1={28}
                        y1={y}
                        x2={274}
                        y2={y}
                        stroke="#e5e5e5"
                        strokeDasharray={ratio === 0 ? undefined : '3 3'}
                      />
                      <text
                        x={22}
                        y={y + 3}
                        textAnchor="end"
                        className="fill-neutral-400 text-[9px] font-mono"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {recentDays.map((day, index) => {
                  const barWidth = 22;
                  const gap = 12;
                  const x = 36 + index * (barWidth + gap);
                  const barHeight =
                    day.units > 0 ? Math.max(6, Math.round((day.units / maxRecentDayUnits) * 100)) : 2;
                  const y = 124 - barHeight;
                  const isSelected = day.iso === selectedDate;

                  return (
                    <g
                      key={day.iso}
                      onClick={() => setSelectedDate(day.iso)}
                      className="cursor-pointer"
                    >
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx={3}
                        fill={
                          isSelected
                            ? '#b91c1c'
                            : day.units > 0
                              ? '#fca5a5'
                              : '#e5e5e5'
                        }
                      />
                      {day.units > 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={y - 5}
                          textAnchor="middle"
                          className={`text-[9px] font-mono font-semibold ${
                            isSelected ? 'fill-red-700' : 'fill-neutral-600'
                          }`}
                        >
                          {day.units}
                        </text>
                      )}
                      <text
                        x={x + barWidth / 2}
                        y={142}
                        textAnchor="middle"
                        className={`text-[9px] ${
                          isSelected ? 'fill-neutral-900 font-semibold' : 'fill-neutral-500'
                        }`}
                      >
                        {day.shortLabel}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>
      ) : (
        /* Stock vs Cumulative Sold Overview */
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-5 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-red-700 inline-block" />
              <span>Cumulative Sold Units</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-xs bg-neutral-600 inline-block" />
              <span>Available + Upgoing Stock</span>
            </span>
          </div>

          <div className="space-y-4">
            {stacks.map((stack) => {
              const soldPct = Math.min(100, Math.round((stack.soldQty / maxInventoryBar) * 100));
              const stockUnits = stack.availableQty + stack.upgoingQty;
              const stockPct = Math.min(100, Math.round((stockUnits / maxInventoryBar) * 100));
              const isSoldOut = stack.availableQty <= 0 || stack.stackStatus === 'sold_out';

              return (
                <div key={stack.id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-4 text-xs">
                    <div className="min-w-0 flex items-baseline gap-2">
                      <span className="font-medium text-neutral-900 truncate">{stack.name}</span>
                      <span className="font-mono text-[11px] text-neutral-400">{stack.sku}</span>
                      {isSoldOut && (
                        <span className="text-[11px] font-semibold text-red-700">· Sold Out</span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums shrink-0 text-neutral-600">
                      Sold {formatNumber(stack.soldQty)} · Stock {formatNumber(stockUnits)} {stack.unit}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${Math.max(2, soldPct)}%` }}
                        className="h-full bg-red-700 rounded-full"
                      />
                    </div>
                    <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                      <div
                        style={{ width: `${stockUnits > 0 ? Math.max(2, stockPct) : 0}%` }}
                        className="h-full bg-neutral-600 rounded-full"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
