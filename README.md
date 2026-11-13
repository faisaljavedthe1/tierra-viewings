# Tierra Viewings

Driver and viewing scheduler for Tierra Properties. Staff book the company driver, managers confirm,
the driver sees his trips and shares live location. Replaces the single-file Firebase app (v3).

**Everything runs on free plans**: Supabase Free (database, logins, live updates, staff-admin function),
Cloudflare Pages Free (website), GitHub Free (code, tests, nightly backups, uptime checks).

| | |
|---|---|
| Spec and rules | [docs/SPEC.md](docs/SPEC.md) |
| Security review | [docs/SECURITY.md](docs/SECURITY.md) |
| Database | `supabase/migrations/` (applied in order) |
| Staff-admin function | `supabase/functions/admin-staff/` |

## Develop
```bash
npm install
cp .env.example .env.local      # fill in the Supabase URL and publishable key
npm run dev
```

## Tests (run on every push by GitHub Actions)
```bash
npm test            # unit + database tests: RLS, roles, booking rules, privacy, import (PGlite = real Postgres)
npm run test:e2e    # staff simulations in a real browser, phone + desktop
npx playwright test --repeat-each=3   # triple simulation run
```

## Deploy
Cloudflare Pages → connect this repo → build command `npm run build`, output `dist`,
environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Every push to `main` deploys.
Database changes: add a new file in `supabase/migrations/` with a test, then apply it in Supabase.

## Backups and restore
- Nightly at 02:00 Dubai: GitHub → Actions → **Backup** → latest run → Artifacts → `database-backup` (kept 90 days).
- Restore into a fresh Supabase project: apply the migrations, then
  `gunzip -c tierra-viewings-YYYY-MM-DD.sql.gz | psql "$DATABASE_URL"`.
- Extra safety: Supabase dashboard → Database → Backups is not included on the free plan, so keep the Actions backup on.

## Monitoring
- **Uptime**: GitHub Actions **Health** checks the website and database every 30 minutes; a failure emails the owner.
- **Errors**: crashes in the app are logged to the database. Admin → Staff → Error log.
- **Audit log**: every booking change is recorded in `booking_events` (who, when, before/after).
