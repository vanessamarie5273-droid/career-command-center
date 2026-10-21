"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const MARKS = [
  { key: "applied", label: "Applied", title: "Applied: move to My Applications as Applied and remove from the feed" },
  { key: "not_fit", label: "Not a fit", title: "Not a fit: remove from the feed and track on the dashboard" },
  { key: "duplicate", label: "Duplicate", title: "Duplicate: remove this copy from the feed and track it on the dashboard" },
] as const;

/** Checkboxes on a job row. Each one takes the role out of the feed; the dashboard counts them separately. */
export default function JobMarks({ id }: { id: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const r = useRouter();
  async function mark(key: string) {
    setBusy(key); setError(false);
    const res = key === "applied"
      ? await fetch("/api/jobs/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id], action: "applied" }) })
      : await fetch(`/api/jobs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true, dismissReason: key }) });
    if (res.ok) r.refresh();
    else { setError(true); setBusy(null); }
  }
  return (
    <div className="flex shrink-0 flex-col gap-1 text-[11px] leading-none text-slate-500">
      {MARKS.map((m) => (
        <label key={m.key} className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap" title={m.title}>
          <input type="checkbox" checked={busy === m.key} disabled={!!busy} onChange={() => mark(m.key)} className="h-3.5 w-3.5 cursor-pointer accent-navy-900" />
          {m.label}
        </label>
      ))}
      {error && <span className="text-red-600">Not saved</span>}
    </div>
  );
}
