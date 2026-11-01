import { Card } from "@/components/ui";
import { DraftButton } from "@/components/MailWidgets";
import type { outreachPlan, Recipient } from "@/lib/outreach";

type Plan = Awaited<ReturnType<typeof outreachPlan>>;

function Who({ r, role }: { r: Recipient | null; role: string }) {
  if (!r) return <p className="text-xs text-slate-500">No {role} known yet. The draft opens with “Hi [Name],” and no recipient, so you add them in Outlook.</p>;
  return <p className="text-xs text-slate-600">To <b>{r.name ?? r.email}</b>{r.email && r.name ? ` <${r.email}>` : ""} · {r.source}{r.linkedinUrl && <> · <a className="link" href={r.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn ↗</a></>}</p>;
}

/** Application page: the two follow-ups after applying, saved as Outlook drafts, and who to send them to. */
export default function FollowUpEmails({ plan, outlook, ai }: { plan: Plan; outlook: boolean; ai: boolean }) {
  const id = plan.app.id;
  const nobody = !plan.hiringManager;
  return (
    <Card title="Follow-up emails" icon="mail" tone="sky" sub="Written from your Application Kit, saved to your Outlook Drafts for you to review and send">
      {!outlook ? <p className="text-sm text-slate-600">Connect Outlook in <a className="link" href="/settings#outlook">Settings</a> and these drafts land in your Drafts folder. Recruiter replies will also move this application forward on their own.</p>
        : !ai ? <p className="text-sm text-slate-600">Follow-up drafts need ANTHROPIC_API_KEY on the web service.</p> : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="font-medium text-sm">Hiring manager note <span className="text-xs font-normal text-slate-500">· the week you apply</span></div>
            <Who r={plan.hiringManager} role="hiring manager" />
            <DraftButton applicationId={id} kind="hiring_manager" label="Draft hiring manager note" />
          </div>
          <div className="space-y-1.5">
            <div className="font-medium text-sm">Recruiter follow-up <span className="text-xs font-normal text-slate-500">· 5 days after applying</span></div>
            <Who r={plan.recruiter} role="recruiter" />
            <DraftButton applicationId={id} kind="recruiter" label="Draft recruiter follow-up" />
          </div>
        </div>
      )}
      {nobody && (
        <div className="mt-4 border-t border-slate-100 pt-3 text-sm">
          <div className="label">No hiring manager named? Who to send it to</div>
          <ol className="list-decimal ml-5 space-y-1.5 text-[13px] text-slate-700">
            <li>
              The sales leader over this segment.{" "}
              {plan.leaders.length ? <>From the company profile (AI-compiled, check the title is current): {plan.leaders.map((l, i) => <span key={i}>{i ? "; " : ""}{l.linkedinUrl ? <a className="link" href={l.linkedinUrl} target="_blank" rel="noopener noreferrer">{l.name}</a> : <b>{l.name}</b>}, {l.title}</span>)}.</> : "None recorded yet."}{" "}
              Search LinkedIn: {plan.searches.map((s, i) => <span key={s.label}>{i ? " · " : ""}<a className="link" href={s.url} target="_blank" rel="noopener noreferrer">{s.label} ↗</a></span>)}
            </li>
            <li>{plan.connections.length ? <>Your connections there, for an intro or referral: {plan.connections.map((c, i) => <span key={i}>{i ? ", " : ""}{c.linkedinUrl ? <a className="link" href={c.linkedinUrl} target="_blank" rel="noopener noreferrer">{c.name}</a> : c.name}{c.title ? ` (${c.title})` : ""}</span>)}. A referral puts your application in front of the hiring manager directly.</> : "No LinkedIn connections at this company in your contacts. Import Connections.csv in Network & Contacts to see who you know there."}</li>
            <li>Send the LinkedIn version of the note as a connection request to the leader you pick, and save the email draft for when you have their address. Don&apos;t guess addresses.</li>
            <li>Watch for the first human reply. Anyone from the company who writes to your Outlook is saved as a contact here, and the recruiter follow-up then goes to them, in their thread.</li>
          </ol>
        </div>
      )}
    </Card>
  );
}
