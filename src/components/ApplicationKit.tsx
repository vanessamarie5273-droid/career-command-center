"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KIT_LABEL, KIT_PARTS, type KitChecks, type KitPart, type KitParts } from "@/lib/kitParts";

type Fix = { busy?: boolean; err?: string; find?: string; replace?: string; why?: string };
import { dateTime } from "@/lib/format";

export type KitRow = { id: string; createdAt: string; parts: KitParts; checks: KitChecks; resumeDocId: string | null; letterDocId: string | null };

const KIND_LABEL = { language: "Language", figure: "Unverified figure", length: "Length", structure: "Structure" } as const;

/** `embedded` shows only the review and editing tabs, for use inside another page such as Ready to Apply. */
export default function ApplicationKit({ jobId, resumes, kits: initial, configured, embedded = false }: { jobId: string; resumes: { id: string; name: string; version: string | null }[]; kits: KitRow[]; configured: boolean; embedded?: boolean }) {
  const router = useRouter();
  const [kits, setKits] = useState(initial);
  const [kitId, setKitId] = useState(initial[0]?.id ?? "");
  const [docId, setDocId] = useState("");
  const [tab, setTab] = useState<KitPart>("resume");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fixes, setFixes] = useState<Record<string, Fix>>({}); // suggested fixes by kit, part and check
  const [draft, setDraft] = useState<string | null>(null); // the text being edited, null when not editing
  const kit = kits.find((k) => k.id === kitId);
  const pick = (p: KitPart) => { setTab(p); setDraft(null); };

  async function build() {
    setBusy(true); setErr(null);
    const res = await fetch("/api/kits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId, documentId: docId || undefined }) });
    const j = await res.json().catch(() => ({ error: "Kit build failed" }));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Kit build failed");
    setKits([j, ...kits]); setKitId(j.id); pick("resume");
  }
  async function save(text = draft) {
    if (!kit || text == null) return;
    setBusy(true); setErr(null);
    const res = await fetch(`/api/kits/${kit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ part: tab, text }) });
    const j = await res.json().catch(() => ({ error: "Save failed" }));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Save failed");
    setKits(kits.map((k) => (k.id === j.id ? { ...k, parts: j.parts, checks: j.checks } : k))); setDraft(null);
    setFixes({}); setSaved(true); setTimeout(() => setSaved(false), 2500);
    router.refresh(); // so Ready to Apply and the downloads pick up the new text
  }
  const fixKey = (i: number) => `${kitId}:${tab}:${i}`;
  async function suggest(i: number) {
    if (!kit) return;
    setFixes((f) => ({ ...f, [fixKey(i)]: { busy: true } }));
    const res = await fetch(`/api/kits/${kit.id}/fix`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ part: tab, index: i }) });
    const j = await res.json().catch(() => ({ error: "The suggestion failed. Try again." }));
    setFixes((f) => ({ ...f, [fixKey(i)]: res.ok ? j : { err: j.error ?? "The suggestion failed. Try again." } }));
  }
  const applyFix = (x: Fix) => kit && x.find != null && save(kit.parts[tab].replace(x.find, x.replace ?? ""));
  async function copy() {
    if (!kit) return;
    await navigator.clipboard.writeText(kit.parts[tab]);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  const issues = kit?.checks[tab] ?? [];
  const review = kit && (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {KIT_PARTS.map((p) => (
          <button key={p} onClick={() => pick(p)} className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-medium ${tab === p ? "border-navy-900 text-navy-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {KIT_LABEL[p]}{kit.checks[p]?.length ? <span className="ml-1 chip bg-amber-50 text-amber-800">{kit.checks[p].length}</span> : null}
          </button>
        ))}
      </div>
      {issues.length ? (
        <ul className="space-y-1 rounded-lg bg-amber-50/70 p-3 text-xs ring-1 ring-amber-200">
          {issues.map((x, i) => {
            const f = fixes[fixKey(i)];
            return (
              <li key={i} className="space-y-1.5">
                <div><span className="chip mr-1 bg-white text-amber-800">{KIND_LABEL[x.kind]}</span><b>{x.text}</b>: {x.detail}{draft == null && !f?.find && <button className="ml-2 font-medium text-navy-900 underline disabled:opacity-50" disabled={f?.busy || busy} onClick={() => suggest(i)}>{f?.busy ? "Writing a fix…" : "Suggest a fix"}</button>}</div>
                {f?.err && <p className="text-red-700">{f.err}</p>}
                {f?.find != null && (
                  <div className="space-y-2 rounded-md bg-white p-2.5 ring-1 ring-amber-200">
                    <p className="whitespace-pre-wrap text-slate-400 line-through">{f.find}</p>
                    <p className="whitespace-pre-wrap text-slate-800">{f.replace}</p>
                    {f.why && <p className="text-slate-500">{f.why}</p>}
                    <div className="flex gap-2"><button className="btn-primary !py-1 !text-xs" disabled={busy} onClick={() => applyFix(f)}>{busy ? "Applying…" : "Apply"}</button><button className="btn-ghost !py-1 !text-xs" disabled={busy} onClick={() => suggest(i)}>Try another</button><button className="btn-ghost !py-1 !text-xs" disabled={busy} onClick={() => setFixes((m) => { const n = { ...m }; delete n[fixKey(i)]; return n; })}>Dismiss</button></div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-xs text-emerald-700">✓ Passes the language and fact checks.</p>}
      {draft == null ? (
        <pre className="max-h-[560px] overflow-auto rounded-lg bg-slate-50 p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-slate-800">{kit.parts[tab]}</pre>
      ) : (
        <textarea className="input min-h-[420px] text-[13px] leading-relaxed" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit ${KIT_LABEL[tab]}`} />
      )}
      <div className="flex flex-wrap gap-2">
        {draft == null ? (
          <>
            <button className="btn-primary" onClick={() => setDraft(kit.parts[tab])}>Edit</button>
            <button className="btn-ghost" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
            <a className="btn-ghost" href={`/api/kits/${kit.id}/export?part=${tab}&format=docx`}>Word</a>
            <a className="btn-ghost" href={`/api/kits/${kit.id}/export?part=${tab}&format=pdf`}>PDF</a>
            {saved && <span className="self-center text-xs text-emerald-700">✓ Saved. Your downloads now use this version.</span>}
          </>
        ) : (
          <>
            <button className="btn-primary" disabled={busy || !draft.trim()} onClick={() => save()}>{busy ? "Saving and checking…" : "Save changes"}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</button>
            <span className="self-center text-xs text-slate-500">Saving re-runs the checks. Keep every title, date, employer and result true to your resume.</span>
          </>
        )}
      </div>
    </div>
  );
  if (embedded) return <div className="space-y-3 text-sm">{err && <p className="text-red-700">{err}</p>}{review}</div>;
  return (
    <section id="kit" className="card scroll-mt-4 border-gold-500/50">
      <div className="card-h"><h2 className="card-t">Application Kit</h2>{kit && <span className="text-xs text-slate-500">Built {dateTime(kit.createdAt)}</span>}</div>
      <div className="px-5 pb-5 space-y-3 text-sm">
        <p className="text-slate-600">One click writes a tailored resume, a Why Me letter, a point of view with a 30-60-90 plan, notes for each person on the hiring team, and copy-ready form answers. It uses only facts from your resume; the checks flag anything that is not there and any language your brief rules out.</p>
        {!configured ? <p className="text-amber-700">Add ANTHROPIC_API_KEY to the web service to turn this on.</p> : resumes.length === 0 ? <p className="muted">Upload your resume in the <Link className="link" href="/documents">Resume Library</Link> first.</p> : (
          <div className="flex flex-wrap items-center gap-2">
            <select className="input max-w-xs" value={docId} onChange={(e) => setDocId(e.target.value)}><option value="">Base resume: newest original</option>{resumes.map((r) => <option key={r.id} value={r.id}>{r.name}{r.version ? ` (${r.version})` : ""}</option>)}</select>
            <button className="btn-gold" disabled={busy} onClick={build}>{busy ? "Building… about a minute" : kit ? "Build a new kit" : "Build my kit"}</button>
            {kits.length > 1 && <select className="input max-w-[220px]" value={kitId} onChange={(e) => { setKitId(e.target.value); setDraft(null); }}>{kits.map((k, i) => <option key={k.id} value={k.id}>{i === 0 ? "Latest" : "Earlier"} kit · {dateTime(k.createdAt)}</option>)}</select>}
          </div>
        )}
        {err && <p className="text-red-700">{err}</p>}
        {review}
      </div>
    </section>
  );
}
