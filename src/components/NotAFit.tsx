"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Checkbox on a job row: marks it "Not a fit", which removes it from feeds and priorities and counts it on the dashboard. */
export default function NotAFit({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = useRouter();
  async function mark() {
    setBusy(true); setError(null);
    const res = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true }) });
    if (res.ok) r.refresh();
    else { setError("Not saved"); setBusy(false); }
  }
  return (
    <label className="flex shrink-0 cursor-pointer flex-col items-center gap-0.5 text-[10px] leading-none text-slate-500" title="Not a fit: remove from feeds and track on the dashboard">
      <input type="checkbox" checked={busy} disabled={busy} onChange={mark} className="h-4 w-4 cursor-pointer accent-navy-900" aria-label="Not a fit" />
      <span className={error ? "text-red-600" : ""}>{error ?? "Not a fit"}</span>
    </label>
  );
}
