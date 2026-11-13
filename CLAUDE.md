# Working on Tierra Viewings

Owner: Faisal Javed (Tierra Properties). Must stay **$0 to run** — free plans only (Supabase Free,
Cloudflare Pages Free, GitHub Free). Never introduce a paid service.

## Mandatory process for every change
1. Unit tests for every feature. 2. Integration tests (tests/db runs the real migrations on PGlite).
3. Test-driven: write tests before or alongside the code. 4. Then pen-test it: try to break it and list
all findings as a numbered list **before** fixing anything. 5. Run staff simulations
(`npx playwright test --repeat-each=3`) and report what is broken.

## Rules of the codebase
- All writes to bookings go through `security definer` SQL functions that check the caller. Never grant
  INSERT/UPDATE/DELETE on tables to `authenticated`.
- Colleagues' bookings are read through `calendar()` which masks client details; keep that masking.
- New database changes = new numbered file in `supabase/migrations/` + tests in `tests/db/`.
- Booking rules live in the database (`_check_slot`) and are mirrored in `src/lib/time.ts` for instant feedback.
