import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { agenda, applicationSearch, feed, pipelineDashboard, QUIET_DAYS, SEARCH_BY, type AgendaItem, type FeedItem, type SearchBy } from "@/lib/pipeline";
import { Card, Empty, Logo, Icon, Section, StagePill, type IconName } from "@/components/ui";
import ApplicationSearch from "@/components/ApplicationSearch";
import Gem from "@/components/Gem";
import ApplicationsTable from "@/components/ApplicationsTable";
import { STAGE_LABEL, ago, date, dateTime } from "@/lib/format";
import type { BriefingContent } from "@/lib/briefing";
import { BriefingButton } from "@/components/AlertWidgets";
import { ChangeList, FollowUpList, local, More as BMore, NewsList, None, OppRow, PeopleList, ProgressRow, WorkingPanel } from "@/components/BriefingParts";
import { UndoEmail } from "@/components/MailWidgets";
import DoneCheck from "@/components/DoneCheck";
import { KIND_LABEL } from "@/lib/mail/sync";
import { METRICS, METRIC_FILTER, type MetricKey } from "@/lib/metrics";

export const metadata = { title: "Command Center" };
const table = (q: string) => `/applications?view=table${q ? `&${q}` : ""}`;
const TZ = "America/Phoenix";
type Co = { name: string; logoUrl: string | null };

