# Deploying to Vercel

A checklist to click through once per project. Every step is a screen in the
Vercel, Supabase or GitHub dashboard unless it says otherwise. Names in
`monospace` are values to type exactly; the workflows depend on some of them.

What the code already does for you, so you do not have to:

- **Migrations run on every deploy**, before the build, against that
  environment's database ([apps/web/vercel.json](../apps/web/vercel.json)).
  A preview migrates its branch database; production migrates production.
- **Origins are trusted automatically.** Better Auth and the Server Action
  origin check both accept the deployment's own URLs, read from Vercel's system
  variables. Previews need no `BETTER_AUTH_URL`; production needs it only when
  a custom domain is in front.
- **Unrelated commits are not rebuilt** (`turbo-ignore` as the ignore command).

---

## 1. Supabase — the databases

- [ ] Create a project at supabase.com. Region: closest to your users.
      Save the database password somewhere safe; it is shown once.
- [ ] **Project Settings → Database → Connection string.** Copy two URIs:
      - *Transaction* pooler (port `6543`) → this is `DATABASE_URL`
      - *Session* / direct (port `5432`) → this is `DIRECT_URL`
- [ ] **Branching (previews).** Project → Branches → *Enable branching*, connect
      the GitHub repository. Each pull request then gets its own database, and
      the Vercel integration (step 3) injects that branch's connection strings
      into the matching preview. Skip this on the free tier and previews will
      share production's database — in which case do **not** point previews at
      it: create a second free project named `scaffold-preview` and use its
      strings for the Preview environment instead.
- [ ] **Authentication → Providers:** nothing to do. Better Auth runs in the
      app; Supabase Auth is not used.
- [ ] **Row Level Security.** ARCHITECTURE.md §4 wants it enabled on every
      table with no policies, as a backstop should a Supabase client key ever
      reach a browser. The migrations do not enable it yet (open item — see
      the roadmap). Until they do, after the first deploy: **Table Editor →
      each table → Enable RLS**. The app connects as `postgres`, which
      bypasses RLS on Supabase, so this changes nothing for the app.

## 1b. Resend — transactional email

- [ ] Create an account at resend.com, **Domains → Add domain**, add the DNS
      records it shows (SPF, DKIM), wait for *Verified*.
- [ ] **API Keys → Create** with *Sending access*; this is `RESEND_API_KEY`.
- [ ] Decide the From address on that domain; this is `EMAIL_FROM`, formatted
      `Scaffold <hello@yourdomain.com>`.
