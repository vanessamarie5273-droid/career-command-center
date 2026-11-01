import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { agenda, applicationSearch, feed, pipelineDashboard, QUIET_DAYS, SEARCH_BY, type AgendaItem, type FeedItem, type SearchBy } from "@/lib/pipeline";
import { Card, PageHeader, Empty, HeroStat, Logo, Icon } from "@/components/ui";
import { WeeklyLine } from "@/components/Charts";
import ApplicationSearch from "@/components/ApplicationSearch";
import ApplicationsTable from "@/components/ApplicationsTable";
import { STAGE_LABEL, ago, date } from "@/lib/format";
import { UndoEmail } from "@/components/MailWidgets";
import { KIND_LABEL } from "@/lib/mail/sync";

export const metadata = { title: "Command Center" };
const table = (q: string) => `/applications?view=table${q ? `&${q}` : ""}`;
const TZ = "America/Phoenix";
type Co = { name: string; logoUrl: string | null };

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ by?: string; q?: string }> }) {
  const p = await searchParams;
  const by: SearchBy = p.by && p.by in SEARCH_BY ? (p.by as SearchBy) : "company";
  const q = p.q?.trim() ?? "";
  const search = applicationSearch(by, q);
  const [d, found, inbox, mail] = await Promise.all([
    pipelineDashboard(prisma),
    search ? prisma.application.findMany({ where: search, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ appliedAt: "desc" }, { updatedAt: "desc" }], take: 50 }) : null,
    prisma.emailEvent.findMany({ where: { receivedAt: { gte: new Date(Date.now() - 14 * 86400_000) } }, orderBy: { receivedAt: "desc" }, take: 30 }),
    prisma.mailAccount.findUnique({ where: { id: "outlook" }, select: { lastSyncAt: true } }),
  ]);
  const inboxApps = inbox.length ? await prisma.application.findMany({ where: { id: { in: inbox.map((e) => e.applicationId!).filter(Boolean) } }, select: { id: true, title: true, company: { select: { name: true, logoUrl: true } } } }) : [];
  const t = d.tiles;
  const todo = agenda(d);
  const changes = feed(inbox, d.moves, inboxApps, KIND_LABEL);
  const looked = by === "date" ? date(`${q}T12:00:00-07:00`) : `“${q}”`;

  return (
    <>
      <PageHeader title="Command Center" actions={<Link href="/applications" className="btn-ghost">All applications →</Link>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          <HeroStat label="Active processes" value={t.active} href={table("active=1")} icon="flame" highlight />
          <HeroStat label="Applied" value={t.applied} href={table("applied=1")} icon="send" />
          <HeroStat label="Moved past applied" value={t.responseRate == null ? "—" : `${t.responseRate}%`} href={table("applied=1")} icon="trend" />
          <HeroStat label="Interviews scheduled" value={t.interviews} href={table("interviews=1")} icon="calendar" />
          <HeroStat label="Offers" value={t.offers} href={table("stage=OFFER")} icon="trophy" />
          <HeroStat label="Follow-ups due" value={t.followUps} href={table("followup=1")} icon="clock" />
          <HeroStat label="Ready to apply" value={t.readyToApply} href="/apply" icon="check" />
        </div>
        <div className="hero-search mt-4"><ApplicationSearch by={by} q={q} /></div>
      </PageHeader>

      {found && (
        <Card title={`${found.length === 50 ? "First 50" : found.length} application${found.length === 1 ? "" : "s"} for ${SEARCH_BY[by].toLowerCase()} ${looked}`} icon="search" className="mb-3" action={<Link href="/" className="text-xs link">Clear search</Link>}>
          {found.length ? <ApplicationsTable apps={found} /> : <Empty>No application matches. {by === "date" ? "Only applications marked applied have a date applied." : "Try part of the name."}</Empty>}
        </Card>
      )}

      <Pipeline f={d.funnel} />

      <div className="mb-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-5">
        <Card title={<Count n={todo.items.length + todo.nudges.length}>Your next moves</Count>} icon="clock" tone="amber" className="lg:col-span-3">
          <NextMoves items={todo.items} nudges={todo.nudges} />
        </Card>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Card title={<Count n={changes.items.length}>What changed</Count>} icon="arrows" tone="violet">
            <Changes items={changes.items} logged={changes.logged} outlook={!!mail} checked={mail?.lastSyncAt ?? null} />
          </Card>
          <Card title={<Count n={d.quiet.length}>Going quiet</Count>} icon="pause" tone="rose">
            {d.quiet.length === 0 ? <AllClear>Every open application has moved in the last {QUIET_DAYS} days.</AllClear> : (
              <ul className="space-y-0.5">{d.quiet.map((a) => <Row key={a.id} href={`/applications/${a.id}`} company={a.company} title={a.company.name} sub={`${a.title} · ${STAGE_LABEL[a.stage]}`} right={<Chip tone="rose">{ago(a.updatedAt).replace(" ago", "")} quiet</Chip>} />)}</ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Weekly activity" icon="trend" tone="emerald"><WeeklyLine data={d.weeks} /></Card>
    </>
  );
}

/** The funnel as one row of clickable stage tiles, left to right, with a few company logos in each. */
function Pipeline({ f }: { f: Awaited<ReturnType<typeof pipelineDashboard>>["funnel"] }) {
  const max = Math.max(1, ...f.stages.map((s) => s.count));
  const closed = f.closed.filter((c) => c.count);
  return (
    <Card title="Pipeline" icon="board" className="mb-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <ol className="grid min-w-[860px] grid-cols-8 gap-2.5">
          {f.stages.map((s, i) => {
            const live = i >= 2 && i <= 5 && s.count > 0, offer = s.key === "OFFER" && s.count > 0;
            const box = offer ? "bg-emerald-50 ring-emerald-500/30" : live ? "bg-gold-300/20 ring-gold-500/40" : s.count ? "bg-slate-50/80 ring-slate-200" : "bg-white ring-slate-100";
            return (
              <li key={s.key} className="relative">
                <Link href={s.key === "READY_TO_APPLY" ? "/apply" : table(`stage=${s.key}`)} className={`group flex h-full flex-col rounded-xl px-3 pb-3 pt-2.5 ring-1 transition hover:-translate-y-0.5 hover:shadow-md ${box}`}>
                  <span className="truncate text-[13px] font-semibold text-slate-600">{s.label}</span>
                  <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${s.count ? "text-navy-950" : "text-slate-300"}`}>{s.count}</span>
                  <span className="mt-2 flex min-h-[22px] items-center">
                    {s.logos.map((c, j) => <span key={c.name} className={`rounded-md ring-2 ring-white ${j ? "-ml-1" : ""}`} title={c.name}><Logo src={c.logoUrl} name={c.name} size={22} /></span>)}
                    {s.count > s.logos.length && <span className="ml-1.5 text-[11px] font-medium text-slate-500">+{s.count - s.logos.length}</span>}
                  </span>
                  <span className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-slate-200/70"><span className={`block h-full rounded-full ${offer ? "bg-emerald-500" : live ? "bg-gold-500" : "bg-navy-600"}`} style={{ width: `${s.count ? Math.max(6, (s.count / max) * 100) : 0}%` }} /></span>
                </Link>
                {i < f.stages.length - 1 && <span className="pointer-events-none absolute -right-[11px] top-1/2 z-10 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-400 ring-1 ring-slate-200"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M9 6l6 6-6 6" /></svg></span>}
              </li>
            );
          })}
          <li>
            <Link href={table("stage=REJECTED")} className="flex h-full flex-col rounded-xl border border-dashed border-slate-200 px-3 pb-3 pt-2.5 transition hover:bg-slate-50">
              <span className="text-[13px] font-semibold text-slate-500">Closed</span>
              <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${closed.length ? "text-slate-500" : "text-slate-300"}`}>{closed.reduce((n, c) => n + c.count, 0)}</span>
              <span className="mt-auto pt-2 text-[12px] leading-snug text-slate-500">{closed.length ? closed.map((c) => `${c.count} ${STAGE_LABEL[c.key].toLowerCase()}`).join(" · ") : "None yet"}</span>
            </Link>
          </li>
        </ol>
      </div>
    </Card>
  );
}

const BUCKET: Record<AgendaItem["bucket"], { label: string; dot: string }> = {
  overdue: { label: "Overdue", dot: "bg-rose-500" },
  today: { label: "Today", dot: "bg-amber-500" },
  soon: { label: "This week", dot: "bg-slate-400" },
};
const SHOW = 7;

function NextMoves({ items, nudges }: { items: AgendaItem[]; nudges: { id: string; company: Co; role: string; appliedAt: Date | null }[] }) {
  if (!items.length && !nudges.length) return <AllClear>Nothing due. Follow-ups show here when a next-action date arrives or an application sits 7 days without a reply.</AllClear>;
  const talks = items.filter((x) => x.kind === "interview"), tasks = items.filter((x) => x.kind !== "interview");
  const shown = tasks.slice(0, SHOW), rest = tasks.slice(SHOW);
  const groups = (list: AgendaItem[]) => (["overdue", "today", "soon"] as const).map((b) => [b, list.filter((x) => x.bucket === b)] as const).filter(([, l]) => l.length);
  const head = (label: string, dot: string, n: number) => <div className="mb-1 mt-4 flex items-center gap-2 text-[13px] font-semibold text-navy-950 first:mt-0"><span className={`h-2 w-2 rounded-full ${dot}`} />{label}<span className="rounded-full bg-slate-100 px-1.5 text-[11px] tabular-nums text-slate-500">{n}</span></div>;
  const render = (list: AgendaItem[], heads: boolean) => groups(list).map(([b, l]) => (
    <div key={b}>
      {heads && head(BUCKET[b].label, BUCKET[b].dot, tasks.filter((x) => x.bucket === b).length)}
      <ul className="space-y-0.5">{l.map((x) => <Row key={x.id} href={x.appId ? `/applications/${x.appId}${x.kind === "interview" ? "#interview" : ""}` : undefined} company={x.company ?? undefined} title={x.kind === "interview" ? `Interview with ${x.company?.name ?? "company"}` : x.text} sub={[x.kind !== "interview" && x.company?.name, x.role].filter(Boolean).join(" · ")} right={<Due x={x} />} />)}</ul>
    </div>
  ));
  return (
    <div>
      {talks.length > 0 && <div>{head("Interviews", "bg-violet-500", talks.length)}<ul className="space-y-0.5">{talks.map((x) => <Row key={x.id} href={`/applications/${x.appId}#interview`} company={x.company ?? undefined} title={`Interview with ${x.company?.name ?? "company"}`} sub={x.role ?? undefined} right={<Due x={x} />} />)}</ul></div>}
      {render(shown, true)}
      {rest.length > 0 && <More label={`Show ${rest.length} more`}>{render(rest, false)}</More>}
      {nudges.length > 0 && (
        <details className="group mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200/70 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex">{nudges.slice(0, 4).map((n, j) => <span key={n.id} className={`rounded-md ring-2 ring-white ${j ? "-ml-2" : ""}`}><Logo src={n.company.logoUrl} name={n.company.name} size={24} /></span>)}</span>
            <span className="min-w-0 flex-1"><span className="block text-[13.5px] font-medium text-navy-950">{nudges.length} application{nudges.length === 1 ? "" : "s"} with no reply after a week</span><span className="block truncate text-xs text-slate-500">{nudges.map((n) => n.company.name).join(", ")}</span></span>
            <span className="text-xs font-medium text-navy-600 group-open:hidden">Follow up</span><span className="hidden text-xs font-medium text-navy-600 group-open:inline">Hide</span>
          </summary>
          <ul className="space-y-0.5 px-3 pb-2">{nudges.map((n) => <Row key={n.id} href={`/applications/${n.id}`} company={n.company} title={n.company.name} sub={n.role} right={n.appliedAt ? <Chip>applied {short(n.appliedAt)}</Chip> : undefined} />)}</ul>
        </details>
      )}
    </div>
  );
}

function Due({ x }: { x: AgendaItem }) {
  if (!x.due) return <Chip tone="rose">Overdue</Chip>;
  if (x.kind === "interview") return <Chip tone="violet">{x.bucket === "today" ? "Today" : x.due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })}, {x.due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}</Chip>;
  if (x.bucket === "overdue") { const n = Math.max(1, Math.round((Date.now() - x.due.getTime()) / 86400_000)); return <Chip tone="rose">{n}d overdue</Chip>; }
  if (x.bucket === "today") return <Chip tone="amber">Today</Chip>;
  return <Chip>{x.due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })}</Chip>;
}

const STAGE_TONE: Record<string, string> = {
  APPLIED: "bg-navy-500/10 text-navy-700", RECRUITER_CONTACT: "bg-sky-50 text-sky-700", HIRING_MANAGER: "bg-sky-50 text-sky-700",
  INTERVIEWING: "bg-violet-50 text-violet-700", FINAL_INTERVIEW: "bg-violet-50 text-violet-700", OFFER: "bg-emerald-50 text-emerald-700",
  ACCEPTED: "bg-emerald-50 text-emerald-700", REJECTED: "bg-rose-50 text-rose-700", WITHDRAWN: "bg-slate-100 text-slate-600",
};
function StagePill({ stage }: { stage: string }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STAGE_TONE[stage] ?? "bg-slate-100 text-slate-600"}`}>{STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}</span>;
}

function Changes({ items, logged, outlook, checked }: { items: FeedItem[]; logged: { id: string; at: Date; appId: string | null; company: Co | null; label: string; from: string; subject: string; undone: boolean }[]; outlook: boolean; checked: Date | null }) {
  if (!items.length && !logged.length) return <AllClear>No stage changes in the last two weeks.{outlook ? " Recruiter replies, interview requests, offers and rejections from your Outlook move applications for you and show here." : ""}</AllClear>;
  const row = (x: FeedItem) => (
    <li key={x.id} className="flex items-center gap-2">
      <Link href={`/applications/${x.appId}`} className="row-link min-w-0 flex-1">
        {x.company ? <Logo src={x.company.logoUrl} name={x.company.name} size={30} /> : <span className="h-[30px] w-[30px] shrink-0 rounded-md bg-slate-100" />}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[13.5px] font-medium text-navy-950">{x.company?.name ?? "Application"}</span>{x.to && <StagePill stage={x.to} />}</span>
          <span className="block truncate text-xs text-slate-500">{x.from ? `from ${STAGE_LABEL[x.from as keyof typeof STAGE_LABEL] ?? x.from} · ` : ""}{x.via} · {ago(x.at)}</span>
        </span>
      </Link>
      {x.undoable && x.emailId && <UndoEmail id={x.emailId} />}
    </li>
  );
  return (
    <div>
      {items.length ? <ul className="space-y-0.5">{items.slice(0, 6).map(row)}</ul> : <p className="text-sm text-slate-500">No stage changes in the last two weeks.</p>}
      {items.length > 6 && <More label={`Show ${items.length - 6} more`}><ul className="space-y-0.5">{items.slice(6).map(row)}</ul></More>}
      {logged.length > 0 && (
        <More label={`${logged.length} other email${logged.length === 1 ? "" : "s"} logged, no change needed${checked ? ` · Outlook checked ${ago(checked)}` : ""}`} icon>
          <ul className="space-y-0.5">{logged.map((e) => <Row key={e.id} href={e.appId ? `/applications/${e.appId}` : undefined} company={e.company ?? undefined} title={`${e.company?.name ?? e.from}: ${e.label}${e.undone ? " (undone)" : ""}`} sub={`“${e.subject}” · ${ago(e.at)}`} small />)}</ul>
        </More>
      )}
    </div>
  );
}

/** Card title with its count in a pill, in place of a caption on the right. */
function Count({ n, children }: { n: number; children: ReactNode }) {
  return <span className="flex items-center gap-2">{children}{n > 0 && <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-gold-300">{n}</span>}</span>;
}

function short(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }); }

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "amber" | "violet" }) {
  const c = { violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/15", slate: "bg-slate-100 text-slate-600", rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15", amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20" }[tone];
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${c}`}>{children}</span>;
}

