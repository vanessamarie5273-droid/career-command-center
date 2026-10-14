# Career Command Center: setup guide

## What you need

| Account | Why | Cost |
|---|---|---|
| GitHub | Holds the private source repository that Render deploys from | Free |
| Render (render.com) | Hosts the web app, the Postgres database and the daily job | About $7 web + $7 database + $1 cron per month on the plans in `render.yaml` |
| Resend (resend.com), optional | Sends email alerts and the 6:00 AM briefing | Free tier is enough |
| Anthropic Console (console.anthropic.com), optional | Powers the assistant and the tailoring suggestions | Pay per use |

The app works without Resend and Anthropic. Without them, briefings are still generated and shown in the app, and the assistant page says it is not configured.

## Deploy on Render

1. Push this folder to a **private** GitHub repository.
2. In Render, choose **New → Blueprint** and pick the repository. Render reads `render.yaml` and creates:
   - `ccc-db`: Postgres 16 with daily backups.
   - `ccc-web`: the app. On each deploy it runs migrations and the company seed, then serves the app. Its health check is `/api/health`.
   - `ccc-daily`: runs `npm run job:daily` every day at 6:00 AM Arizona time. That job refreshes every company feed, rescores the jobs, and writes and emails the morning briefing.
3. When Render asks for values in the `ccc-shared` group, set these:
   - `APP_URL`: the app's address, such as `https://ccc-web.onrender.com`.
   - `RESEND_API_KEY` and `ALERT_FROM_EMAIL` (optional): the sender must be on a domain you have verified in Resend.
   - `ANTHROPIC_API_KEY` (optional).
   - `SESSION_SECRET` and `CRON_SECRET` are generated for you.
4. Create your login. Open **ccc-web → Shell** and run:
   ```
   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-passphrase' npm run user:create
   ```
   The password must be at least 12 characters. Running the command again with the same email resets the password.
5. Sign in. Go to **Command Center → Refresh job feeds** to load live openings now, instead of waiting for 6:00 AM.
6. Optional: add a custom domain in **ccc-web → Settings → Custom Domains**, then update `APP_URL`.

### Other hosts

The app is a standard Next.js app with a `DATABASE_URL`. Hosts with an HTTP scheduler (Vercel Cron, GitHub Actions, cron-job.org) can call `POST /api/cron/daily` with the header `Authorization: Bearer $CRON_SECRET`, in place of the cron service.

## Run locally

```
cp .env.example .env              # set DATABASE_URL and SESSION_SECRET
npm install
npx prisma migrate deploy
npm run db:seed
ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run user:create
npm run dev                       # http://localhost:3000
npm test                          # uses a separate ccc_test database (TEST_DATABASE_URL)
```

## Commands

| Command | What it does |
|---|---|
| `npm run job:daily` | Seed check, feed refresh, rescore and briefing (the scheduled job) |
| `npm run job:ingest` | Feed refresh only |
| `npm run job:briefing` | Briefing only |
| `npm run db:seed` | Adds missing seed companies and fills only empty fields; never overwrites your edits |
| `npm run user:create` | Creates or resets a login (`ADMIN_ROLE` can be ADMIN, EDITOR or VIEWER) |

## Backups and restore

- **Render:** the paid Postgres plan keeps daily backups. Restore them from the database's **Recovery** tab.
- **In the app:** go to **Settings → Download full backup (JSON)** to get one file with all records and uploaded documents.
  - **Restore** with "Merge: add missing records" adds records that are missing.
  - **Restore** with "Replace everything" wipes the database and loads the file. It is admin-only.
  - CSV exports for applications, jobs, companies and contacts are on the same page.

## LinkedIn

LinkedIn does not offer an API for personal connections, messages or job applications. This app does not scrape LinkedIn or sign in as you. What it does instead:

- **Connections:** on LinkedIn, go to **Settings → Data privacy → Get a copy of your data → Connections**. Upload the `Connections.csv` file on **Network & Contacts**. Contacts are matched to companies by employer name.
- **Search links:** every company and job links out to the matching LinkedIn people and jobs search, which you open while signed in.
- **Outreach:** drafts are written in the app. You send them yourself on LinkedIn, then log the touch.

## How the data stays honest

- **Openings** come only from employers' public job boards: Greenhouse, Lever, Ashby, SmartRecruiters and Workday. Each one keeps a direct link to the posting, and its first-seen, last-verified and closed dates.
  - A job is closed only when a successful refresh no longer lists it. A failed refresh never closes anything; it raises an alert and shows on **Settings → Integrations**.
  - Companies with no supported public board show "not found" or "manual" in the Feed column, and their careers site is linked.
- **Company profiles** start out as AI-compiled summaries, labelled **AI assessment** and "not yet verified". No revenue, funding or valuation figures are seeded. You add figures with a source and mark them **Confirmed** or **Estimate**.
- **Compensation** is shown only when the posting publishes it, or when you enter it with a source and type.
- **Scores** are the app's own assessment. Your overrides are stored alongside the original score, which is never replaced.
