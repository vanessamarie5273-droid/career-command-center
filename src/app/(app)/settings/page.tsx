import Link from "next/link";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { PageHeader, Card, StatusDot } from "@/components/ui";
import AutoField from "@/components/AutoField";
import { RestoreForm, PasswordForm, RescoreButton } from "@/components/SettingsWidgets";
import RefreshButton from "@/components/RefreshButton";
import { PROFILE } from "@/lib/profile";
import { WEIGHTS, CRITERION_LABEL, type Criterion } from "@/lib/scoring";
import { emailConfigured } from "@/lib/email";
import { assistantConfigured, MODEL } from "@/lib/assistant";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Settings & Integrations" };

export default async function Settings() {
  const s = await getSession();
  const [user, statuses, feeds, lastRun] = await Promise.all([
    prisma.user.findUnique({ where: { id: s!.sub } }),
    prisma.integrationStatus.findMany(),
    prisma.company.findMany({ select: { id: true, name: true, atsProvider: true, atsToken: true, atsStatus: true, atsError: true, atsCheckedAt: true, totalOpenings: true, careersUrl: true }, orderBy: [{ atsStatus: "asc" }, { name: "asc" }] }),
    prisma.ingestionRun.findFirst({ orderBy: { startedAt: "desc" } }),
  ]);
  const st = (id: string) => statuses.find((x) => x.id === id);
  const byStatus = (k: string) => feeds.filter((f) => (f.atsStatus ?? "pending") === k).length;
  const integrations = [
    { name: "Database (PostgreSQL)", status: "connected", detail: "Persistent storage for all records and files", action: null },
    ...["greenhouse", "lever", "ashby", "smartrecruiters", "workday"].map((id) => ({ name: `${id[0].toUpperCase()}${id.slice(1)} job boards`, status: st(id)?.status ?? "not_configured", detail: st(id)?.detail ?? "Public first-party job board API; no credentials needed", action: null })),
    { name: "Scheduled daily refresh", status: lastRun && lastRun.startedAt > new Date(Date.now() - 36 * 3600_000) ? "connected" : "not_configured", detail: lastRun ? `Last run ${dateTime(lastRun.startedAt)} (${lastRun.trigger}, ${lastRun.status})` : "No run yet", action: "Configured as a cron job on the host (see SETUP.md)" },
    { name: "Email alerts (Resend)", status: emailConfigured() ? st("email")?.status === "error" ? "error" : "connected" : "not_configured", detail: emailConfigured() ? st("email")?.detail ?? "Configured" : "Set RESEND_API_KEY and ALERT_FROM_EMAIL", action: emailConfigured() ? null : "Create a free Resend account and verify a sending domain" },
    { name: "AI assistant (Anthropic)", status: assistantConfigured() ? st("anthropic")?.status ?? "connected" : "not_configured", detail: assistantConfigured() ? `${MODEL} · ${st("anthropic")?.detail ?? "ready"}` : "Set ANTHROPIC_API_KEY", action: assistantConfigured() ? null : "Create an API key at console.anthropic.com" },
    { name: "LinkedIn", status: st("linkedin")?.status === "connected" ? "connected" : "degraded", detail: st("linkedin")?.status === "connected" ? st("linkedin")!.detail : "Limited by LinkedIn's API policy: connections via official CSV export; profile and company links open in your browser", action: "Import Connections.csv in Network & Contacts" },
    { name: "Mobile notifications", status: "not_configured", detail: "Install the site to your phone's home screen; email alerts reach your phone today", action: null },
  ];
  return (
    <>
      <PageHeader title="Settings & Integrations" />
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card title="Integration health" className="lg:col-span-2">
          <table className="tbl"><thead><tr><th>Integration</th><th>Status</th><th>Detail</th><th>Required action</th></tr></thead>
            <tbody>{integrations.map((i) => <tr key={i.name}><td className="font-medium">{i.name}</td><td className="whitespace-nowrap"><StatusDot status={i.status} /> {i.status.replace("_", " ")}</td><td className="text-xs text-slate-600">{i.detail}</td><td className="text-xs">{i.action ?? "—"}</td></tr>)}</tbody>
          </table>
        </Card>
        <Card title="Alerts">
          <div className="space-y-3">
            <AutoField endpoint="/api/settings" field="alertEmail" label="Briefing & alert email" value={user?.alertEmail} />
            <AutoField endpoint="/api/settings" field="alertMinScore" type="number" label="Alert me for new jobs scoring at least" value={user?.alertMinScore} />
            <p className="text-xs text-slate-500">The briefing is generated after each daily refresh from the refreshed records.</p>
          </div>
        </Card>
      </div>
      <Card title={`Job feeds by company · ${byStatus("ok")} live · ${byStatus("error")} errors · ${byStatus("not_found")} no public board · ${byStatus("unsupported")} careers-site only · ${byStatus("pending")} pending`} className="mb-4" action={<RefreshButton />}>
        <div className="max-h-[420px] overflow-auto"><table className="tbl"><thead><tr><th>Company</th><th>Provider</th><th>Status</th><th>Openings</th><th>Checked</th><th>Error / note</th></tr></thead>
          <tbody>{feeds.map((f) => <tr key={f.id}><td><Link className="link" href={`/companies/${f.id}`}>{f.name}</Link></td><td className="text-xs">{f.atsProvider === "NONE" ? "—" : `${f.atsProvider.toLowerCase()} · ${f.atsToken}`}</td><td className="text-xs whitespace-nowrap"><StatusDot status={f.atsStatus} /> {f.atsStatus ?? "pending"}</td><td>{f.totalOpenings ?? "—"}</td><td className="text-xs whitespace-nowrap">{dateTime(f.atsCheckedAt)}</td><td className="text-xs text-slate-500 max-w-md">{f.atsError}{(f.atsStatus === "not_found" || f.atsStatus === "unsupported") && f.careersUrl && <> · <a className="link" href={f.careersUrl} target="_blank" rel="noopener noreferrer">check careers site ↗</a></>}</td></tr>)}</tbody>
        </table></div>
      </Card>
      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Data export & restore">
          <div className="space-y-2 text-sm">
            <a className="btn-primary" href="/api/export">Download full backup (JSON)</a>
            <div className="flex flex-wrap gap-2 text-xs">{["jobs", "applications", "companies", "contacts"].map((w) => <a key={w} className="link" href={`/api/export?format=csv&what=${w}`}>{w}.csv</a>)}</div>
            <RestoreForm />
          </div>
        </Card>
        <Card title="Matching model">
          <ul className="text-sm space-y-1">{(Object.keys(WEIGHTS) as Criterion[]).map((k) => <li key={k} className="flex justify-between"><span>{CRITERION_LABEL[k]}</span><b>{WEIGHTS[k]}%</b></li>)}</ul>
          <p className="mt-2 text-xs text-slate-500">Tier 1 ≥ 72 with an excellent role fit; Tier 2 ≥ 60; Tier 3 otherwise. Relocation, stretch and excluded roles are ranked separately.</p>
          <div className="mt-2"><RescoreButton /></div>
        </Card>
        <Card title="Account & security">
          <p className="text-sm">Signed in as <b>{user?.email}</b> ({user?.role.toLowerCase()})</p>
          <PasswordForm />
          <ul className="mt-3 text-xs text-slate-500 list-disc ml-4 space-y-0.5"><li>HTTPS enforced by the host, HSTS enabled</li><li>Passwords hashed with bcrypt; 5 failed attempts lock sign-in for 15 minutes</li><li>Sessions are signed, HTTP-only cookies</li><li>API keys live only in server environment variables</li><li>Every change is recorded in the audit log</li></ul>
        </Card>
      </div>
      <Card title="Your profile (basis of all matching)" className="mt-4">
        <p className="text-sm text-slate-700">{PROFILE.summary}</p>
        <p className="mt-2 text-xs text-slate-500">Target roles: {PROFILE.targetRoles.join(" · ")}. Location: {PROFILE.homeBase}; remote U.S., Southwest, or hybrid near Phoenix. Clearance-required roles excluded.</p>
      </Card>
    </>
  );
}
