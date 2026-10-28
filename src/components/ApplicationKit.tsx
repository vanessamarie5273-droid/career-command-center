"use client";
import Link from "next/link";
import { useState } from "react";
import { KIT_LABEL, KIT_PARTS, type KitChecks, type KitPart, type KitParts } from "@/lib/kitParts";
import { dateTime } from "@/lib/format";

export type KitRow = { id: string; createdAt: string; parts: KitParts; checks: KitChecks; resumeDocId: string | null; letterDocId: string | null };

const KIND_LABEL = { language: "Language", figure: "Unverified figure", length: "Length", structure: "Structure" } as const;

export default function ApplicationKit({ jobId, resumes, kits: initial, configured }: { jobId: string; resumes: { id: string; name: string; version: string | null }[]; kits: KitRow[]; configured: boolean }) {
  const [kits, setKits] = useState(initial);
  const [kitId, setKitId] = useState(initial[0]?.id ?? "");
  const [docId, setDocId] = useState("");
  const [tab, setTab] = useState<KitPart>("resume");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const kit = kits.find((k) => k.id === kitId);

  async function build() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, documentId: docId || undefined }) });
    const j = await res.json().catch(() => ({ error: "Kit build failed" }));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Kit build failed");
    setKits([j, ...kits]); setKitId(j.id); setTab("resume");
  }
  async function copy() {
    if (!kit) return;
    await navigator.clipboard.writeText(kit.parts[tab]);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const issues = kit?.checks[tab] ?? [];
  const libraryId = tab === "resume" ? kit?.resumeDocId : tab === "letter" ? kit?.letterDocId : null;
  return (
    <section id="kit" className="card scroll-mt-4 border-gold-500/50">
      <div className="card-h"><h2 className="card-t">Application Kit</h2>{kit && <span className="text-xs text-slate-500">Built {dateTime(kit.createdAt)}</span>}</div>
      <div className="px-5 pb-5 space-y-3 text-sm">
        <p className="text-slate-600">One click writes a tailored resume, a Why Me letter, a point of view with a 30-60-90 plan, notes for each person on the hiring team, and copy-ready form answers. It uses only facts from your resume; the checks flag anything that is not there and any language your brief rules out.</p>
        {!configured ? <p className="text-amber-700">Add ANTHROPIC_API_KEY to the web service to turn this on.</p> : resumes.length === 0 ? <p className="muted">Upload your resume in the <Link className="link" href="/documents">Resume Library</Link> first.</p> : (
          <div className="flex flex-wrap items-center gap-2">
            <select className="input max-w-xs" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Base resume: newest original</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ""}</option>)}</select>
            <button className="btn-gold" disabled={busy} onClick={build}>{busy ? "Building… about a minute" : kit ? "Build a new kit" : "Build my kit"}</button>
            {kits.length > 1 && <select className="input max-w-[220px]" value={kitId} onChange={(e) => setKitId(e.target.value)}>{kits.map((k, i) => <option key={k.id} value={k.id}>{i === 0 ? "Latest" : "Earlier"} kit · {dateTime(k.createdAt)}</option>)}</select>}
          </div>
        )}
        {err && <p className="text-red-700">{err}</p>}
        {kit && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1 border-b border-slate-200">
              {KIT_PARTS.map((p) => (
                <button key={p} onClick={() => setTab(p)} className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-medium ${tab === p ? "border-navy-900 text-navy-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {KIT_LABEL[p]}{kit.checks[p]?.length ? <span className="ml-1 chip bg-amber-50 text-amber-800">{kit.checks[p].length}</span> : null}
                </button>
              ))}
            </div>
            {issues.length ? (
              <ul className="space-y-1 rounded-lg bg-amber-50/70 p-3 text-xs ring-1 ring-amber-200">
                {issues.map((x, i) => <li key={i}><span className="chip mr-1 bg-white text-amber-800">{KIND_LABEL[x.kind]}</span><b>{x.text}</b>: {x.detail}</li>)}
              </ul>
            ) : <p className="text-xs text-emerald-700">✓ Passes the language and fact checks.</p>}
            <pre className="max-h-[560px] overflow-auto rounded-lg bg-slate-50 p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-slate-800">{kit.parts[tab]}</pre>
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
              <a className="btn-ghost" href={`/api/kits/${kit.id}/export?part=${tab}&format=docx`}>Word</a>
              <a className="btn-ghost" href={`/api/kits/${kit.id}/export?part=${tab}&format=pdf`}>PDF</a>
              {libraryId && <Link className="btn-ghost" href={`/documents/${libraryId}`}>Edit and download →</Link>}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
