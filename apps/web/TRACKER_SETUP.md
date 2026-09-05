# Tracker — go-live setup

The Tracker code is complete and builds. To make it **live** (daily crawl, real
email, tracking), wire these three services **using the `officemindfries@gmail.com`
account**. Everything is server-side; no keys touch the browser.

Until these are set, the pages render with empty states and an amber "Backend not
connected" banner — nothing crashes.

## 1. Supabase (database)
1. Sign in to supabase.com as **officemindfries@gmail.com** → **New project** (name it `mindfries`).
2. SQL Editor → paste & run [`supabase/migrations/0001_tracker.sql`](../../supabase/migrations/0001_tracker.sql) (repo root). Creates `leads`, `email_events`, `waitlist`, `onboarded_companies`.
3. Project Settings → API → copy:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY`

## 2. Resend (email)
1. Sign in to resend.com as **officemindfries@gmail.com**.
2. **Domains** → add + verify your sending domain (DNS records). Until verified you can only send to your own address.
3. **API Keys** → create → `RESEND_API_KEY`.
4. Set `RESEND_FROM` to a verified address, e.g. `"Aaryan @ Mindfries <hello@yourdomain.com>"`.
5. **Webhooks** → add endpoint `https://<your-app>/api/webhooks/resend?token=<RESEND_WEBHOOK_SECRET>`, subscribe to `email.delivered/opened/clicked/bounced`. This is what fills open/click tracking.

## 3. Vercel (hosting + daily cron)
1. Import this repo into Vercel as **officemindfries@gmail.com**; set the project root to `apps/web`.
2. Add all env vars from [`.env.example`](.env.example) (Settings → Environment Variables). Generate `CRON_SECRET` and `RESEND_WEBHOOK_SECRET` as random strings.
3. Deploy. `vercel.json` registers the daily crawl at 08:00 UTC (`/api/cron/discover`) automatically.

## Verify
- Trigger the crawl now: `curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>/api/cron/discover` → `{ok:true, added:N}`. Leads appear on **/admin/tracker**.
- Public waitlist form: **/waitlist** → submit → row on **/admin/waitlist** + email to officemindfries@gmail.com.
- Email a lead from the Tracker → "Email demo" → sends via Resend, lead moves to **Emailed**.

## Notes / deliberate shortcuts
- **Reply tracking** is a manual "Mark replied" button (auto opens/clicks come from the Resend webhook). True inbound-reply detection needs domain MX/inbound routing — add later.
- **Discovery** uses free job boards (RemoteOK, Arbeitnow) — no lead-gen bill. Swap in Apollo/Clearbit behind `RawLead` in `lib/icp.ts` if you want firmographic enrichment + real contact emails.
- **Contact email** is best-guessed (`hello@domain`) since job boards rarely expose it — editable before sending.
