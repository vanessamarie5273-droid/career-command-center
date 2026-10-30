"use client";
import { useState, type ReactNode } from "react";

/** Pill tabs that swap panels in place, so several lists share one card instead of one card each. */
export default function Tabs({ tabs, action }: { tabs: { key: string; label: string; count?: number; content: ReactNode; action?: ReactNode }[]; action?: ReactNode }) {
  const [cur, setCur] = useState(tabs[0]?.key);
  const t = tabs.find((x) => x.key === cur) ?? tabs[0];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === t.key} onClick={() => setCur(x.key)} className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition ${x.key === t.key ? "bg-navy-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {x.label}{x.count != null && <span className={`ml-1.5 tabular-nums ${x.key === t.key ? "text-gold-300" : "text-slate-400"}`}>{x.count}</span>}
            </button>
          ))}
        </div>
        {t.action ?? action}
      </div>
      {t.content}
    </div>
  );
}
