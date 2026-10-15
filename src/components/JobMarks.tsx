"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MARKS = [
  { reason: "not_fit", label: "Not a fit", title: "Not a fit: remove from feeds and track on the dashboard" },
  { reason: "duplicate", label: "Duplicate", title: "Duplicate: remove this copy from feeds and track it on the dashboard" },
] as const;

/** Checkboxes on a job row. Either one removes the role from feeds and priorities; the dashboard counts each separately. */
export default function JobMarks({ id }: { id: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const r = useRouter();
  async function mark(reason: string) {
    setBusy(reason); setError(false);
    const res = await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true, dismissReason: reason }) });
    if (res.ok) r.refresh();
    else { setError(true); setBusy(null); }
  }
  return (
    <div className="flex shrink-0 flex-col gap-1 text-[11px] leading-none text-slate-500">
      {MARKS.map((m) => (
        <label key={m.reason} className="flex cursor-pointer items-center gap-1.5" title={m.title}>
          <input type="checkbox" checked={busy === m.reason} disabled={!!busy} onChange={() => mark(m.reason)} className="h-3.5 w-3.5 cursor-pointer accent-navy-900" />
          {m.label}
        </label>
      ))}
      {error && <span className="text-red-600">Not saved</span>}
    </div>
  );
}
