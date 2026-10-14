"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewVersion({ parentId, name, text }: { parentId: string; name: string; text: string }) {
  const [t, setT] = useState(text);
  const [n, setN] = useState(`${name} – tailored`);
  const r = useRouter();
  async function save() {
    const res = await fetch("/api/documents/text", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parentId, name: n, text: t }) });
    const j = await res.json();
    if (res.ok) r.push(`/documents/${j.id}`); else alert(j.error ?? "Save failed");
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Edit wording and emphasis only. Keep every title, date, employer and result exactly as true; the library never adds achievements for you.</p>
      <input className="input" value={n} onChange={(e) => setN(e.target.value)} />
      <textarea className="input font-mono text-xs" rows={16} value={t} onChange={(e) => setT(e.target.value)} />
      <button className="btn-primary" onClick={save}>Save as new version</button>
    </div>
  );
}
