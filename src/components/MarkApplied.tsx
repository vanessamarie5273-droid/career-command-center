"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** "I applied": records the application with the kit's resume and letter, moves it to Applied and books the follow-ups. */
export default function MarkApplied({ jobId, kitId, label = "✓ I applied" }: { jobId: string; kitId: string | null; label?: string }) {
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  async function go() {
    setBusy(true);
    const res = await fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, kitId }) });
    const j = await res.json().catch(() => ({ error: "Could not record the application" }));
    if (res.ok) r.push(`/applications/${j.id}`); else { setBusy(false); alert(j.error ?? "Could not record the application"); }
  }
  return <button onClick={go} disabled={busy} className="btn-primary">{busy ? "Recording…" : label}</button>;
}
