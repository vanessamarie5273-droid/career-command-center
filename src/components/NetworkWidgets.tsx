"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { referralNote, type PersonType } from "@/lib/referral";

type Opening = { title: string; applied: boolean };

/** "Reach out" on a connection: a note about the opening she can edit, copy straight into LinkedIn, and log as sent. */
export function ReachOut({ contactId, first, company, type, linkedinUrl, email, openings }: { contactId: string; first: string; company: string; type: PersonType; linkedinUrl: string | null; email: string | null; openings: Opening[] }) {
  const r = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const note = (i: number) => referralNote({ first, company, type, role: openings[i]?.title, applied: openings[i]?.applied });
  const [text, setText] = useState(() => note(0));
  const [state, setState] = useState<"idle" | "copied" | "saving" | "logged">("idle");

  async function copy() {
    await navigator.clipboard.writeText(text).catch(() => {});
    setState("copied");
  }
  function copyAndOpen() {
    void copy();
    if (linkedinUrl) window.open(linkedinUrl, "_blank", "noopener,noreferrer");
  }
  async function logSent() {
    setState("saving");
    const followUpAt = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = await fetch("/api/touches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, channel: "linkedin", message: text, followUpAt }) });
    if (!res.ok) { setState("idle"); alert("Couldn't log that. Try again."); return; }
    setState("logged");
    r.refresh();
  }

  if (!open) return <button className="btn-gold !py-1.5 shrink-0 whitespace-nowrap" onClick={() => setOpen(true)}>Reach Out</button>;
  return (
    <div className="mt-2 basis-full sm:pl-[52px]"><div className="rounded-xl bg-[#f3efff] p-3 ring-1 ring-[#d9cfff]">
      {openings.length > 1 && (
        <select aria-label="Opening to ask about" className="input mb-2 bg-white" value={pick} onChange={(e) => { const i = Number(e.target.value); setPick(i); setText(note(i)); }}>
          {openings.map((o, i) => <option key={o.title + i} value={i}>{o.applied ? "Applied: " : ""}{o.title}</option>)}
          <option value={openings.length}>No specific role</option>
        </select>
      )}
      <textarea aria-label="Message" className="input bg-white text-[15px] leading-relaxed" rows={7} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {linkedinUrl && <button className="btn-gold" onClick={copyAndOpen}>Copy & Open LinkedIn</button>}
        <button className="btn-ghost" onClick={copy}>{state === "copied" ? "Copied" : "Copy"}</button>
        {email && <a className="btn-ghost" href={`mailto:${email}?subject=${encodeURIComponent(`${company} opening`)}&body=${encodeURIComponent(text)}`}>Email</a>}
        <button className="btn-primary" disabled={state === "saving" || state === "logged"} onClick={logSent}>{state === "logged" ? "Logged · Follow-Up in 5 Days" : state === "saving" ? "Logging…" : "Mark as Sent"}</button>
        <button className="ml-auto text-[13px] font-medium text-slate-500 hover:text-navy-900" onClick={() => setOpen(false)}>Close</button>
      </div>
    </div></div>
  );
}
