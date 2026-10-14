"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function RefreshButton({ companyId, label = "Refresh job feeds" }: { companyId?: string; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = useRouter();
  async function go() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/ingest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `${j.created} new · ${j.updated} updated · ${j.closed} closed · ${j.errors} errors` : j.error || "Refresh failed");
    r.refresh();
  }
  return (
    <span className="inline-flex items-center gap-2">
      <button onClick={go} disabled={busy} className="btn-primary">{busy ? "Refreshing…" : label}</button>
      {msg && <span className="text-xs text-slate-500">{msg}</span>}
    </span>
  );
}
