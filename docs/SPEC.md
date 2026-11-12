# Tierra Viewings v4 — Specification

Rebuild of the single-file Firebase app (`Tierra_Viewings_v3.html`) as a proper app,
following the same architecture as FAJA CRM. Every feature of v3 is kept.

## Constraints
- **$0 running cost, permanently on free plans**: Supabase Free (second free project in FaisalOrg),
  Cloudflare Pages Free (commercial use allowed — Vercel Hobby is not), GitHub Free,
  GitHub Actions (backups), UptimeRobot Free, Sentry Developer (free).
- Data stays exportable at any time (nightly JSON + SQL dump in a private repo).

## Stack
React 19 · TypeScript · Vite · Tailwind 4 · vite-plugin-pwa · @supabase/supabase-js
Tests: Vitest (unit), PGlite (database / RLS integration, real Postgres in WASM), Playwright (e2e).

## Roles
| Role | Who (today) | Can |
|---|---|---|
| `agent` | all staff | see the shared calendar, book viewings, edit own *pending* booking, cancel own booking |
| `manager` | Faisal Javed, Joie Gracia, Nabeeha Khial | everything agents can + confirm, cancel any, reschedule, see driver live map, driver report, CSV export, manage staff (Faisal = `admin`) |
| `driver` | Gagan Malla | see confirmed trips for a day, mark a trip completed, share live location |
| `admin` | Faisal Javed | manager + add/deactivate staff, change roles, reset passwords |

## Booking rules (enforced in the database, not just the UI)
- Hours 9:30 AM – 6:00 PM Dubai time; start must be ≥ 9:30 and < 18:00.
- No Sundays. No past dates. Same-day bookings at least 30 minutes ahead.
- Duration 0.5 – 8 h in 30-minute steps (UI offers 1, 1.5, 2, 2.5, 3, custom).
- One driver ⇒ no two *active* bookings may overlap. Active = Pending, Confirmed, Rescheduled.
- Trip type `direct` (location) or `pickup` (pickup point + destination).
- Required: date, start, area, location, purpose. Optional: notes, client reference.

## Status flow
`pending → confirmed → completed`
`pending|confirmed|rescheduled → cancelled` (owner or manager, optional reason)
`pending|confirmed|rescheduled → rescheduled` (manager; keeps original date/time; needs re-confirm)
`rescheduled → confirmed` (manager)

## Other features carried over
- Week view + day timeline with free gaps ≥ 1 h, "My bookings" with status filters.
- Manager dashboard with filters; driver idle/utilisation report (7/14/30 days).
- Live driver location on a Leaflet/OSM map (driver shares, managers view).
- WhatsApp tap-to-notify links (new booking → Nabeeha + Joie; confirm → agent).
- In-app realtime updates + browser notifications + reminders before confirmed viewings.
- CSV export. Location suggestions (OSM Nominatim).
- Installable PWA, light/dark theme, Modern UI v4 look.

## Security model
- Supabase Auth email + password; public sign-up **disabled**; accounts created by admin only.
- Row Level Security on every table; `anon` has no table access.
- All booking writes go through `security definer` RPC functions that check role + rules;
  direct INSERT/UPDATE/DELETE on `bookings` is revoked from clients.
- Overlaps blocked by a Postgres exclusion constraint (cannot be raced).
- Every booking change written to `booking_events` (audit log) by trigger.
- Strict CSP and security headers on Cloudflare Pages.
