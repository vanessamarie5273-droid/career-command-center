"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function UploadDocument() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const r = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/documents", { method: "POST", body: new FormData(e.currentTarget) });
    const j = await res.json();
    setBusy(false);
    if (res.ok) { setMsg(`Saved ${j.name} ${j.version}`); (e.target as HTMLFormElement).reset(); r.refresh(); } else setMsg(j.error);
  }
  return (
    <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-6 gap-2 items-end">
      <div className="lg:col-span-2"><label className="label">File (PDF, DOCX, TXT, max 10 MB)</label><input required type="file" name="file" accept=".pdf,.docx,.txt,.md" className="input" /></div>
      <div><label className="label">Type</label><select name="kind" className="input"><option value="resume">Resume</option><option value="cover_letter">Cover letter</option><option value="recommendation">Letter of recommendation</option><option value="bio">Executive biography</option><option value="references">References</option><option value="other">Other</option></select></div>
      <div><label className="label">Name</label><input name="name" placeholder="e.g. Enterprise AE – Healthcare" className="input" /></div>
      <div><label className="label">Industry</label><input name="industry" placeholder="Healthcare, Public sector…" className="input" /></div>
      <div><label className="label">Role type</label><input name="roleType" placeholder="Strategic AE, SDR leadership…" className="input" /></div>
      <div className="lg:col-span-6 flex items-center gap-3"><button className="btn-primary" disabled={busy}>{busy ? "Uploading…" : "Upload"}</button>{msg && <span className="text-sm text-slate-600">{msg}</span>}</div>
    </form>
  );
}
