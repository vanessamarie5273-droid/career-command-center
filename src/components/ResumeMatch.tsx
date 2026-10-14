"use client";
import Link from "next/link";
import { useState } from "react";

type R = { matchScore: number | null; matched: string[]; missing: string[]; recommendations: { term: string; importance: string; supported: boolean; advice: string }[]; resumeText?: string; jdText?: string };

export default function ResumeMatch({ jobId, resumes }: { jobId: string; resumes: { id: string; name: string; version: string | null }[] }) {
  const [docId, setDocId] = useState("");
  const [res, setRes] = useState<R | null>(null);
  const [ranked, setRanked] = useState<{ id: string; name: string; matchScore: number | null }[] | null>(null);
  const [side, setSide] = useState(false);
  const [tailor, setTailor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(id?: string) {
    setBusy(true);
    const r = await fetch("/api/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, documentId: id || undefined }) }).then((x) => x.json());
    setBusy(false);
    if (r.ranked) setRanked(r.ranked); else setRes(r);
  }
  async function aiTailor() {
    setBusy(true); setTailor(null);
    const r = await fetch("/api/assistant/tailor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, documentId: docId }) }).then((x) => x.json());
    setBusy(false); setTailor(r.text || r.error);
  }
  return (
    <section className="card">
      <div className="card-h"><h2 className="card-t">Resume match & gap analysis</h2></div>
      <div className="px-5 pb-5 space-y-3 text-sm">
        {resumes.length === 0 ? <p className="muted">Upload a resume in the <Link className="link" href="/documents">Resume Library</Link> to compare it with this job.</p> : (
          <div className="flex flex-wrap gap-2">
            <select className="input max-w-xs" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Choose a resume…</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ""}</option>)}</select>
            <button className="btn-primary" disabled={!docId || busy} onClick={() => run(docId)}>Compare</button>
            <button className="btn-ghost" disabled={busy} onClick={() => run()}>Which resume fits best?</button>
          </div>
        )}
        {ranked && <ol className="list-decimal ml-5">{ranked.map((r) => <li key={r.id}><button className="link" onClick={() => { setDocId(r.id); run(r.id); }}>{r.name}</button>: {r.matchScore ?? "—"}% keyword coverage</li>)}</ol>}
        {res && (
          <div className="space-y-3">
            <p><span className="text-2xl font-semibold tabular-nums">{res.matchScore ?? "—"}%</span> <span className="muted">coverage of this posting&apos;s key terms (required terms count double)</span></p>
            <div><div className="label">Already in your resume</div><div className="flex flex-wrap gap-1">{res.matched.map((t) => <span key={t} className="chip bg-emerald-50 text-emerald-700">{t}</span>)}</div></div>
            <div><div className="label">Gaps and recommended revisions</div>
              <ul className="space-y-1">{res.recommendations.map((r) => <li key={r.term} className="text-xs"><span className={`chip mr-1 ${r.importance === "required" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.importance}</span><b>{r.term}</b>: {r.advice}</li>)}</ul>
            </div>
            <div className="flex gap-2"><button className="btn-ghost" onClick={() => setSide(!side)}>{side ? "Hide" : "Show"} side-by-side</button><button className="btn-ghost" disabled={busy} onClick={aiTailor}>AI tailoring suggestions</button></div>
            {side && <div className="grid md:grid-cols-2 gap-3"><pre className="h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap font-sans">{res.jdText}</pre><pre className="h-96 overflow-auto rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap font-sans">{res.resumeText}</pre></div>}
            {tailor && <pre className="rounded-lg bg-violet-50/60 p-3 text-xs whitespace-pre-wrap font-sans ring-1 ring-violet-200">{tailor}</pre>}
          </div>
        )}
      </div>
    </section>
  );
}