export default async function CommandCenter({ searchParams }: { searchParams: Promise<{ by?: string; q?: string }> }) {
  const p = await searchParams;
  const by: SearchBy = p.by && p.by in SEARCH_BY ? (p.by as SearchBy) : "company";
  const q = p.q?.trim() ?? "";
  const search = applicationSearch(by, q);
  const [d, found, inbox, mail, briefing] = await Promise.all([
    pipelineDashboard(prisma),
    search ? prisma.application.findMany({ where: search, include: { company: true, job: true, resume: { select: { name: true } } }, orderBy: [{ appliedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 50 }) : null,
    prisma.emailEvent.findMany({ where: { receivedAt: { gte: new Date(Date.now() - 14 * 86400_000) } }, orderBy: { receivedAt: "desc" }, take: 30 }),
    prisma.mailAccount.findUnique({ where: { id: "outlook" }, select: { lastSyncAt: true } }),
    prisma.briefing.findFirst({ orderBy: { createdAt: "desc" } }),
  ]);
  const inboxApps = inbox.length ? await prisma.application.findMany({ where: { id: { in: inbox.map((e) => e.applicationId!).filter(Boolean) } }, select: { id: true, title: true, company: { select: { name: true, logoUrl: true } } } }) : [];
  const t = d.tiles;
  const b = briefing?.content as BriefingContent | undefined;
  const v = b?.v2;
  const todo = agenda(d);
  // One req, one entry: each application shows once, either as an interview (right) or as its current to-do (left).
  const interviews = todo.items.filter((x) => x.kind === "interview");
  const ranked = rankPriorities(todo.items.filter((x) => x.kind !== "interview"), v?.priorities ?? []);
  const prep = new Map((v?.interviews ?? []).map((iv) => [appIdOf(iv.href), iv]));
  const inMoves = new Set([...todo.items.map((x) => x.appId), ...todo.nudges.map((n) => n.id)]);
  const quiet = d.quiet.filter((a) => !inMoves.has(a.id));
  const changes = feed(inbox, d.moves, inboxApps, KIND_LABEL);
  const looked = by === "date" ? date(`${q}T12:00:00-07:00`) : `“${q}”`;

  return (
    <>
      <Welcome briefing={briefing ? { id: briefing.id, at: briefing.createdAt } : null}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          <Stat m="submitted" value={t.submitted} icon="send" />
          <Stat m="active" value={t.active} icon="board" />
          <Stat m="interviewProcesses" value={t.interviewProcesses} icon="flame" />
          <Stat m="interviewsSoon" value={t.interviewsSoon} icon="calendar" />
          <Stat m="responseRate" value={t.responseRate == null ? "—" : `${t.responseRate}%`} icon="trend" />
          <Stat m="followUps" value={t.followUps} icon="clock" />
          <Stat m="readyToApply" value={t.readyToApply} href="/apply" icon="check" />
        </div>
        <div className="welcome-search mt-3"><ApplicationSearch by={by} q={q} /></div>
      </Welcome>

      {found && (
        <Card title={`${found.length === 50 ? "First 50" : found.length} application${found.length === 1 ? "" : "s"} for ${SEARCH_BY[by].toLowerCase()} ${looked}`} icon="search" className="mb-6" action={<Link href="/" className="text-[13px] link">Clear search</Link>}>
          {found.length ? <ApplicationsTable apps={found} /> : <Empty>No application matches. {by === "date" ? "Only applications marked applied have a date applied." : "Try part of the name."}</Empty>}
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <Card title={<Count n={ranked.length + todo.nudges.length}>Priorities</Count>} sub="Ranked by urgency. Check one off when it's done." icon="flame" className="xl:col-span-7">
          <Priorities items={ranked} nudges={todo.nudges} />
        </Card>
        <div className="flex flex-col gap-6 xl:col-span-5">
          <Card title={<Count n={interviews.length}>Upcoming Interviews</Count>} icon="calendar">
            {interviews.length ? <ul className="space-y-1">{interviews.map((x) => <InterviewRow key={x.id} x={x} prep={x.appId ? prep.get(x.appId) : undefined} />)}</ul> : <AllClear>No interviews on the calendar.</AllClear>}
          </Card>
          {quiet.length > 0 && (
            <Card title={<Count n={quiet.length}>Going Quiet</Count>} sub={`No movement in ${QUIET_DAYS}+ days`} icon="pause" tone="rose">
              <ul className="space-y-0.5">{quiet.map((a) => <Row key={a.id} href={`/applications/${a.id}`} company={a.company} title={a.company.name} sub={`${a.title} · ${STAGE_LABEL[a.stage]}`} right={<Chip tone="rose">{ago(a.updatedAt).replace(" ago", "")} quiet</Chip>} />)}</ul>
            </Card>
          )}
        </div>
      </div>

      <Pipeline f={d.funnel} />

      <div className="mb-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        <Card title={<Count n={v?.opportunities.length ?? 0}>{v?.noStrongMatches ? "Best Open Roles" : "New High-Fit Opportunities"}</Count>} sub={v ? (v.noStrongMatches ? `No new ${v.minScore}+ matches today; the best still open` : `Scored ${v.minScore}+ against your resume. Open one to see the fit.`) : undefined} icon="spark" className="xl:col-span-7" action={<Link href="/jobs?sort=score" className="link text-[13px]">All in Discover →</Link>}>
          {v?.opportunities.length ? <div>{v.opportunities.map((o) => <OppRow key={o.id} o={o} />)}</div> : <Empty>{v ? `No open role scores ${v.minScore}+ right now.` : "Today's briefing hasn't run yet."}</Empty>}
        </Card>
        <div className="flex flex-col gap-6 xl:col-span-5">
          <Card title={<Count n={changes.items.length}>What Changed</Count>} sub="Applications, last 14 days" icon="arrows" tone="violet">
            <Changes items={changes.items} logged={changes.logged} outlook={!!mail} checked={mail?.lastSyncAt ?? null} />
          </Card>
          {v && (v.changes.length > 0 || v.news.length > 0) && (
            <Card title={<Count n={v.changes.length + v.news.length}>Job and Company Updates</Count>} icon="news" tone="sky">
              <div className="max-h-[26rem] overflow-y-auto"><ChangeList items={v.changes} />{v.news.length > 0 && <div className={v.changes.length ? "mt-2 border-t border-ink-line pt-1" : ""}><NewsList items={v.news} /></div>}</div>
            </Card>
          )}
        </div>
      </div>

      {v && (
        <Section title="More from Today's Briefing" sub={b ? `Generated ${dateTime(b.generatedAt)}` : undefined} action={briefing && <Link href={`/briefing?id=${briefing.id}`} className="link text-[13px]">Full briefing and past days →</Link>}>
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            <BMore icon="clock" title="Waiting on a Reply" count={v.progress.waiting.length}>{v.progress.waiting.length ? v.progress.waiting.map((x, i) => <ProgressRow key={i} p={x} />) : <None />}</BMore>
            <BMore icon="send" title="Suggested Follow-Up Messages" count={v.followUps.length}><FollowUpList items={v.followUps} /></BMore>
            <BMore icon="people" title="People to Contact" count={v.people.length}><PeopleList items={v.people} /></BMore>
            <BMore icon="trend" title="What's Working" count={v.working.patterns.length || undefined}><WorkingPanel w={v.working} /></BMore>
          </div>
        </Section>
      )}
    </>
  );
}

const appIdOf = (href: string) => href.match(/\/applications\/([^/?#]+)/)?.[1] ?? null;

type Ranked = AgendaItem & { reason?: string; pinned?: PriorityKind };
type PriorityKind = NonNullable<BriefingContent["v2"]>["priorities"][number];

/**
 * One ranked list: the briefing's top priorities first (merged into the matching application's row, so a req shows
 * once), then every other to-do by urgency.
 */
function rankPriorities(items: AgendaItem[], top: PriorityKind[]): Ranked[] {
  const used = new Set<string>();
  const head: Ranked[] = [];
  for (const p of top) {
    if (p.kind === "interview") continue; // interviews have their own card
    const id = appIdOf(p.href);
    const match = id ? items.find((x) => x.appId === id) : undefined;
    if (match) { used.add(match.id); head.push({ ...match, reason: p.reason, pinned: p }); }
    else if (!id) head.push({ id: `p-${p.href}`, kind: "task", bucket: "today", appId: null, company: null, role: null, text: p.title, due: null, href: local(p.href), done: null, reason: p.reason, pinned: p });
  }
  return [...head, ...items.filter((x) => !used.has(x.id))];
}

const SHOW = 8;
function Priorities({ items, nudges }: { items: Ranked[]; nudges: { id: string; company: Co; role: string; appliedAt: Date | null }[] }) {
  if (!items.length && !nudges.length) return <AllClear>Nothing due. Follow-ups show here when a next-action date arrives or an application sits 7 days without a reply.</AllClear>;
  const row = (x: Ranked, i: number) => {
    const sub = [x.kind !== "interview" && x.company?.name, x.role, x.more ? `+${x.more} more to-do${x.more === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ");
    const r = <Row key={x.id} rank={i + 1} href={x.href ?? undefined} company={x.company ?? undefined} title={x.text} sub={sub} note={x.reason} right={x.pinned && !x.due ? <Chip tone="violet">Top pick</Chip> : <Due x={x} />} bare />;
    // Rows without a check button keep a matching spacer so every rank lines up.
    return x.done ? <DoneCheck key={x.id} kind={x.done.kind} id={x.done.id} label={x.text}>{r}</DoneCheck> : <li key={x.id} className="flex items-center gap-1"><span aria-hidden className="-ml-1 h-8 w-8 shrink-0" /><div className="min-w-0 flex-1">{r}</div></li>;
  };
  return (
    <div>
      <ul className="divide-y divide-ink-line">{items.slice(0, SHOW).map(row)}</ul>
      {items.length > SHOW && <More label={`Show ${items.length - SHOW} more`}><ul className="divide-y divide-ink-line">{items.slice(SHOW).map((x, i) => row(x, i + SHOW))}</ul></More>}
      {nudges.length > 0 && (
        <details className="group mt-3 rounded-card bg-brand-50 ring-1 ring-brand-200 open:bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="flex">{nudges.slice(0, 4).map((n, j) => <span key={n.id} className={`rounded-md ring-2 ring-white ${j ? "-ml-2" : ""}`}><Logo src={n.company.logoUrl} name={n.company.name} size={26} /></span>)}</span>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium text-ink">{nudges.length} application{nudges.length === 1 ? "" : "s"} awaiting a response after 7+ days</span><span className="block truncate text-[13px] text-ink-3">{nudges.map((n) => n.company.name).join(", ")}</span></span>
            <span className="text-[13px] font-semibold text-brand-700 group-open:hidden">Follow up</span><span className="hidden text-[13px] font-semibold text-brand-700 group-open:inline">Hide</span>
          </summary>
          <ul className="space-y-0.5 px-3.5 pb-2">{nudges.map((n) => <Row key={n.id} href={`/applications/${n.id}`} company={n.company} title={n.company.name} sub={n.role} right={n.appliedAt ? <Chip>Applied {short(n.appliedAt)}</Chip> : undefined} />)}</ul>
        </details>
      )}
    </div>
  );
}

/** An upcoming interview, with the briefing's outstanding preparation when it has some. */
function InterviewRow({ x, prep }: { x: AgendaItem; prep?: NonNullable<BriefingContent["v2"]>["interviews"][number] }) {
  const todo = prep?.prep.length ? `Prepare: ${prep.prep.slice(0, 2).join(", ").toLowerCase()}` : x.more ? `+${x.more} more to-do${x.more === 1 ? "" : "s"}` : undefined;
  return <Row href={x.href ?? undefined} company={x.company ?? undefined} title={x.company?.name ?? "Interview"} sub={x.role ?? undefined} note={todo} right={<Due x={x} />} />;
}

/** The funnel as one row of clickable stage tiles, left to right, with a few company logos in each. */
function Pipeline({ f }: { f: Awaited<ReturnType<typeof pipelineDashboard>>["funnel"] }) {
  const max = Math.max(1, ...f.stages.map((s) => s.count));
  const closed = f.closed.filter((c) => c.count);
  return (
    <Card title="Pipeline" sub="Open applications by stage" icon="board" className="mb-6" action={<Link href="/applications" className="link text-[13px]">Open board →</Link>}>
      <div>
        <ol className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-8">
          {f.stages.map((s) => {
            const box = "bg-violet-50";
            return (
              <li key={s.key} className="relative">
                <Link href={s.key === "READY_TO_APPLY" ? "/apply" : table(`stage=${s.key}`)} className={`group flex h-full flex-col rounded-lg px-3 pb-3 pt-2.5 transition hover:bg-violet-100 ${box}`}>
                  <span className="truncate text-[14px] font-semibold text-slate-600">{s.label}</span>
                  <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${s.count ? "text-ink" : "text-violet-300"}`}>{s.count}</span>
                  <span className="mt-2 flex min-h-[22px] items-center">
                    {s.logos.map((c, j) => <span key={c.name} className={`rounded-md ring-2 ring-white ${j ? "-ml-1" : ""}`} title={c.name}><Logo src={c.logoUrl} name={c.name} size={22} /></span>)}
                    {s.count > s.logos.length && <span className="ml-1.5 text-[12px] font-medium text-ink-3">+{s.count - s.logos.length}</span>}
                  </span>
                  <span className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-violet-200/60"><span className="block h-full rounded-full bg-gradient-to-r from-[#5D36FF] to-[#A100C2]" style={{ width: `${s.count ? Math.max(6, (s.count / max) * 100) : 0}%` }} /></span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link href={table("stage=REJECTED")} className="flex h-full flex-col rounded-lg bg-violet-50 px-3 pb-3 pt-2.5 transition hover:bg-violet-100">
              <span className="text-[14px] font-semibold text-ink-3">Closed</span>
              <span className={`mt-0.5 text-[30px] font-semibold leading-tight tabular-nums ${closed.length ? "text-ink-3" : "text-slate-300"}`}>{closed.reduce((n, c) => n + c.count, 0)}</span>
              <span className="mt-auto pt-2 text-[13px] leading-snug text-ink-3">{closed.length ? closed.map((c) => `${c.count} ${STAGE_LABEL[c.key].toLowerCase()}`).join(" · ") : "None yet"}</span>
            </Link>
          </li>
        </ol>
      </div>
    </Card>
  );
}

function Due({ x }: { x: AgendaItem }) {
  if (!x.due) return <Chip tone="rose">Overdue</Chip>;
  if (x.kind === "interview") return <Chip tone="violet">{x.bucket === "today" ? "Today" : x.due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })}, {x.due.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })}</Chip>;
  if (x.bucket === "overdue") { const n = Math.max(1, Math.round((Date.now() - x.due.getTime()) / 86400_000)); return <Chip tone="rose">{n}d overdue</Chip>; }
  if (x.bucket === "today") return <Chip tone="amber">Today</Chip>;
  return <Chip>{x.due.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ })}</Chip>;
}

const ORDER = ["READY_TO_APPLY", "APPLIED", "RECRUITER_CONTACT", "HIRING_MANAGER", "INTERVIEWING", "FINAL_INTERVIEW", "OFFER", "ACCEPTED"];
const label = (stage: string | null) => STAGE_LABEL[stage as keyof typeof STAGE_LABEL] ?? stage;
const backward = (x: FeedItem) => Boolean(x.from && x.to && ORDER.indexOf(x.from) > ORDER.indexOf(x.to) && ORDER.includes(x.to));

function Changes({ items, logged, outlook, checked }: { items: FeedItem[]; logged: { id: string; at: Date; appId: string | null; company: Co | null; label: string; from: string; subject: string; undone: boolean; more: number }[]; outlook: boolean; checked: Date | null }) {
  if (!items.length && !logged.length) return <AllClear>No status changes in the last two weeks.{outlook ? " Recruiter replies, interview requests, offers and rejections from your Outlook move applications for you and show here." : ""}</AllClear>;
  const row = (x: FeedItem) => (
    <li key={x.id} className="flex items-center gap-2">
      <Link href={`/applications/${x.appId}`} className="row-link min-w-0 flex-1">
        {x.company ? <Logo src={x.company.logoUrl} name={x.company.name} size={34} /> : <span className="h-[34px] w-[34px] shrink-0 rounded-md bg-slate-100" />}
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2"><span className="truncate text-[15px] font-medium text-ink">{x.company?.name ?? "Application"}</span>{x.to && <StagePill stage={x.to} />}</span>
          <span className="block truncate text-[13px] text-ink-3">{[x.role, backward(x) ? `Moved back from ${label(x.from)}` : x.start && x.start !== x.to ? `From ${label(x.start)}` : null, x.via, ago(x.at), x.updates > 1 ? `${x.updates} updates` : null].filter(Boolean).join(" · ")}</span>
        </span>
      </Link>
      {x.undoable && x.emailId && <UndoEmail id={x.emailId} />}
    </li>
  );
  return (
    <div>
      {items.length ? <ul className="space-y-0.5">{items.slice(0, 6).map(row)}</ul> : <p className="text-sm text-ink-3">No status changes in the last two weeks.</p>}
      {items.length > 6 && <More label={`Show ${items.length - 6} more`}><ul className="space-y-0.5">{items.slice(6).map(row)}</ul></More>}
      {logged.length > 0 && (
        <More label={`Emails on ${logged.length} more application${logged.length === 1 ? "" : "s"} with no status change${checked ? ` · Outlook synced ${ago(checked)}` : ""}`} icon>
          <ul className="space-y-0.5">{logged.map((e) => <Row key={e.id} href={e.appId ? `/applications/${e.appId}` : undefined} company={e.company ?? undefined} title={`${e.company?.name ?? e.from}: ${e.label}${e.undone ? " (undone)" : ""}`} sub={[`“${e.subject}”`, ago(e.at), e.more ? `+${e.more} more email${e.more === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")} small />)}</ul>
        </More>
      )}
    </div>
  );
}

/** Card title with its count in a pill, in place of a caption on the right. */
function Count({ n, children }: { n: number; children: ReactNode }) {
  return <span className="flex items-center gap-2">{children}{n > 0 && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[13px] font-semibold tabular-nums text-brand-800">{n}</span>}</span>;
}

function short(d: Date) { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ }); }

function Chip({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "rose" | "amber" | "violet" }) {
  const c = { violet: "tone-progress", slate: "tone-closed", rose: "tone-bad", amber: "tone-due" }[tone];
  return <span className={`chip shrink-0 tabular-nums ${c}`}>{children}</span>;
}

function More({ label, children, icon }: { label: string; children: ReactNode; icon?: boolean }) {
  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 py-1 text-[13px] font-semibold text-brand-700 hover:text-brand-900 [&::-webkit-details-marker]:hidden">
        {icon && <Icon name="mail" size={13} className="text-slate-400" />}{label}
        <svg className="transition group-open:rotate-180" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="mt-1">{children}</div>
    </details>
  );
}

function AllClear({ children }: { children: ReactNode }) {
  return <div className="flex items-start gap-2.5 rounded-ctl bg-emerald-50/70 px-3 py-2.5 text-[14px] text-ink-2 ring-1 ring-emerald-600/15"><Icon name="check" size={16} className="mt-0.5 shrink-0 text-emerald-700" /><span>{children}</span></div>;
}

/** One row in a dashboard list: optional rank, logo, a main line, a quiet second line, an optional reason, and a chip on the right. */
function Row({ href, company, title, sub, note, right, small, bare, rank }: { href?: string; company?: Co; title: string; sub?: string; note?: string; right?: ReactNode; small?: boolean; bare?: boolean; rank?: number }) {
  const size = small ? 26 : 34;
  const inner = <>
    {rank != null && <span className={`w-5 shrink-0 text-center text-[14px] font-semibold tabular-nums ${rank <= 3 ? "text-brand-700" : "text-ink-3"}`}>{rank}</span>}
    {company ? <Logo src={company.logoUrl} name={company.name} size={size} /> : <span style={{ width: size, height: size }} className="inline-flex shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700"><Icon name="spark" size={14} /></span>}
    <span className="min-w-0 flex-1">
      <span className={`todo-title block font-medium text-ink ${small ? "truncate text-[14px]" : "text-[15px] leading-snug"}`}>{title}</span>
      {sub && <span className="block truncate text-[13px] text-ink-3">{sub}</span>}
      {note && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{note}</span>}
      {right && <span className="mt-1 flex sm:hidden">{right}</span>}
    </span>
    {right && <span className="hidden shrink-0 sm:contents">{right}</span>}
  </>;
  const body = href ? <Link href={href} className="row-link">{inner}</Link> : <div className="row-link">{inner}</div>;
  // bare: the caller supplies the <li> (a to-do row wraps this in its check button).
  return bare ? body : <li>{body}</li>;
}

/** The Command Center banner: brand gradient, her motto, today's briefing, and the headline numbers as glass tiles. Kept short. */
function Welcome({ children, briefing }: { children: ReactNode; briefing: { id: string; at: Date } | null }) {
  return (
    <section className="banner relative mb-6 overflow-hidden rounded-2xl px-5 py-4 text-white">
      <Gem className="pointer-events-none absolute -right-8 -top-20 hidden h-[180px] w-[360px] opacity-80 [mask-image:linear-gradient(to_bottom,black_45%,transparent_95%)] md:block" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight md:text-[30px]">Fall seven times, <em className="italic">stand up eight</em></h1>
        <div className="flex flex-wrap items-center gap-2">
          {briefing && <Link href={`/briefing?id=${briefing.id}`} className="text-[13px] text-white/85 underline-offset-2 hover:text-white hover:underline">Briefing {dateTime(briefing.at)}</Link>}
          <BriefingButton label="Refresh briefing" />
          <Link href="/applications" className="btn-ghost">All applications →</Link>
        </div>
      </div>
      <div className="relative mt-4">{children}</div>
    </section>
  );
}

/** One headline number, labelled from the shared metric definitions; the rule shows on hover. */
function Stat({ m, value, href, icon }: { m: MetricKey; value: ReactNode; href?: string; icon: IconName }) {
  const def = METRICS[m];
  return (
    <Link href={href ?? table(METRIC_FILTER[m])} title={def.rule} aria-label={`${def.label}: ${value}`} className="flex h-full flex-col justify-between gap-1 rounded-xl bg-white/[0.12] px-3.5 py-2.5 ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/20">
      <span className="text-[13px] font-medium leading-snug text-white/90">{def.label}</span>
      <span className="flex items-center justify-between gap-2"><span className="text-[26px] font-semibold leading-tight tabular-nums">{value}</span><Icon name={icon} size={16} className="shrink-0 text-violet-200" /></span>
    </Link>
  );
}