function More({ label, children, icon }: { label: string; children: ReactNode; icon?: boolean }) {
  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-xs font-medium text-navy-600 hover:text-navy-800 [&::-webkit-details-marker]:hidden">
        {icon && <Icon name="mail" size={13} className="text-slate-400" />}{label}
        <svg className="transition group-open:rotate-180" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function AllClear({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50/60 px-3 py-2.5 text-sm text-slate-600 ring-1 ring-emerald-600/10"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-emerald-600" /><span>{children}</span></div>;
}

/** One application in a dashboard list: logo, a main line, a quiet second line, and an optional chip on the right. */
function Row({ href, company, title, sub, right, small }: { href?: string; company?: Co; title: string; sub?: string; right?: ReactNode; small?: boolean }) {
  const size = small ? 24 : 30;
  const inner = <>{company ? <Logo src={company.logoUrl} name={company.name} size={size} /> : <span style={{ width: size, height: size }} className="shrink-0 rounded-md bg-slate-100" />}<span className="min-w-0 flex-1"><span className={`block truncate font-medium text-navy-950 ${small ? "text-[12.5px]" : "text-[13.5px]"}`}>{title}</span>{sub && <span className="block truncate text-xs text-slate-500">{sub}</span>}</span>{right}</>;
  return <li>{href ? <Link href={href} className="row-link">{inner}</Link> : <div className="row-link">{inner}</div>}</li>;
}
