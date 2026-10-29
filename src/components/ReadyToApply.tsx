"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ApplicationKit, { type KitRow } from "@/components/ApplicationKit";

export default function ReadyToApply({ jobId, applyUrl, kit }: { jobId: string; applyUrl: string; kit: KitRow }) {
  const { id: kitId, parts, resumeDocId, letterDocId } = kit;
  const [open, setOpen] = useState(false);
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
    <>
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close review" : "Review & edit"}</button>
      <a className="btn-gold" href={applyUrl} target="_blank" rel="noopener noreferrer">Open employer form ↗</a>
      {resumeDocId && <a className="btn-ghost" href={`/api/documents/${resumeDocId}/export?format=pdf`}>Resume PDF</a>}
      {letterDocId && <a className="btn-ghost" href={`/api/documents/${letterDocId}/export?format=pdf`}>Letter PDF</a>}
      <button className="btn-ghost" onClick={() => copy("letter")}>{copied === "letter" ? "Copied" : "Copy letter"}</button>
      <button className="btn-ghost" onClick={() => copy("answers")}>{copied === "answers" ? "Copied" : "Copy answers"}</button>
      <button className="btn-primary" disabled={busy} onClick={applied}>{busy ? "Recording…" : "I submitted it"}</button>
    </div>
    {open && <div className="basis-full border-t border-slate-100 pt-3"><ApplicationKit jobId={jobId} resumes={[]} kits={[kit]} configured embedded /></div>}
    </>
  );
}
