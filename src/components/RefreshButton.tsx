"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Refreshes one company's job board now. Every board is refreshed by the hourly job, outside the web server. */
export default function RefreshButton({ companyId, label = "Refresh this company's jobs" }: { companyId: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = useRouter();
  async function go() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMsg(j.error || "Refresh failed");
    else setMsg(`${j.created} new · ${j.updated} updated · ${j.closed} closed · ${j.errors} errors`);
    r.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={go} disabled={busy} className="btn-primary">{busy ? "Starting…" : label}</button>
      {msg && <span className="rounded-md bg-white px-2 py-1 text-[13px] text-slate-700 shadow-sm">{msg}</span>}
    </span>
  );
}
