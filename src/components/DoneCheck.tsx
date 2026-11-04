"use client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

/**
 * A to-do row on the Command Center with a round check button. Checking it marks the task (or the application's
 * next action) done, fades the row, and refreshes the list so it drops out.
 */
export default function DoneCheck({ kind, id, label, children }: { kind: "task" | "followup"; id: string; label: string; children: ReactNode }) {
  const r = useRouter();
  const [state, setState] = useState<"open" | "saving" | "done" | "error">("open");
  async function check() {
    if (state === "saving" || state === "done") return;
    setState("saving");
    const res = await fetch("/api/todos/done", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }) }).catch(() => null);
    if (!res?.ok) { setState("error"); return; }
    setState("done");
    r.refresh();
  }
  const done = state === "done" || state === "saving";
  return (
    <li className={`flex items-center gap-1 transition-opacity ${done ? "opacity-50" : ""}`}>
      <button type="button" onClick={check} disabled={done} aria-label={`Mark done: ${label}`} title={state === "error" ? "Could not save. Try again." : "Mark done"}
        className={`group/check -ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-emerald-50 ${state === "error" ? "text-rose-600" : "text-slate-300 hover:text-emerald-600"}`}>
        <span className={`flex h-[20px] w-[20px] items-center justify-center rounded-full ring-[1.5px] ${done ? "bg-emerald-500 text-white ring-emerald-500" : "ring-current"}`}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={done ? "" : "opacity-0 group-hover/check:opacity-100"}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </span>
      </button>
      <div className={`min-w-0 flex-1 ${done ? "[&_.todo-title]:line-through" : ""}`}>{children}</div>
    </li>
  );
}
