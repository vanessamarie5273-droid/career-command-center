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
            <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(k)} className={`w-64 shrink-0 overflow-hidden rounded-xl bg-[#efeaff] ring-1 ring-[#d9cfff] ${drag ? "ring-2 ring-[#7458FF]/40" : ""}`}>
              <div className={`flex items-center justify-between px-3 py-2.5 text-[15px] font-semibold text-white ${LANE[k] ?? LANE.DEFAULT}`}><span>{label}</span><span className="rounded-full bg-white/20 px-2 py-0.5 text-[13px] tabular-nums">{col.length}</span></div>
              <div className="space-y-2 p-2 min-h-[80px]">
                {col.map((c) => (
                  <div key={c.id} draggable onDragStart={() => setDrag(c.id)} onDragEnd={() => setDrag(null)} className="cursor-grab rounded-lg bg-white p-2.5 shadow-[0_2px_6px_-2px_rgba(93,54,255,0.25)] ring-1 ring-[#e3dbff] active:cursor-grabbing">
                    <div className="flex items-start gap-2">
                      <Logo src={c.logo} name={c.company} size={20} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/applications/${c.id}`} className="block text-[14px] font-medium leading-snug text-navy-950 hover:underline">{c.title}</Link>
                        <div className="text-[13px] text-slate-500">{c.company}</div>
                      </div>
                      {c.score != null && <span className="text-[13px] font-semibold tabular-nums text-navy-700">{c.score}</span>}
                    </div>
                    {(c.nextAction || c.due) && <div className={`mt-2 text-[12px] ${c.due && new Date(c.due) < new Date() ? "text-red-600" : "text-slate-500"}`}>→ {c.nextAction || "Next action"}{c.due ? ` · ${new Date(c.due).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>}
                    <select aria-label="Move to stage" className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[12px] lg:hidden" value={c.stage} onChange={(e) => drop(e.target.value, c.id)}>{stages.map(([sk, sl]) => <option key={sk} value={sk}>{sl}</option>)}</select>
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

const LANE: Record<string, string> = {
  DEFAULT: "bg-gradient-to-r from-[#5D36FF] to-[#7458FF]",
  READY_TO_APPLY: "bg-gradient-to-r from-[#4a26ef] to-[#5D36FF]",
  INTERVIEWING: "bg-gradient-to-r from-[#7458FF] to-[#A100C2]",
  FINAL_INTERVIEW: "bg-gradient-to-r from-[#8a12d6] to-[#A100C2]",
  OFFER: "bg-gradient-to-r from-emerald-600 to-emerald-500",
  ACCEPTED: "bg-gradient-to-r from-emerald-700 to-emerald-500",
  REJECTED: "bg-gradient-to-r from-rose-600 to-rose-500",
  WITHDRAWN: "bg-gradient-to-r from-slate-500 to-slate-400",
};
