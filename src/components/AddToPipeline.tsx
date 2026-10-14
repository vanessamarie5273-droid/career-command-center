"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AddToPipeline({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  async function go() {
    setBusy(true);
    const res = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
    const j = await res.json();
    if (res.ok) r.push(`/applications/${j.id}`); else { setBusy(false); alert(j.error); }
  }
  return <button onClick={go} disabled={busy} className="btn-primary">{busy ? "Adding…" : "+ Add to my applications"}</button>;
}
