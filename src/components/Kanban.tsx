"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "./Logo";

type Card = { id: string; title: string; stage: string; company: string; logo: string | null; score: number | null; nextAction: string | null; due: string | null; applied: boolean };

export default function Kanban({ stages, cards }: { stages: [string, string][]; cards: Card[] }) {
  const [items, setItems] = useState(cards);
  const [drag, setDrag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const r = useRouter();
  async function drop(stage: string, id: string | null = drag) {
    if (!id) return;
    const prev = items;
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, stage } : x)));
    const res = await fetch(`/api/applications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage }) });
    if (!res.ok) { setItems(prev); setError((await res.json()).error); } else { setError(null); r.refresh(); }
    setDrag(null);
  }
  return (
    <>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map(([k, label]) => {
          const col = items.filter((c) => c.stage === k);
          return (
            <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(k)} className={`w-64 shrink-0 rounded-xl border border-slate-200 bg-slate-100/60 ${drag ? "ring-1 ring-navy-500/10" : ""}`}>
              <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600"><span>{label}</span><span className="tabular-nums text-slate-400">{col.length}</span></div>
              <div className="space-y-2 p-2 min-h-[80px]">
                {col.map((c) => (
                  <div key={c.id} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)} className="cursor-grab rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm active:cursor-grabbing">
                    <div className="flex items-start gap-2">
                      <Logo src={c.logo} name={c.company} size={20} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/applications/${c.id}`} className="block text-[13px] font-medium leading-snug text-navy-950 hover:underline">{c.title}</Link>
                        <div className="text-xs text-slate-500">{c.company}</div>
                      </div>
                      {c.score != null && <span className="text-xs font-semibold tabular-nums text-navy-700">{c.score}</span>}
                    </div>
                    {(c.nextAction || c.due) && <div className={`mt-2 text-[11px] ${c.due && new Date(c.due) < new Date() ? "text-red-600" : "text-slate-500"}`}>→ {c.nextAction || "Next action"}{c.due ? ` · ${new Date(c.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>}
                    <select aria-label="Move to stage" className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[11px] lg:hidden" value={c.stage} onChange={(e) => drop(e.target.value, c.id)}>{stages.map(([sk, sl]) => <option key={sk} value={sk}>{sl}</option>)}</select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
