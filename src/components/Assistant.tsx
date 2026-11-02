"use client";
import Link from "next/link";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string; saved?: boolean };
const EXAMPLES = [
  "Show me the 15 best jobs I should apply for today.",
  "Which healthcare AI companies have the highest compensation potential?",
  "Show me remote Enterprise Account Executive openings above $250,000 OTE.",
  "Which Tier 1 companies have not received an application?",
  "Compare Workday, Databricks, and ServiceNow.",
  "Find the relevant hiring leaders at my top 10 companies.",
  "Which companies added suitable positions this week?",
  "Which applications are overdue for follow-up?",
];

// Minimal, safe markdown: links (internal or https), bold (which may hold links), bullets, headings and tables. Everything else is text.
function inline(text: string, key = 0): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(((?:\/[\w\-/?=&%.#]*)|(?:https:\/\/[^\s)]+))\)/g;
  let last = 0, m: RegExpExecArray | null, k = key;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] != null) parts.push(<b key={k++}>{inline(m[1], k * 100)}</b>);
    else parts.push(m[3].startsWith("/") ? <Link key={k++} className="link" href={m[3]}>{m[2]}</Link> : <a key={k++} className="link" href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]} ↗</a>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return parts;
}

const cells = (row: string) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function render(md: string) {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const [head, ...rest] = rows.map(cells).filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c)));
      out.push(
        <div key={i} className="my-2 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="w-full text-[14px]">
            <thead className="bg-slate-50 text-left text-[13px] font-semibold text-slate-600"><tr>{head?.map((c, j) => <th key={j} className="px-3 py-2">{inline(c)}</th>)}</tr></thead>
            <tbody>{rest.map((r, ri) => <tr key={ri} className="border-t border-slate-100 align-top">{r.map((c, j) => <td key={j} className="px-3 py-2">{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^#+\s/.test(line)) { out.push(<div key={i} className="mt-3 text-[15px] font-semibold text-navy-950">{inline(line.replace(/^#+\s*/, ""))}</div>); continue; }
    const bullet = line.match(/^\s*(?:[-*•])\s+(.*)$/);
    if (bullet) { out.push(<div key={i} className="flex gap-2 pl-1"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" /><span>{inline(bullet[1])}</span></div>); continue; }
    const num = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (num) { out.push(<div key={i} className="mt-3 flex gap-2"><span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[12px] font-semibold text-gold-300">{num[1]}</span><span className="font-medium text-navy-950">{inline(num[2])}</span></div>); continue; }
    out.push(line.trim() === "" ? <div key={i} className="h-2" /> : <div key={i}>{inline(line)}</div>);
  }
  return out;
}

export default function Assistant({ enabled }: { enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(text: string) {
    if (!text.trim()) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next); setQ(""); setBusy(true);
    const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }) });
    const j = await res.json().catch(() => ({ error: "Request failed" }));
    setBusy(false);
    setMsgs([...next, { role: "assistant", content: res.ok ? j.text : `⚠ ${j.error}` }]);
  }
  async function save(i: number) {
    const m = msgs[i];
    await fetch("/api/activities", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "assistant_recommendation", body: `Q: ${msgs[i - 1]?.content}\n\n${m.content}` }) });
    await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: `Review assistant recommendation: ${msgs[i - 1]?.content.slice(0, 80)}`, dueAt: new Date().toISOString(), source: "assistant" }) });
    setMsgs(msgs.map((x, k) => (k === i ? { ...x, saved: true } : x)));
  }
  return (
    <div className="grid lg:grid-cols-[1fr_280px] gap-4">
      <div className="card flex flex-col min-h-[60vh]">
        <div className="flex-1 space-y-4 p-5 overflow-y-auto">
          {msgs.length === 0 && <p className="text-sm text-slate-500">Ask anything about your companies, jobs, applications or documents.</p>}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-xl bg-navy-900 px-4 py-2 text-sm text-white" : "max-w-[95%] text-sm leading-relaxed text-slate-800"}>
              {m.role === "user" ? m.content : <>{render(m.content)}<div className="mt-2"><button disabled={m.saved} onClick={() => save(i)} className="btn-ghost !py-0.5 text-[13px]">{m.saved ? "Saved to CRM (activity + task)" : "Save recommendation to CRM"}</button></div></>}
            </div>
          ))}
          {busy && <p className="text-sm text-slate-500 animate-pulse">Checking your records…</p>}
        </div>
        <form className="border-t border-slate-200 p-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} disabled={!enabled || busy} className="input" placeholder={enabled ? "Ask the Command Center…" : "Assistant not configured"} />
          <button className="btn-primary" disabled={!enabled || busy}>Send</button>
        </form>
      </div>
      <div className="card p-4 h-fit"><div className="card-t mb-2">Try</div><ul className="space-y-1.5 text-sm">{EXAMPLES.map((e) => <li key={e}><button disabled={!enabled || busy} onClick={() => send(e)} className="text-left link">{e}</button></li>)}</ul></div>
    </div>
  );
}
