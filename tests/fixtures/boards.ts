// Test-only fixtures shaped like real ATS API responses. Never loaded by the application.
export const greenhouseBoard = (jobs: { id: number; title: string; location: string; content?: string }[]) => ({
  jobs: jobs.map((j) => ({ id: j.id, title: j.title, absolute_url: `https://job-boards.greenhouse.io/testco/jobs/${j.id}`, location: { name: j.location }, first_published: new Date(Date.now() - 3 * 86400000).toISOString(), content: j.content ?? "&lt;p&gt;Own a book of strategic enterprise accounts selling cloud and AI to CFO and CIO buyers. 8+ years of enterprise software sales experience.&lt;/p&gt;&lt;p&gt;The OTE range for this role is $280,000 - $340,000 USD.&lt;/p&gt;", departments: [{ name: "Sales" }] })),
  meta: { total: jobs.length + 40 },
});

export const ashbyBoard = (jobs: { id: string; title: string; location: string; remote?: boolean }[]) => ({
  jobs: jobs.map((j) => ({ id: j.id, title: j.title, location: j.location, isRemote: !!j.remote, workplaceType: j.remote ? "Remote" : "OnSite", publishedAt: new Date().toISOString(), jobUrl: `https://jobs.ashbyhq.com/testco/${j.id}`, descriptionPlain: "Lead healthcare enterprise sales. Experience with health systems and public sector buyers.", isListed: true, compensation: { compensationTierSummary: "$150K – $175K • Offers Equity", summaryComponents: [{ compensationType: "Salary", minValue: 150000, maxValue: 175000, interval: "1 YEAR", currencyCode: "USD" }, { compensationType: "EquityPercentage", minValue: 0.01, maxValue: 0.02 }] } })),
});

export function mockFetch(routes: Record<string, unknown | (() => unknown)>) {
  return async (url: string) => {
    for (const [k, v] of Object.entries(routes)) {
      if (url.includes(k)) {
        const body = typeof v === "function" ? (v as () => unknown)() : v;
        if (body === 404) return new Response("not found", { status: 404 });
        if (body === 500) return new Response("boom", { status: 500 });
        return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response("not found", { status: 404 });
  };
}