- [ ] Previews: either the same key (real mail from previews — fine for a
      team, not for demo data with strangers' addresses) or none, with
      `REQUIRE_EMAIL_VERIFICATION=false` so sign-up works without an inbox.

## 2. Vercel — the web project

- [ ] **Add New → Project → Import** the GitHub repository.
- [ ] Project name: `scaffold-web`. If you pick another name, also set the
      repository variable `VERCEL_WEB_PROJECT` to it in step 4 — the E2E
      workflow uses it to recognise this project's deployments.
- [ ] **Root Directory:** `apps/web`. Leave *Include files outside the root
      directory* enabled (it is by default) — the workspace packages live
      outside it.
- [ ] **Framework preset:** Next.js. Build and install commands: leave the
      dashboard defaults; `apps/web/vercel.json` overrides the build command.
- [ ] **Environment variables** (Settings → Environment Variables). Add each
      with the environments ticked as shown:

  | Variable | Production | Preview | Value |
  | --- | --- | --- | --- |
  | `DATABASE_URL` | ✓ | ✓ (if not using branching) | pooled URI from step 1 |
  | `DIRECT_URL` | ✓ | ✓ (if not using branching) | direct URI from step 1 |
  | `BETTER_AUTH_SECRET` | ✓ | ✓ | `openssl rand -base64 32`, a **different** value per environment |
  | `BETTER_AUTH_URL` | ✓ | — | `https://<your domain>`; leave unset for previews |
  | `RESEND_API_KEY` | ✓ | optional | from resend.com → API Keys; production refuses to boot without it |
  | `EMAIL_FROM` | ✓ | optional | `Name <address@domain>` on a domain verified in Resend |
  | `REQUIRE_EMAIL_VERIFICATION` | — | `false` | leave unset (true) in production; `false` lets previews and E2E sign in without an inbox |
  | `NODE_ENV` | — | — | do not set; Vercel does |

  Two secrets, on purpose: a preview must not be able to mint a production
  session cookie.
- [ ] **Deploy.** The first build runs the migrations, then `next build`. If it
      fails on *Invalid environment variables*, the message names the missing
      key.
- [ ] **Settings → Deployment Protection.** Keep *Vercel Authentication* on
      for previews. Then **Protection Bypass for Automation → Add secret**;
      copy it — it is the `VERCEL_AUTOMATION_BYPASS_SECRET` for step 4.
- [ ] **Settings → Git → Deployment status events:** leave on. This is the
      `deployment_status` event the E2E workflow listens for.
- [ ] **Settings → Domains:** add the production domain and set
      `BETTER_AUTH_URL` to it (step above) if you have not already.

## 3. Supabase ↔ Vercel integration (only with branching)

- [ ] Vercel → **Integrations → Supabase → Add**, select `scaffold-web`.
- [ ] In the integration settings, map *Preview* to Supabase branches and
      *Production* to the main project. It writes `POSTGRES_URL`-style
      variables; this app reads `DATABASE_URL` and `DIRECT_URL`, so also tick
      the option to expose the URIs under those names, or add two variables of
      each environment referencing the integration's values.
- [ ] Open a throwaway pull request and confirm in the preview's build log
      that `drizzle-kit migrate` ran against a branch database, not
      production.

## 4. GitHub — CI secrets and variables

Repository → Settings → Secrets and variables → Actions.

- [ ] **Secret** `VERCEL_AUTOMATION_BYPASS_SECRET` — from step 2.
- [ ] **Variable** `VERCEL_WEB_PROJECT` — only if the project is not named
      `scaffold-web`.
- [ ] Branch protection on `main`: require the `Lint, typecheck, test, build`
      check to pass before merging.

## 5. Verify

- [ ] Push a branch, open a pull request. Expected order: **CI** runs on the
      push; Vercel builds the preview; when Vercel reports it ready, **E2E**
      starts against the preview URL and passes.
- [ ] Open the preview, sign up and open `/dashboard`. The account lands in the
      preview's database, not production.
- [ ] Merge. Production deploys, migrations run, the E2E workflow does **not**
      run (it targets previews only).
- [ ] In production: sign up works, `/dashboard` loads, and the browser console
      shows no Content-Security-Policy violations.

## 6. Later: the docs site

- [ ] Second Vercel project, name `scaffold-docs`, Root Directory `apps/docs`,
      no environment variables. Once it exists, Vercel renames the GitHub
      environments to `Preview – scaffold-web` and `Preview – scaffold-docs`;
      the E2E workflow already handles both forms.

---

## If something goes wrong

| Symptom | Cause | Fix |
| --- | --- | --- |
| Build fails: `Invalid environment variables` | a variable missing for that environment | add it for the right environment (Production vs Preview) |
| Build fails in `drizzle-kit migrate` | `DIRECT_URL` unreachable or wrong password | test the URI with `psql`; Supabase pauses free projects after inactivity — resume it |
| Sign-in fails with *Invalid origin* | app served on a host it does not trust | set `BETTER_AUTH_URL` to the exact origin in the browser's address bar |
| Server Action returns 403 | same as above, from Next's side | same fix; both checks read the same list |
| E2E workflow never runs | Vercel project name does not match | set the `VERCEL_WEB_PROJECT` variable, or check *Deployment status events* is on |
| E2E gets a Vercel login page | bypass secret missing or rotated | update `VERCEL_AUTOMATION_BYPASS_SECRET` |
| Preview writes appear in production | previews share production's database | enable branching, or give previews their own project (step 1) |
| Sign-up says "check your inbox" but nothing arrives | no `RESEND_API_KEY`, or the From domain is not verified | set the key; in Resend, Domains must show *Verified*; without a key the mail is in the server log |
| Production build fails: `RESEND_API_KEY is required` | the key is missing for the Production environment | add it (section 1b) |
