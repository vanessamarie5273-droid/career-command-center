import Link from "next/link";
import type { Application, Company, Job } from "@prisma/client";
import { Logo } from "@/components/ui";
import AutoField from "@/components/AutoField";
import { STAGES, date } from "@/lib/format";

export type AppRow = Application & { company: Company; job: Job | null; resume: { name: string } | null };

/** Applications with stage, next action and due date editable in place. */
export default function ApplicationsTable({ apps }: { apps: AppRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead><tr><th>Role</th><th>Stage</th><th>Applied</th><th>Applied on</th><th>Resume</th><th>Next action</th><th>Due</th><th>Interview</th><th>Posting</th></tr></thead>
        <tbody>{apps.map((a) => {
          const ep = `/api/applications/${a.id}`;
          return (
            <tr key={a.id}>
              <td className="min-w-[220px]"><Link href={`/applications/${a.id}`} className="font-medium hover:underline inline-flex items-center gap-2"><Logo src={a.company.logoUrl} name={a.company.name} size={18} />{a.title}</Link><div className="text-xs text-slate-500">{a.company.name}</div></td>
              <td className="min-w-[170px]"><AutoField endpoint={ep} field="stage" type="select" value={a.stage} options={STAGES.map(([k, l]) => [k, l])} /></td>
              <td><AutoField endpoint={ep} field="applied" type="checkbox" value={a.applied} /></td>
              <td className="whitespace-nowrap text-xs">{date(a.appliedAt)}</td>
              <td className="text-xs">{a.resume?.name ?? "—"}</td>
              <td className="min-w-[200px]"><AutoField endpoint={ep} field="nextAction" value={a.nextAction} placeholder="e.g. Follow up with recruiter" /></td>
              <td className="min-w-[140px]"><AutoField endpoint={ep} field="nextActionDue" type="date" value={a.nextActionDue?.toISOString()} /></td>
              <td className="text-xs whitespace-nowrap">{a.interviewAt ? date(a.interviewAt) : "—"}</td>
              <td>{a.job ? <a href={a.job.applyUrl} target="_blank" rel="noopener noreferrer" className="link text-xs">Open ↗</a> : <span className="text-xs text-slate-400">No posting</span>}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}
