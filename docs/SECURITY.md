# Security review — Tierra Viewings v4

Pen test, 12–13 Nov 2026, against the live Supabase project, posing as an anonymous visitor, a stranger
with a valid login, an agent, a manager and the driver. Findings were listed before any fix (team protocol).

## Verified protections
- Anonymous visitors: no access to any table or function.
- A login without an activated staff profile: sees nothing, cannot book.
- Nobody (not even admins) can insert/update/delete bookings directly; only through checked functions.
- Staff cannot change their own role; only the admin can, and cannot demote or deactivate themselves.
- Agents cannot confirm, reschedule or cancel other people's bookings (UI and database both refuse).
- Double-booking the driver is impossible, even with simultaneous requests (Postgres exclusion constraint).
- Agents see only time, place and booking agent on colleagues' bookings; client details stay with the
  booking agent, managers and (for confirmed trips) the driver.
- Every booking change is audited. Strict Content-Security-Policy and security headers on the website.

## Findings and status
| # | Finding | Status |
|---|---|---|
| 1 | Public sign-up enabled by default | **Owner action**: Supabase → Authentication → Sign In / Providers → turn off *Allow new users to sign up* |
| 2 | Junk accounts could write to the error log | Fixed (0004) — active staff only |
| 3 | Server minimum password length 6 | **Owner action**: Supabase → Authentication → Policies/Passwords → minimum length 8 |
| 4 | Staff-admin function needs the site address for CORS | At deploy: set function secret `ALLOWED_ORIGINS` |
| 5 | 3 helper functions without fixed search_path | Fixed (0004) |
| 6 | Edit revealed booking existence before staff check | Fixed (0004) |
| 7 | No limit on booking far into the future | Fixed (0004) — 6 months |
| 8 | Time format mismatch in messages | Fixed (0004) |
| 9 | Technical error for bad phone numbers | Fixed (0004) |
| 10 | Forgotten live location stays visible | Fixed (0004) — hidden after 2 hours |
| 11 | Address suggestions are sent to OpenStreetMap | Accepted — typed addresses only, no names |
| 12 | Agents saw colleagues' client details | Fixed (0005) — owner decision 13 Nov |
| 13 | Bookings could run past 6 PM | Fixed (0005) — owner decision 13 Nov |
| 14 | Reminders only while the app is open | Fixed — Web Push (0011–0013), reminders 60 and 15 min before trips |
| 15 | Old 3-device limit removed | Accepted — deactivation blocks all devices at once |
| 16 | Realtime not covered by automated tests | Check on real devices after deploy |
| 17 | 530 KB main bundle | Fixed — split into react / supabase / app chunks |
| 18 | Free project pauses after 7 idle days | Mitigated — nightly backup counts as activity |
| 19 | First-login password change was enforced only by the app screen | Fixed (0009) — server refuses data until changed |
| 20 | Temporary passwords sent over WhatsApp | Accepted — only valid until first sign-in, change is forced |
| 21 | Backups would include push signing keys | Fixed (0012) — secrets table excluded from backups |
| 22 | Notification tap could open an outside site | Fixed — in-app paths only |
| 23 | Reminder log grows forever | Fixed (0012) — 30-day clean-up |
| 25 | Driver location could linger after hours if the phone was locked | Fixed (0015) — server wipes it outside working hours |
| 26 | Compulsory notifications enforced in the app only | Accepted — Staff screen shows who is not set up |
| 27 | Sign-out could stall on a slow network | Fixed — always completes, unregisters this phone only |
| 24 | push-send is reachable from the internet | Accepted — 256-bit secret generated in the DB, constant-time check; verified a wrong secret gets 401 |

Supabase's security advisor still lists "signed-in users can execute SECURITY DEFINER functions":
intentional — these functions are the only way to change data and each checks the caller's role.
