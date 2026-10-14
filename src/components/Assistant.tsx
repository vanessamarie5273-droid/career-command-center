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

// Minimal, safe markdown: links (internal or https), bold, bullets. Everything else is text.
function render(md: string) {
  return md.split("\n").map((line, i) => {
    const parts: React.ReactNode[] = [];
    const re = /\[([^\]]+)\]\(((?:\/[\w\-/?=&%.]*)|(?:https:\/\/[^\s)]+))\)|\*\*([^*]+)\*\*/g;
    let last = 0, m: RegExpExecArray | null, k = 0;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      if (m[1]) parts.push(m[2].startsWith("/") ? <Link key={k++} className="link" href={m[2]}>{m[1]}</Link> : <a key={k++} className="link" href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]} ↗</a>);
      else parts.push(<b key={k++}>{m[3]}</b>);
      last = m.index + m[0].length;
    }
    parts.push(line.slice(last));
    const bullet = /^\s*([-*•]|\d+\.)\s+/.test(line);
    return <div key={i} className={bullet ? "pl-4 -indent-3" : line.startsWith("#") ? "font-semibold mt-2" : ""}>{bullet ? parts.map((p, j) => (j === 0 && typeof p === "string" ? p.replace(/^\s*[-*•]\s+/, "• ") : p)) : line.startsWith("#") ? line.replace(/^#+\s*/, "") : parts}{line === "" ? " " : null}</div>;
  });
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
              {m.role === "user" ? m.content : <>{render(m.content)}<div className="mt-2"><button disabled={m.saved} onClick={() => save(i)} className="btn-ghost !py-0.5 text-xs">{m.saved ? "Saved to CRM (activity + task)" : "Save recommendation to CRM"}</button></div></>}
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
