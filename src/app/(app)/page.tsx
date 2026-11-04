import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { agenda, applicationSearch, feed, pipelineDashboard, QUIET_DAYS, SEARCH_BY, type AgendaItem, type FeedItem, type SearchBy } from "@/lib/pipeline";
import { Card, Empty, Logo, Icon, type IconName } from "@/components/ui";
import { WeeklyLine } from "@/components/Charts";
import ApplicationSearch from "@/components/ApplicationSearch";
import Gem from "@/components/Gem";
import ApplicationsTable from "@/components/ApplicationsTable";
import { STAGE_LABEL, ago, date } from "@/lib/format";
import { UndoEmail } from "@/components/MailWidgets";
import DoneCheck from "@/components/DoneCheck";
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
    search ? prisma.application.findMany({ where: search, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 50 }) : null,
    prisma.emailEvent.findMany({ where: { receivedAt: { gte: new Date(Date.now() - 14 * 86400_000) } }, orderBy: { receivedAt: "desc" }, take: 30 }),
    prisma.mailAccount.findUnique({ where: { id: "outlook" }, select: { lastSyncAt: true } }),
  ]);
  const inboxApps = inbox.length ? await prisma.application.findMany({ where: { id: { in: inbox.map((e) => e.applicationId!).filter(Boolean) } }, select: { id: true, title: true, company: { select: { name: true, logoUrl: true } } } }) : [];
  const t = d.tiles;
  const todo = agenda(d);
  // A req shows in one place: Going Quiet leaves out anything already in Your Next Moves.
  const inMoves = new Set([...todo.items.map((x) => x.appId), ...todo.nudges.map((n) => n.id)]);
  const quiet = d.quiet.filter((a) => !inMoves.has(a.id));
  const changes = feed(inbox, d.moves, inboxApps, KIND_LABEL);
  const looked = by === "date" ? date(`${q}T12:00:00-07:00`) : `“${q}”`;

  return (
    <>
      <Welcome>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <Stat label="Active Processes" value={t.active} href={table("active=1")} icon="flame" />
          <Stat label="Applied" value={t.applied} href={table("applied=1")} icon="send" />
          <Stat label="Moved Past Applied" value={t.responseRate == null ? "—" : `${t.responseRate}%`} href={table("applied=1")} icon="trend" />
          <Stat label="Interviews" value={t.interviews} href={table("interviews=1")} icon="calendar" />
          <Stat label="Offers" value={t.offers} href={table("stage=OFFER")} icon="trophy" />
          <Stat label="Follow-Ups Due" value={t.followUps} href={table("followup=1")} icon="clock" />
          <Stat label="Ready to Apply" value={t.readyToApply} href="/apply" icon="check" />
        </div>
        <div className="welcome-search mt-3"><ApplicationSearch by={by} q={q} /></div>
      </Welcome>

      {found && (
        <Card title={`${found.length === 50 ? "First 50" : found.length} application${found.length === 1 ? "" : "s"} for ${SEARCH_BY[by].toLowerCase()} ${looked}`} icon="search" className="mb-3" action={<Link href="/" className="text-[13px] link">Clear search</Link>}>
          {found.length ? <ApplicationsTable apps={found} /> : <Empty>No application matches. {by === "date" ? "Only applications marked applied have a date applied." : "Try part of the name."}</Empty>}
        </Card>
      )}

      <Pipeline f={d.funnel} />

      <div className="mb-3 grid grid-cols-1 items-start gap-3 lg:grid-cols-5">
        <Card title={<Count n={todo.items.length + todo.nudges.length}>Your Next Moves</Count>} icon="clock" tone="amber" className="lg:col-span-3">
          <NextMoves items={todo.items} nudges={todo.nudges} />
        </Card>
        <div className="flex flex-col gap-3 lg:col-span-2">
          <Card title={<Count n={changes.items.length}>What Changed</Count>} icon="arrows" tone="violet">
            <Changes items={changes.items} logged={changes.logged} outlook={!!mail} checked={mail?.lastSyncAt ?? null} />
          </Card>
          <Card title={<Count n={quiet.length}>Going Quiet</Count>} icon="pause" tone="rose">
            {quiet.length === 0 ? <AllClear>{d.quiet.length ? "Everything that has gone quiet already has a next move on the left." : `Every open application has moved in the last ${QUIET_DAYS} days.`}</AllClear> : (
              <ul className="space-y-0.5">{quiet.map((a) => <Row key={a.id} href={`/applications/${a.id}`} company={a.company} title={a.company.name} sub={`${a.title} · ${STAGE_LABEL[a.stage]}`} right={<Chip tone="rose">{ago(a.updatedAt).replace(" ago", "")} quiet</Chip>} />)}</ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Weekly Activity" icon="trend" tone="emerald"><WeeklyLine data={d.weeks} /></Card>
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
        <ol className="grid min-w-[860px] grid-cols-8 gap-1.5">
          {f.stages.map((s) => {
            const box = "bg-violet-50";
            return (
              <li key={s.key} className="relative">
                <Link href={s.key === "READY_TO_APPLY" ? "/apply" : table(`stage=${s.key}`)} className={`group flex h-full flex-col rounded-lg px-3 pb-3 pt-2.5 transition hover:bg-violet-100 ${box}`}>
                  <span className="truncate text-[14px] font-semibold text-slate-600">{s.label}</span>
                  <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${s.count ? "text-navy-950" : "text-violet-300"}`}>{s.count}</span>
                  <span className="mt-2 flex min-h-[22px] items-center">
                    {s.logos.map((c, j) => <span key={c.name} className={`rounded-md ring-2 ring-white ${j ? "-ml-1" : ""}`} title={c.name}><Logo src={c.logoUrl} name={c.name} size={22} /></span>)}
                    {s.count > s.logos.length && <span className="ml-1.5 text-[12px] font-medium text-slate-500">+{s.count - s.logos.length}</span>}
                  </span>
                  <span className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-violet-200/60"><span className="block h-full rounded-full bg-gradient-to-r from-[#5D36FF] to-[#A100C2]" style={{ width: `${s.count ? Math.max(6, (s.count / max) * 100) : 0}%` }} /></span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link href={table("stage=REJECTED")} className="flex h-full flex-col rounded-lg bg-violet-50 px-3 pb-3 pt-2.5 transition hover:bg-violet-100">
              <span className="text-[14px] font-semibold text-slate-500">Closed</span>
              <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${closed.length ? "text-slate-500" : "text-slate-300"}`}>{closed.reduce((n, c) => n + c.count, 0)}</span>
              <span className="mt-auto pt-2 text-[13px] leading-snug text-slate-500">{closed.length ? closed.map((c) => `${c.count} ${STAGE_LABEL[c.key].toLowerCase()}`).join(" · ") : "None yet"}</span>
            </Link>
          </li>
        </ol>
      </div>
    </Card>
  );
}

const BUCKET: Record<AgendaItem["bucket"] | "interview", { label: string; head: string; ring: string; dot: string }> = {
  interview: { label: "Interviews", head: "bg-violet-50 text-violet-800", ring: "ring-violet-200", dot: "bg-violet-500" },
  overdue: { label: "Overdue", head: "bg-rose-50 text-rose-800", ring: "ring-rose-200", dot: "bg-rose-500" },
  today: { label: "Due Today", head: "bg-amber-50 text-amber-800", ring: "ring-amber-200", dot: "bg-amber-500" },
  soon: { label: "This Week", head: "bg-slate-50 text-slate-700", ring: "ring-slate-200", dot: "bg-slate-400" },
};
const SHOW = 4;

function NextMoves({ items, nudges }: { items: AgendaItem[]; nudges: { id: string; company: Co; role: string; appliedAt: Date | null }[] }) {
  if (!items.length && !nudges.length) return <AllClear>Nothing due. Follow-ups show here when a next-action date arrives or an application sits 7 days without a reply.</AllClear>;
  const groups = (["interview", "overdue", "today", "soon"] as const)
    .map((b) => [b, items.filter((x) => (b === "interview" ? x.kind === "interview" : x.kind !== "interview" && x.bucket === b))] as const)
    .filter(([, l]) => l.length);
  const row = (x: AgendaItem) => {
    const r = <Row key={x.id} href={x.href ?? undefined} company={x.company ?? undefined} title={x.kind === "interview" ? `Interview with ${x.company?.name ?? "company"}` : x.text} sub={[x.kind !== "interview" && x.company?.name, x.role, x.more ? `+${x.more} more to-do${x.more === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")} right={<Due x={x} />} bare={!!x.done} />;
    return x.done ? <DoneCheck key={x.id} kind={x.done.kind} id={x.done.id} label={x.text}>{r}</DoneCheck> : r;
  };
  return (
    <div className="space-y-3">
      {groups.map(([b, l]) => (
        <section key={b} className={`overflow-hidden rounded-xl ring-1 ${BUCKET[b].ring}`}>
          <div className={`flex items-center gap-2 px-3.5 py-2 text-[15px] font-semibold ${BUCKET[b].head}`}><span className={`h-2.5 w-2.5 rounded-full ${BUCKET[b].dot}`} />{BUCKET[b].label}<span className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-[13px] tabular-nums">{l.length}</span></div>
          <ul className="space-y-0.5 px-3.5 py-1">{l.slice(0, SHOW).map(row)}</ul>
          {l.length > SHOW && <div className="px-3.5 pb-2"><More label={`Show ${l.length - SHOW} more`}><ul className="space-y-0.5">{l.slice(SHOW).map(row)}</ul></More></div>}
        </section>
      ))}
      {nudges.length > 0 && (
        <details className="group rounded-xl bg-slate-50 ring-1 ring-slate-200/70 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex">{nudges.slice(0, 4).map((n, j) => <span key={n.id} className={`rounded-md ring-2 ring-white ${j ? "-ml-2" : ""}`}><Logo src={n.company.logoUrl} name={n.company.name} size={26} /></span>)}</span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-navy-950">{nudges.length} application{nudges.length === 1 ? "" : "s"} awaiting a response after 7+ days</span><span className="block truncate text-[13px] text-slate-500">{nudges.map((n) => n.company.name).join(", ")}</span></span>
            <span className="text-[13px] font-medium text-navy-600 group-open:hidden">Follow up</span><span className="hidden text-[13px] font-medium text-navy-600 group-open:inline">Hide</span>
          </summary>
          <ul className="space-y-0.5 px-3.5 pb-2">{nudges.map((n) => <Row key={n.id} href={`/applications/${n.id}`} company={n.company} title={n.company.name} sub={n.role} right={n.appliedAt ? <Chip>Applied {short(n.appliedAt)}</Chip> : undefined} />)}</ul>
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
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${STAGE_TONE[stage] ?? "bg-slate-100 text-slate-600"}`}>{STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage}</span>;
}

const ORDER = ["READY_TO_APPLY", "APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"];
const backward = (x: FeedItem) => Boolean(x.from && x.to && ORDER.indexOf(x.from) > ORDER.indexOf(x.to) && ORDER.includes(x.to));

function Changes({ items, logged, outlook, checked }: { items: FeedItem[]; logged: { id: string; at: Date; appId: string | null; company: Co | null; label: string; from: string; subject: string; undone: boolean }[]; outlook: boolean; checked: Date | null }) {
  if (!items.length && !logged.length) return <AllClear>No status changes in the last two weeks.{outlook ? " Recruiter replies, interview requests, offers and rejections from your Outlook move applications for you and show here." : ""}</AllClear>;
  const row = (x: FeedItem) => (
    <li key={x.id} className="flex items-center gap-2">
      <Link href={`/applications/${x.appId}`} className="row-link min-w-0 flex-1">
        {x.company ? <Logo src={x.company.logoUrl} name={x.company.name} size={34} /> : <span className="h-[34px] w-[34px] shrink-0 rounded-md bg-slate-100" />}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[15px] font-medium text-navy-950">{x.company?.name ?? "Application"}</span>{x.to && <StagePill stage={x.to} />}</span>
          <span className="block truncate text-[13px] text-slate-500">{[x.role, backward(x) ? `Moved back from ${STAGE_LABEL[x.from as keyof typeof STAGE_LABEL] ?? x.from}` : null, x.via, ago(x.at)].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>
      {x.undoable && x.emailId && <UndoEmail id={x.emailId} />}
    </li>
  );
  return (
    <div>
      {items.length ? <ul className="space-y-0.5">{items.slice(0, 6).map(row)}</ul> : <p className="text-sm text-slate-500">No status changes in the last two weeks.</p>}
      {items.length > 6 && <More label={`Show ${items.length - 6} more`}><ul className="space-y-0.5">{items.slice(6).map(row)}</ul></More>}
      {logged.length > 0 && (
        <More label={`${logged.length} more email${logged.length === 1 ? "" : "s"} reviewed with no status change${checked ? ` · Outlook synced ${ago(checked)}` : ""}`} icon>
          <ul className="space-y-0.5">{logged.map((e) => <Row key={e.id} href={e.appId ? `/applications/${e.appId}` : undefined} company={e.company ?? undefined} title={`${e.company?.name ?? e.from}: ${e.label}${e.undone ? " (undone)" : ""}`} sub={`“${e.subject}” · ${ago(e.at)}`} small />)}</ul>
        </More>
      )}
    </div>
  );
}

/** Card title with its count in a pill, in place of a caption on the right. */
function Count({ n, children }: { n: number; children: ReactNode }) {
  return <span className="flex items-center gap-2">{children}{n > 0 && <span className="rounded-full bg-navy-900 px-2 py-0.5 text-[12.5px] font-semibold tabular-nums text-gold-300">{n}</span>}</span>;
}

function short(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }); }

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "amber" | "violet" }) {
  const c = { violet: "bg-violet-50 text-violet-700 ring-1 ring-violet-600/15", slate: "bg-slate-100 text-slate-600", rose: "bg-rose-50 text-rose-700 ring-1 ring-rose-600/15", amber: "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20" }[tone];
  return <span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-medium tabular-nums ${c}`}>{children}</span>;
}

function More({ label, children, icon }: { label: string; children: ReactNode; icon?: boolean }) {
  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[13px] font-medium text-navy-600 hover:text-navy-800 [&::-webkit-details-marker]:hidden">
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
function Row({ href, company, title, sub, right, small, bare }: { href?: string; company?: Co; title: string; sub?: string; right?: ReactNode; small?: boolean; bare?: boolean }) {
  const size = small ? 26 : 34;
  const inner = <>{company ? <Logo src={company.logoUrl} name={company.name} size={size} /> : <span style={{ width: size, height: size }} className="shrink-0 rounded-md bg-slate-100" />}<span className="min-w-0 flex-1"><span className={`todo-title block truncate font-medium text-navy-950 ${small ? "text-[13.5px]" : "text-[15px]"}`}>{title}</span>{sub && <span className="block truncate text-[13px] text-slate-500">{sub}</span>}</span>{right}</>;
  const body = href ? <Link href={href} className="row-link">{inner}</Link> : <div className="row-link">{inner}</div>;
  // bare: the caller supplies the <li> (a to-do row wraps this in its check button).
  return bare ? body : <li>{body}</li>;
}

/** The Command Center banner: violet gradient, her greeting, a crystal on the right, and the headline numbers as glass tiles. */
function Welcome({ children }: { children: ReactNode }) {
  return (
    <section className="relative mb-3 overflow-hidden rounded-2xl bg-[linear-gradient(120deg,#4a26ef_0%,#5D36FF_40%,#8a12d6_80%,#A100C2_100%)] px-4 py-4 text-white shadow-[0_18px_40px_-24px_rgba(93,54,255,0.8)] lg:px-6">
      <Gem className="pointer-events-none absolute -right-4 -top-14 hidden h-[210px] w-[420px] [mask-image:linear-gradient(to_bottom,black_50%,transparent_95%)] md:block" />
      <div className="relative flex flex-col items-center gap-2 md:block">
        <h1 className="text-center text-[30px] font-semibold leading-tight tracking-tight md:px-48 md:text-[40px]">{"Wake Up, Daddy's Home!"}</h1>
        <Link href="/applications" className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-[#5D36FF] shadow-sm hover:bg-[#f1edff] md:absolute md:right-0 md:top-1/2 md:-translate-y-1/2">All applications →</Link>
      </div>
      <div className="relative mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value, href, icon }: { label: string; value: ReactNode; href: string; icon: IconName }) {
  return (
    <Link href={href} className="block rounded-xl bg-white/[0.12] px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/20">
      <span className="flex items-center gap-1.5 text-[13.5px] font-medium text-white/80"><Icon name={icon} size={14} className="text-violet-200" />{label}</span>
      <span className="mt-0.5 block text-[26px] font-semibold leading-tight tabular-nums">{value}</span>
    </Link>
  );
}

