"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Deletes a saved role from Ready to Apply. The job is also hidden from the Discover feed so it does not come back. */
export default function DeleteSaved({ appId, jobId }: { appId: string; jobId: string }) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const r = useRouter();
  async function remove() {
    setBusy(true); setError(false);
    const a = await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissed: true, dismissReason: "not_fit" }) });
    const b = a.ok ? await fetch(`/api/applications/${appId}`, { method: "DELETE" }) : a;
    if (b.ok) r.refresh();
    else { setError(true); setBusy(false); }
  }
  if (!ask) return <button type="button" className="btn border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100" onClick={() => setAsk(true)}>Delete</button>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 ring-1 ring-rose-200">
      <span className="text-[13px] font-medium text-rose-800">{error ? "Couldn't delete. Try again?" : "Delete this role?"}</span>
      <button type="button" disabled={busy} className="btn !px-2.5 !py-1 bg-rose-600 text-white hover:bg-rose-700" onClick={remove}>{busy ? "Deleting…" : "Delete"}</button>
      <button type="button" disabled={busy} className="btn !px-2.5 !py-1 text-rose-700 hover:bg-rose-100" onClick={() => setAsk(false)}>Cancel</button>
    </span>
  );
}
