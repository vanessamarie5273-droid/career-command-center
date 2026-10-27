"use client";
import { useState } from "react";
import { MOCK_FINISH, MOCK_OPENER, PERSONAS, PERSONA_LABEL, type MockMessage, type Persona } from "@/lib/personas";
import { dateTime } from "@/lib/format";

export type PrepRow = { id: string; kind: "prep" | "mock" | "followup"; persona: Persona; input: string | null; output: string | null; messages: MockMessage[] | null; createdAt: string };

const KIND_LABEL = { prep: "Prep sheet", mock: "Mock interview", followup: "Follow-up" } as const;

export default function InterviewPrep({ applicationId, preps: initial, configured }: { applicationId: string; preps: PrepRow[]; configured: boolean }) {
  const [preps, setPreps] = useState(initial);
  const [openId, setOpenId] = useState(initial[0]?.id ?? "");
  const [persona, setPersona] = useState<Persona>("hiring_manager");
  const [notes, setNotes] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const open = preps.find((p) => p.id === openId);
  const mockDone = open?.kind === "mock" && (open.messages ?? []).some((m) => m.content === MOCK_FINISH || /OVERALL DEBRIEF/.test(m.content));

  async function call(url: string, body: object, label: string) {
    setBusy(label); setErr(null);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({ error: "Request failed" }));
    setBusy(null);
    if (!res.ok) { setErr(j.error ?? "Request failed"); return null; }
    return j as PrepRow;
  }
  async function start(kind: PrepRow["kind"]) {
    const p = await call("/api/interview", { applicationId, kind, persona, notes: kind === "followup" ? notes : undefined }, kind);
    if (p) { setPreps([p, ...preps]); setOpenId(p.id); if (kind === "followup") setNotes(""); }
  }
  async function turn(finish = false) {
    if (!open) return;
    const p = await call(`/api/interview/${open.id}`, finish ? { finish: true } : { answer }, finish ? "finish" : "turn");
    if (p) { setPreps(preps.map((x) => (x.id === p.id ? p : x))); if (!finish) setAnswer(""); }
  }

  return (
    <section id="interview" className="card scroll-mt-4 border-gold-500/50">
      <div className="card-h"><h2 className="card-t">Interview prep</h2></div>
      <div className="px-5 pb-5 space-y-3 text-sm">
        <p className="text-slate-600">Prep for each person on the hiring team: likely questions with drafted answers, a mock interview that scores every answer on results, numbers, stakes and brevity, and a follow-up email from your notes. Answers use only facts from your resume.</p>
        {!configured ? <p className="text-amber-700">Add ANTHROPIC_API_KEY to the web service to turn this on.</p> : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-auto max-w-sm" value={persona} onChange={(e) => setPersona(e.target.value as Persona)}>{PERSONAS.map((p) => <option key={p} value={p}>Interviewing with: {PERSONA_LABEL[p]}</option>)}</select>
              <button className="btn-gold" disabled={!!busy} onClick={() => start("prep")}>{busy === "prep" ? "Writing… about a minute" : "Prep sheet"}</button>
              <button className="btn-primary" disabled={!!busy} onClick={() => start("mock")}>{busy === "mock" ? "Starting…" : "Mock interview"}</button>
            </div>
            <details className="rounded-lg bg-slate-50 p-3">
              <summary className="cursor-pointer font-medium text-slate-700">After the interview: write the follow-up</summary>
              <textarea className="input mt-2" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Who you met, what they said they need, questions they asked, signals, next steps" />
              <button className="btn-ghost mt-2" disabled={!!busy || !notes.trim()} onClick={() => start("followup")}>{busy === "followup" ? "Writing…" : "Write follow-up email"}</button>
              <p className="mt-1 text-xs text-slate-500">Your notes are also saved to this application&apos;s activity.</p>
            </details>
          </>
        )}
        {err && <p className="text-red-700">{err}</p>}
        {preps.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {preps.map((p) => <button key={p.id} onClick={() => setOpenId(p.id)} className={`chip ring-1 ${p.id === openId ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-300"}`}>{KIND_LABEL[p.kind]} · {PERSONA_LABEL[p.persona]} · {dateTime(p.createdAt)}</button>)}
          </div>
        )}
        {open && open.kind !== "mock" && (
          <div className="space-y-2">
            {open.input && <details><summary className="cursor-pointer text-xs text-slate-500">Your notes</summary><pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-slate-600">{open.input}</pre></details>}
            <pre className="max-h-[620px] overflow-auto rounded-lg bg-slate-50 p-4 text-[13px] leading-relaxed whitespace-pre-wrap font-sans text-slate-800">{open.output}</pre>
            <button className="btn-ghost" onClick={() => navigator.clipboard.writeText(open.output ?? "")}>Copy</button>
          </div>
        )}
        {open?.kind === "mock" && (
          <div className="space-y-2">
            <div className="max-h-[620px] space-y-2 overflow-auto rounded-lg bg-slate-50 p-3">
              {(open.messages ?? []).filter((m) => m.content !== MOCK_OPENER).map((m, i) => (
                <div key={i} className={m.role === "assistant" ? "mr-10" : "ml-10"}>
                  <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{m.role === "assistant" ? PERSONA_LABEL[open.persona] : "You"}</div>
                  <pre className={`whitespace-pre-wrap rounded-lg p-3 font-sans text-[13px] leading-relaxed ${m.role === "assistant" ? "bg-white ring-1 ring-slate-200 text-slate-800" : "bg-navy-900 text-white"}`}>{m.content === MOCK_FINISH ? "End the interview and debrief me." : m.content}</pre>
                </div>
              ))}
            </div>
            {!mockDone && (
              <>
                <textarea className="input" rows={4} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer as you would out loud. Aim for 60 to 90 seconds." />
                <div className="flex gap-2">
                  <button className="btn-primary" disabled={!!busy || !answer.trim()} onClick={() => turn()}>{busy === "turn" ? "Scoring…" : "Send answer"}</button>
                  <button className="btn-ghost" disabled={!!busy} onClick={() => turn(true)}>{busy === "finish" ? "Debriefing…" : "Finish and debrief"}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
