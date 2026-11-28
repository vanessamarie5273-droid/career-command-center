import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { METRICS, ofTotal } from "@/lib/metrics";
import { PageHeader, HeroStat, Card, Section, Logo, ScoreBadge, Icon, Empty, type IconName } from "@/components/ui";
import { BriefingButton } from "@/components/AlertWidgets";
import { PipelineDonut, ReplyBars } from "@/components/BriefingCharts";
import { originFrom, rememberAppUrl } from "@/lib/appUrl";
import { ago, titleCase } from "@/lib/format";
import type { BriefingContent } from "@/lib/briefing";
import { az, local, PRI_ICON, Count, OppCard, More, ProgressRow, None, FollowUpList, PeopleList, InterviewList, ChangeList, NewsList, WorkingPanel } from "@/components/BriefingParts";

export const metadata = { title: "Briefing" };
export const dynamic = "force-dynamic";

export default async function Briefing({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const h = await headers();
  await rememberAppUrl(prisma, originFrom(h.get("x-forwarded-host") || h.get("host"), h.get("x-forwarded-proto")));
  const [picked, past] = await Promise.all([
    id ? prisma.briefing.findUnique({ where: { id } }) : null,
    prisma.briefing.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, createdAt: true } }),
  ]);
  const row = picked ?? (await prisma.briefing.findFirst({ orderBy: { createdAt: "desc" } }));
  const b = row?.content as BriefingContent | undefined;
  const v = b?.v2;
  if (!b || !v) return (<><PageHeader title="Briefing" actions={<BriefingButton />} /><Empty>Generate today&apos;s briefing to see it here.</Empty></>);
  const s = v.stats;
  return (
    <>
      <PageHeader title={`Briefing · ${az(b.generatedAt, { weekday: "long", month: "short", day: "numeric" })}`} actions={<><PastBriefings past={past} current={row!.id} /><Link href="/" className="btn-ghost">Today on Command Center</Link><BriefingButton /></>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <HeroStat label={METRICS.active.label} value={s.active} icon="board" href="/applications?view=table&open=1" />
          <HeroStat label={METRICS.awaiting.label} value={s.waiting} icon="clock" href="/applications?view=table&stage=APPLIED" />
          <HeroStat label={METRICS.interviewsSoon.label} value={s.interviews} icon="calendar" highlight={s.interviews > 0} />
          <HeroStat label={METRICS.responseRate.label} value={s.responseRate == null ? "—" : `${s.responseRate}%`} icon="trend" />
          <HeroStat label={`New High-Fit Roles (${v.minScore}+)`} value={s.strongNew} icon="spark" highlight={s.strongNew > 0} href="/jobs?sort=new" />
          <HeroStat label="Feeds Checked" value={<span className="text-xl">{b.lastRun?.at ? ago(b.lastRun.at) : "—"}</span>} icon="refresh" />
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card title="Today's top three" icon="flame" dark className="xl:col-span-6">
          {v.priorities.length ? (
            <ol className="grid gap-2">
              {v.priorities.map((p, i) => (
                <li key={p.title}><Link href={local(p.href)} className="flex gap-3 rounded-xl bg-white/10 p-3 ring-1 ring-white/20 transition hover:bg-white/[0.18]">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-base font-bold text-[#5D36FF]">{i + 1}</span>
                  <span className="min-w-0"><span className="flex items-center gap-1.5 text-[15px] font-semibold text-white"><Icon name={PRI_ICON[p.kind]} size={15} className="text-[#f6d0f2]" />{p.title}</span><span className="block text-[14px] text-white/75">{p.reason}</span></span>
                </Link></li>
              ))}
            </ol>
          ) : <p className="text-sm text-white/75">Nothing pressing.</p>}
        </Card>
        <Card title="Pipeline" icon="pie" className="xl:col-span-3">
          {s.pipeline.length ? <PipelineDonut data={s.pipeline} /> : <p className="text-sm text-slate-500">No active applications.</p>}
        </Card>
        <Card title="Replies by role" icon="chart" tone="gold" className="xl:col-span-3" action={<Count n={`${v.working.responded}/${v.working.sent}`} />}>
          {v.working.byFamily.length ? <ReplyBars data={v.working.byFamily} /> : <p className="text-sm text-slate-500">No applications yet.</p>}
        </Card>
      </div>

      {v.urgent.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.urgent.map((u) => <Link key={u.text} href={local(u.href)} className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[14px] font-semibold ring-1 ${u.tone === "bad" ? "bg-rose-50 text-rose-700 ring-rose-200" : u.tone === "good" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-sky-50 text-sky-700 ring-sky-200"}`}><span className="h-2 w-2 rounded-full bg-current" />{u.text}</Link>)}
        </div>
      )}

      <Section className="mt-4" title={v.noStrongMatches ? `No new ${v.minScore}+ matches today${v.opportunities.length ? " · best still open" : ""}` : "Best new opportunities"} action={<Count n={v.opportunities.length} />}>
        {v.opportunities.length ? <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">{v.opportunities.map((o) => <OppCard key={o.id} o={o} />)}</div> : <Empty>No open role scores {v.minScore}+ right now.</Empty>}
      </Section>

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <More icon="arrows" title="Application progress" count={v.progress.moved.length + v.progress.needsAction.length}>
          {[...v.progress.moved, ...v.progress.needsAction].map((p, i) => <ProgressRow key={i} p={p} />)}
          {!v.progress.moved.length && !v.progress.needsAction.length && <None />}
        </More>
        <More icon="clock" title="Waiting on a reply" count={v.progress.waiting.length}>
          {v.progress.waiting.map((p, i) => <ProgressRow key={i} p={p} />)}
          {!v.progress.waiting.length && <None />}
        </More>
        <More icon="send" title="Next steps due by tomorrow" count={ofTotal(v.followUps.length, b.followUps?.length ?? v.followUps.length)}>
          <FollowUpList items={v.followUps} />
        </More>
        <More icon="people" title="People to contact" count={v.people.length}>
          <PeopleList items={v.people} />
        </More>
        <More icon="calendar" title="Upcoming interviews" count={v.interviews.length}>
          <InterviewList items={v.interviews} />
        </More>
        <More icon="history" title="Changes to tracked jobs" count={v.changes.length}>
          <ChangeList items={v.changes} />
        </More>
        <More icon="news" title="Company developments" count={v.news.length}>
          <NewsList items={v.news} />
        </More>
        <More icon="trend" title="What's working" count={v.working.patterns.length || undefined}>
          <WorkingPanel w={v.working} />
        </More>
      </div>
    </>
  );
}

/** Past briefings: one link per day, newest first, so earlier days stay one click away. */
function PastBriefings({ past, current }: { past: { id: string; createdAt: Date }[]; current: string }) {
  if (past.length < 2) return null;
  return (
    <details className="relative">
      <summary className="btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">Past briefings ▾</summary>
      <ul className="absolute right-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-card border border-ink-line bg-white p-1 text-ink shadow-lg">
        {past.map((p) => <li key={p.id}><Link href={`/briefing?id=${p.id}`} className={`block rounded-md px-3 py-2 text-[14px] hover:bg-brand-50 ${p.id === current ? "font-semibold text-brand-700" : ""}`}>{az(p.createdAt.toISOString(), { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</Link></li>)}
      </ul>
    </details>
  );
}
