import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader, Card, StatusDot } from "@/components/ui";
import AutoField from "@/components/AutoField";
import { RestoreForm, PasswordForm, RescoreButton } from "@/components/SettingsWidgets";
import { PROFILE } from "@/lib/profile";
import { WEIGHTS, CRITERION_LABEL, type Criterion } from "@/lib/scoring";
import { emailConfigured } from "@/lib/email";
import { assistantConfigured, MODEL } from "@/lib/assistant";
import { dateTime } from "@/lib/format";
import { outlookConfigured } from "@/lib/mail/outlook";
import { googleJobsConfigured } from "@/lib/ingest/googleJobs";
import { OutlookControls } from "@/components/MailWidgets";

export const metadata = { title: "Settings & Integrations" };

export default async function Settings({ searchParams }: { searchParams: Promise<{ outlook?: string; outlook_error?: string; note?: string }> }) {
  const s = await getSession();
  const sp = await searchParams;
  const [user, statuses, feeds, lastRun, mail, emailCount, lastHourly] = await Promise.all([
    prisma.user.findUnique({ where: { id: s!.sub } }),
    prisma.integrationStatus.findMany(),
    prisma.company.findMany({ select: { id: true, name: true, atsProvider: true, atsToken: true, atsStatus: true, atsError: true, atsCheckedAt: true, totalOpenings: true, careersUrl: true }, orderBy: [{ atsStatus: "asc" }, { name: "asc" }] }),
    prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.mailAccount.findUnique({ where: { id: "outlook" } }),
    prisma.emailEvent.count(),
    prisma.ingestionRun.findFirst({ where: { trigger: "hourly" }, orderBy: { startedAt: "desc" } }),
  ]);
  const outlookOk = !!mail && outlookConfigured();
  const st = (id: string) => statuses.find((x) => x.id === id);
  const byStatus = (k: string) => feeds.filter((f) => (f.atsStatus ?? "pending") === k).length;
  const integrations = [
    { name: "Database (PostgreSQL)", status: "connected", detail: "Persistent storage for all records and files", action: null },
    ...["greenhouse", "lever", "ashby", "smartrecruiters", "workday"].map((id) => ({ name: `${id[0].toUpperCase()}${id.slice(1)} job boards`, status: st(id)?.status ?? "not_configured", detail: st(id)?.detail ?? "Public first-party job board API; no credentials needed", action: null })),
    googleJobsConfigured() && (!st("google_jobs") || st("google_jobs")!.status === "not_configured")
      ? { name: "Google Jobs (via SerpApi)", status: "key set", detail: "Key is set. The first Google search runs at the end of the next scheduled refresh (hourly, 7 AM to 9 PM Arizona).", action: null }
      : { name: "Google Jobs (via SerpApi)", status: st("google_jobs")?.status ?? "not_configured", detail: st("google_jobs") ? `${st("google_jobs")!.detail ?? ""}${st("google_jobs")!.status !== "not_configured" ? ` · last search ${dateTime(st("google_jobs")!.checkedAt)}` : ""}` : "Set SERPAPI_API_KEY to add Phoenix and remote sales roles from Google Jobs", action: st("google_jobs")?.status === "connected" ? "Searches once a day" : "Free key at serpapi.com (see SETUP.md)" },
    { name: "Scheduled daily refresh", status: lastRun && lastRun.startedAt > new Date(Date.now() - 36 * 3600_000) ? "connected" : "not_configured", detail: lastRun ? `Last run ${dateTime(lastRun.startedAt)} (${lastRun.trigger}, ${lastRun.status})` : "No run yet", action: "Configured as a cron job on the host (see SETUP.md)" },
    { name: "Outlook (job inbox)", status: !outlookConfigured() ? "not_configured" : !mail ? "not_configured" : mail.status === "error" ? "error" : "connected", detail: !outlookConfigured() ? "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET" : mail ? `${mail.email} · ${mail.lastSyncNote ?? "connected"}` : "Not connected", action: !outlookConfigured() ? "Register the app with Microsoft (SETUP.md, Connect Outlook)" : !mail || mail.status === "error" ? "Connect Outlook below" : null },
    { name: "Instant job alerts", status: !user?.instantAlerts ? "not_configured" : lastHourly && lastHourly.startedAt > new Date(Date.now() - 18 * 3600_000) ? "connected" : "degraded", detail: user?.instantAlerts ? `Hourly 7 AM–9 PM Arizona for new roles scoring ${user.alertMinScore}+ · ${lastHourly ? `last hourly run ${dateTime(lastHourly.startedAt)} (${lastHourly.status})` : "no hourly run yet"}` : "Off: new roles wait for the morning briefing", action: user?.instantAlerts && !lastHourly ? "Runs from the ccc-hourly cron job (see SETUP.md)" : null },
    { name: "Email alerts (Resend)", status: emailConfigured() ? st("email")?.status === "error" ? "error" : "connected" : outlookOk ? "connected" : "not_configured", detail: emailConfigured() ? st("email")?.detail ?? "Configured" : outlookOk ? `Not needed: alerts and the briefing are sent from your Outlook (${mail!.email})` : "Set RESEND_API_KEY and ALERT_FROM_EMAIL, or connect Outlook", action: emailConfigured() || outlookOk ? null : "Connect Outlook below" },
    { name: "AI assistant (Anthropic)", status: assistantConfigured() ? (st("anthropic")?.status === "error" ? "error" : "connected") : "not_configured", detail: assistantConfigured() ? `${MODEL} · ${st("anthropic")?.status === "not_configured" ? "key set, ready" : st("anthropic")?.detail ?? "ready"}` : "Set ANTHROPIC_API_KEY", action: assistantConfigured() ? null : "Create an API key at console.anthropic.com" },
    { name: "LinkedIn", status: st("linkedin")?.status === "connected" ? "connected" : "degraded", detail: st("linkedin")?.status === "connected" ? st("linkedin")!.detail : "Limited by LinkedIn's API policy: connections via official CSV export; profile and company links open in your browser", action: "Import Connections.csv in Network & Contacts" },
    { name: "Mobile notifications", status: "not_configured", detail: "Install the site to your phone's home screen; email alerts reach your phone today", action: null },
  ];
  return (
    <>
      <PageHeader title="Settings & Integrations" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <Card title="Integration health" className="lg:col-span-2">
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Integration</th><th>Status</th><th>Detail</th><th>Required action</th></tr></thead>
            <tbody>{integrations.map((i) => <tr key={i.name}><td className="font-medium">{i.name}</td><td className="whitespace-nowrap"><StatusDot status={i.status} /> {i.status.replace("_", " ")}</td><td className="text-[13px] text-slate-600">{i.detail}</td><td className="text-[13px]">{i.action ?? "—"}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card title="Alerts">
          <div className="space-y-3">
            {mail?.email
              ? <div><div className="label">Briefing &amp; alert email</div><div className="flex items-center gap-2 rounded-lg bg-[#f1edff] px-3 py-2 text-[14px] font-semibold text-[#4424e6] ring-1 ring-[#d4c8ff]"><StatusDot status="connected" />{mail.email}<span className="ml-auto text-[12px] font-medium text-slate-500">Outlook</span></div></div>
              : <AutoField endpoint="/api/settings" field="alertEmail" label="Briefing & alert email" value={user?.alertEmail} />}
            <AutoField endpoint="/api/settings" field="alertMinScore" type="number" label="Alert me for new jobs scoring at least" value={user?.alertMinScore} />
            <AutoField endpoint="/api/settings" field="instantAlerts" type="checkbox" label="Email me within the hour when a role at or above that score is posted" value={user?.instantAlerts} />
            <p className="text-[13px] text-slate-500">Feeds refresh every hour from 7 AM to 9 PM Arizona. Roles found overnight are in the 6 AM briefing.</p>
          </div>
        </Card>
      </div>
      <div id="outlook" className="scroll-mt-20" />
      <Card title="Outlook (your job inbox)" icon="mail" tone="sky" className="mb-4" action={mail ? <span className="text-[13px] text-slate-500">{mail.email}</span> : null}>
        {sp.outlook === "connected" && <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Outlook connected. {sp.note}</p>}
        {sp.outlook_error && <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{sp.outlook_error}</p>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2 text-sm text-slate-700 space-y-1.5">
            <p>When a company you&apos;re in process with emails you, the app reads it and moves the application: confirmation → Applied, a recruiter reply or interview request → Recruiter contact or Interviewing, an offer → Offer, a rejection → Rejected. Each move shows on the Command Center with an Undo.</p>
            <p>People who write to you are saved as contacts, and follow-ups you draft from an application go to your Outlook Drafts, as replies in the recruiter&apos;s thread when there is one. Nothing is ever sent for you: you review and send every email. The only emails the app sends are your own alerts, to you.</p>
            {mail && <p className="text-[13px] text-slate-500">Last check: {mail.lastSyncAt ? dateTime(mail.lastSyncAt) : "never"}{mail.lastSyncNote ? ` · ${mail.lastSyncNote}` : ""} · {emailCount} company emails read so far. Checked every hour with the job feeds.</p>}
            {mail?.status === "error" && <p className="text-[13px] text-red-700">Microsoft sign-in needs renewing: click Reconnect.</p>}
          </div>
          <div>{outlookConfigured() ? <OutlookControls connected={!!mail} /> : <p className="text-[13px] text-slate-600">One-time setup first: register the Command Center with Microsoft and add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET to Render. Steps are in SETUP.md under “Connect Outlook”.</p>}</div>
        </div>
      </Card>
      <Card title={`Job feeds by company · ${byStatus("ok")} live · ${byStatus("error")} errors · ${byStatus("not_found")} no public board · ${byStatus("unsupported")} careers-site only · ${byStatus("pending")} pending`} sub="Every board refreshes on its own each hour, 6 AM to 9 PM Arizona time. Refresh one company now from its page." className="mb-4">
        <div className="max-h-[420px] overflow-auto"><table className="tbl"><thead><tr><th>Company</th><th>Provider</th><th>Status</th><th>Openings</th><th>Checked</th><th>Error / note</th></tr></thead>
          <tbody>{feeds.map((f) => <tr key={f.id}><td><Link className="link" href={`/companies/${f.id}`}>{f.name}</Link></td><td className="text-[13px]">{f.atsProvider === "NONE" ? "—" : `${f.atsProvider.toLowerCase()} · ${f.atsToken}`}</td><td className="text-[13px] whitespace-nowrap"><StatusDot status={f.atsStatus} /> {f.atsStatus ?? "pending"}</td><td>{f.totalOpenings ?? "—"}</td><td className="text-[13px] whitespace-nowrap">{dateTime(f.atsCheckedAt)}</td><td className="text-[13px] text-slate-500 max-w-md">{f.atsError}{(f.atsStatus === "not_found" || f.atsStatus === "unsupported") && f.careersUrl && <> · <a className="link" href={f.careersUrl} target="_blank" rel="noopener noreferrer">check careers site ↗</a></>}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card title="Data export & restore">
          <div className="space-y-2 text-sm">
            <a className="btn-primary" href="/api/export">Download full backup (JSON)</a>
            <div className="flex flex-wrap gap-2 text-[13px]">{["jobs", "applications", "companies", "contacts"].map((w) => <a key={w} className="link" href={`/api/export?format=csv&what=${w}`}>{w}.csv</a>)}</div>
            <RestoreForm />
          </div>
        </Card>
        <Card title="Matching model" icon="layers" dark>
          <ul className="space-y-2">{(Object.keys(WEIGHTS) as Criterion[]).map((k) => <li key={k}><div className="flex justify-between text-[14px]"><span className="text-white/90">{CRITERION_LABEL[k]}</span><b className="tabular-nums">{WEIGHTS[k]}%</b></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-white to-[#f6d0f2]" style={{ width: `${(WEIGHTS[k] / 25) * 100}%` }} /></div></li>)}</ul>
          <p className="mt-3 text-[13px] text-white/75">Tier 1 ≥ 72 with an excellent role fit; Tier 2 ≥ 60; Tier 3 otherwise. Relocation, stretch and excluded roles are ranked separately.</p>
          <div className="mt-3 [&_.btn-gold]:bg-none [&_.btn-gold]:bg-white [&_.btn-gold]:text-[#5D36FF]"><RescoreButton /></div>
        </Card>
        <Card title="Account & security">
          <p className="text-sm">Signed in as <b>{user?.email}</b> ({user?.role.toLowerCase()})</p>
          <PasswordForm />
          <ul className="mt-3 text-[13px] text-slate-500 list-disc ml-4 space-y-0.5"><li>HTTPS enforced by the host, HSTS enabled</li><li>Passwords hashed with bcrypt; 5 failed attempts lock sign-in for 15 minutes</li><li>Sessions are signed, HTTP-only cookies</li><li>API keys live only in server environment variables</li><li>Every change is recorded in the audit log</li></ul>
        </Card>
      </div>
      <Card title="Your profile (basis of all matching)" className="mt-4">
        <p className="text-sm text-slate-700">{PROFILE.summary}</p>
        <p className="mt-2 text-[13px] text-slate-500">Target roles: {PROFILE.targetRoles.join(" · ")}. Location: {PROFILE.homeBase}; remote U.S., Southwest, or hybrid near Phoenix. Clearance-required roles excluded.</p>
      </Card>
    </>
  );
}
