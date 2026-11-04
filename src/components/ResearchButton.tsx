"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { dateTime } from "@/lib/format";

type State = { status: string; active: boolean; researchedAt: string | null; summary: string | null; error: string | null };

/**
 * Researches the company from public sources (overview, scores, leaders, news, financials with sources) and
 * refreshes its openings. Runs in the background; this polls until it finishes, then re-reads the page.
 */
export default function ResearchButton({ companyId, initial }: { companyId: string; initial: State }) {
  const r = useRouter();
  const [s, setS] = useState<State>(initial);
  const [err, setErr] = useState<string | null>(null);
  const ep = `/api/companies/${companyId}/research`;

  useEffect(() => {
    if (!s.active) return;
    const t = setInterval(async () => {
      const res = await fetch(ep).catch(() => null);
      if (!res?.ok) return;
      const j: State = await res.json();
      setS(j);
      if (!j.active) r.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [s.active, ep, r]);

  async function go() {
    setErr(null);
    setS((x) => ({ ...x, active: true, status: "running" }));
    const res = await fetch(ep, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error || "Research could not start"); setS((x) => ({ ...x, active: false })); return; }
    setS(j);
  }

  const label = s.researchedAt ? "Refresh company info" : "Research this company";
  return (
    <div className="flex flex-col items-end gap-1 max-w-sm text-right">
      <button onClick={go} disabled={s.active} className="btn-primary">{s.active ? (s.status === "queued" ? "Waiting for another research…" : "Researching…") : label}</button>
      {s.active && <span className="text-[13px] text-slate-500">Reading public sources. This takes a minute or two; you can leave this page.</span>}
      {!s.active && s.status === "done" && s.summary && <span className="text-[13px] text-slate-600">Researched {dateTime(s.researchedAt)}. {s.summary}</span>}
      {!s.active && !err && s.status === "error" && s.error && <span className="text-[13px] text-red-600">{s.error}</span>}
      {err && <span className="text-[13px] text-red-600">{err}</span>}
    </div>
  );
}
