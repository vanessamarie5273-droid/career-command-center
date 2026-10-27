"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { KitParts } from "@/lib/kitParts";

export default function ReadyToApply({ jobId, kitId, applyUrl, parts, resumeDocId, letterDocId }: { jobId: string; kitId: string; applyUrl: string; parts: KitParts; resumeDocId: string | null; letterDocId: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = useRouter();
  async function copy(key: "letter" | "answers") {
    await navigator.clipboard.writeText(parts[key]);
    setCopied(key); setTimeout(() => setCopied(null), 1500);
  }
  async function applied() {
    setBusy(true);
    const res = await fetch("/api/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, kitId }) });
    const j = await res.json();
    if (res.ok) r.push(`/applications/${j.id}`); else { setBusy(false); alert(j.error ?? "Could not record the application"); }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn-gold" href={applyUrl} target="_blank" rel="noopener noreferrer">Open employer form ↗</a>
      {resumeDocId && <a className="btn-ghost" href={`/api/documents/${resumeDocId}/export?format=pdf`}>Resume PDF</a>}
      {letterDocId && <a className="btn-ghost" href={`/api/documents/${letterDocId}/export?format=pdf`}>Letter PDF</a>}
      <button className="btn-ghost" onClick={() => copy("letter")}>{copied === "letter" ? "Copied" : "Copy letter"}</button>
      <button className="btn-ghost" onClick={() => copy("answers")}>{copied === "answers" ? "Copied" : "Copy answers"}</button>
      <button className="btn-primary" disabled={busy} onClick={applied}>{busy ? "Recording…" : "I submitted it"}</button>
    </div>
  );
}
