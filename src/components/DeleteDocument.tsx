"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteDocument({ id, name, compact }: { id: string; name: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  async function del() {
    if (!confirm(`Delete “${name}”? The file and its text are removed permanently. Applications that used it are kept but will no longer link to it.`)) return;
    setBusy(true);
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) { r.push("/documents"); r.refresh(); } else { setBusy(false); alert("Delete failed. Please try again."); }
  }
  return <button className={compact ? "text-red-700 hover:underline" : "btn-danger"} disabled={busy} onClick={del}>{busy ? "Deleting…" : "Delete"}</button>;
}
