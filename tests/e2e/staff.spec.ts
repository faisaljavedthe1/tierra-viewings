// Staff simulations: real people's journeys through the app, end to end, on phone and desktop.
// Run three times over (npm run test:e2e -- --repeat-each=3) as the "triple user simulation".
import { expect, test, type Page } from '@playwright/test'
import { FAKE_URL, FakeSupabase, PASSWORD, STAFF } from './fake-supabase'

// Monday 7 Jan 2030, 09:00 in Dubai, for both the browser and the database.
const NOW_UTC = new Date('2030-01-07T05:00:00Z')
let fake: FakeSupabase

/** Simulated push service + permission (real ones are Google / Apple / Mozilla servers). */
async function stubPush(page: Page, opts: { granted: boolean; subscribed: boolean }) {
  await page.addInitScript(o => {
    const w = window as unknown as Record<string, unknown>
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-device', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } } }, unsubscribe: async () => { w.__sub = null; return true } }
    if (w.__sub === undefined) w.__sub = o.subscribed ? sub : null
    if (w.__perm === undefined) w.__perm = o.granted ? 'granted' : 'default'
    const reg = { pushManager: { getSubscription: async () => w.__sub ?? null, subscribe: async () => (w.__sub = sub) } }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg), register: async () => reg, getRegistration: async () => reg, getRegistrations: async () => [reg], addEventListener() {}, removeEventListener() {}, controller: null } })
    if (!('PushManager' in window)) w.PushManager = function () {}
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => w.__perm as string })
    Notification.requestPermission = async () => (w.__perm = 'granted') as NotificationPermission
  }, opts)
}

test.beforeEach(async ({ page, context }) => {
  fake = await new FakeSupabase().start('2030-01-07 09:00')
  await fake.attach(page)
  await stubPush(page, { granted: true, subscribed: true })
  await page.clock.install({ time: NOW_UTC })
  await context.grantPermissions(['geolocation'])
  await context.setGeolocation({ latitude: 25.0805, longitude: 55.1403 })
  page.on('pageerror', e => { throw e })
})

async function signIn(page: Page, who: keyof typeof STAFF) {
  await page.goto('/')
  await page.getByLabel('Email').fill(STAFF[who].email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
}
async function signInTo(page: Page, who: keyof typeof STAFF) {
  await page.goto('/')
  await page.getByLabel('Email').fill(STAFF[who].email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
async function seedBooking(who: keyof typeof STAFF, over: Record<string, unknown> = {}) {
  const [b] = await fake.db.as<{ id: string }>(STAFF[who].id, 'select * from public.book_viewing($1::jsonb)', [JSON.stringify({
    date: '2030-01-08', start_time: '11:00', duration_hours: 2, area: 'Business Bay', trip_type: 'direct', location: 'Bay Square 5', purpose: 'Seeded viewing', ...over })])
  return b.id
}

test('wrong password is refused with a clear message', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Email').fill(STAFF.shazia.email)
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
})

test('agent: books from a free gap, fixes a mistake, edits, then cancels', async ({ page }) => {
  await seedBooking('bahaa') // Tue 11:00–1:00 is taken
  await signIn(page, 'shazia')
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([/Calendar/, /Mine/, /Account/])

  await page.getByRole('button', { name: /^Tue\s*8/ }).click()
  await expect(page.getByRole('button', { name: /Driver free 1:00 PM – 6:00 PM/ })).toBeVisible()
  await page.getByRole('button', { name: /Driver free 1:00 PM – 6:00 PM/ }).click()
  const form = page.getByRole('dialog', { name: 'Book the driver' })
  await expect(form.getByLabel('Start time')).toHaveValue('13:00')

  // Forgot the purpose and area → the form says exactly what is missing.
  await form.getByLabel(/^Location/).fill('Marina Gate 1')
  await form.getByRole('button', { name: 'Book viewing' }).click()
  await expect(form.getByText('Area is required')).toBeVisible()
  await expect(form.getByText('Purpose is required')).toBeVisible()

  // Picks a clashing time first → live warning.
  await form.getByLabel('Start time').fill('12:00')
  await expect(form.getByText(/Driver is already booked 11:00 AM – 1:00 PM/i)).toBeVisible()
  await form.getByLabel('Start time').fill('14:00')
  await form.getByLabel('Area').selectOption('Dubai Marina')
  await form.getByLabel(/Purpose/).fill('2BR viewing with Mr Ahmed')
  await form.getByRole('button', { name: 'Book viewing' }).click()
  await expect(form).toBeHidden()
  await expect(page.getByText('Booking submitted')).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp' }).first()).toHaveAttribute('href', /wa\.me\/971508123721/)

  await page.getByRole('link', { name: /Mine/ }).click()
  const card = page.getByRole('article').filter({ hasText: 'Marina Gate 1' })
  await expect(card.getByText('Pending')).toBeVisible()
  await card.getByRole('button', { name: 'Edit' }).click()
  await page.getByRole('dialog', { name: 'Edit booking' }).getByLabel(/Purpose/).fill('2BR viewing — client bringing wife')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit booking' })).toBeHidden()
  await expect(card.getByText('client bringing wife')).toBeVisible()

  await card.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('dialog', { name: 'Cancel this booking?' }).getByLabel(/Reason/).fill('Client postponed')
  await page.getByRole('button', { name: 'Cancel booking' }).click()
  await expect(card.getByText('Cancelled', { exact: true })).toBeVisible()
  await expect(card.getByText(/Client postponed/)).toBeVisible()

  const [row] = await fake.db.pg.query<{ status: string; agent_id: string }>(`select status, agent_id from public.bookings where location='Marina Gate 1'`).then(r => r.rows)
  expect(row).toEqual({ status: 'cancelled', agent_id: STAFF.shazia.id })
})

test('agent cannot reach manager or admin screens or act on others’ bookings', async ({ page }) => {
  await seedBooking('bahaa')
  await signIn(page, 'shazia')
  for (const p of ['/manage', '/staff', '/trips']) {
    await page.goto(p)
    await expect(page.getByText('Driver calendar')).toBeVisible()
  }
  await page.getByRole('button', { name: /^Tue\s*8/ }).click()
  await page.getByRole('button', { name: /11:00 AM Business Bay, Bahaa Khizer/ }).click()
  const card = page.getByRole('dialog', { name: 'Booking' }).getByRole('article')
  await expect(card).toBeVisible()
  await expect(card.getByText('Bahaa Khizer')).toBeVisible()      // who booked it
  await expect(card.getByText('Seeded viewing')).toHaveCount(0)    // but not the client details
  await expect(card.getByRole('button')).toHaveCount(0)
  // Even a hand-made request is refused by the database.
  const res = await page.evaluate(async url => {
    const tok = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.includes('auth-token'))!)!).access_token
    const r = await fetch(url + '/rest/v1/rpc/confirm_booking', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json', apikey: 'test' }, body: JSON.stringify({ bid: '00000000-0000-0000-0000-000000000000' }) })
    return (await r.json()).message
  }, FAKE_URL)
  expect(res).toMatch(/Only managers/)
})

test('manager: confirms, reschedules, checks the report and exports CSV', async ({ page }) => {
  const id = await seedBooking('shazia')
  await seedBooking('bahaa', { start_time: '15:00', duration_hours: 1, location: 'Damac Hills' })
  await signIn(page, 'nabeeha')
  await page.getByRole('link', { name: /Manage/ }).click()
  await expect(page.getByRole('tab', { name: 'Needs confirming (2)' })).toBeVisible()

  const card = page.getByRole('article').filter({ hasText: 'Bay Square 5' })
  await card.getByRole('button', { name: /Confirm/ }).click()
  await expect(page.getByText('Confirmed', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/971522647579/)
  await expect(page.getByRole('tab', { name: 'Needs confirming (1)' })).toBeVisible()

  await page.getByRole('tab', { name: 'Upcoming' }).click()
  await card.getByRole('button', { name: 'Reschedule' }).click()
  const dlg = page.getByRole('dialog', { name: 'Reschedule' })
  await dlg.getByLabel('New start').fill('15:30') // clashes with Bahaa 3–4 PM
  await dlg.getByRole('button', { name: 'Move booking' }).click()
  await expect(page.getByText(/Driver is already booked 3:00 PM – 4:00 PM/)).toBeVisible()
  await dlg.getByLabel('New date').fill('2030-01-09')
  await dlg.getByRole('button', { name: 'Move booking' }).click()
  await expect(dlg).toBeHidden()
  await expect(card.getByText('Rescheduled')).toBeVisible()
  await expect(card.getByText(/Moved from/)).toBeVisible()

  await page.getByRole('button', { name: /Report/ }).click()
  await expect(page.getByRole('dialog', { name: 'Driver utilisation' })).toBeVisible()
  await page.keyboard.press('Escape')

  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: /CSV/ }).click()
  const csv = await (await dl).createReadStream().then(s => new Promise<string>(ok => { let t = ''; s.on('data', c => (t += c)); s.on('end', () => ok(t)) }))
  expect(csv).toContain('Bay Square 5'); expect(csv).toContain('Rescheduled'); expect(csv).toContain('Shazia Larik')

  const [r] = await fake.db.pg.query<{ status: string; date: string }>(`select status, date::text from public.bookings where id=$1`, [id]).then(r => r.rows)
  expect(r).toEqual({ status: 'rescheduled', date: '2030-01-09' })
})

test('driver: sees confirmed trips, shares location, completes a trip', async ({ page }) => {
  const id = await seedBooking('shazia', { date: '2030-01-07', start_time: '10:00', duration_hours: 1, trip_type: 'pickup', pickup_location: 'Tierra office' })
  await seedBooking('bahaa', { date: '2030-01-07', start_time: '13:00', location: 'Still pending tower' })
  await fake.db.as(STAFF.nabeeha.id, 'select public.confirm_booking($1)', [id])
  await signIn(page, 'gagan')
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1) // pending trip not shown
  await expect(page.getByText('Tierra office')).toBeVisible()

  await expect(page.getByText('Sharing live location')).toBeVisible()          // automatic in working hours, no switch
  await expect.poll(async () => (await fake.db.pg.query('select * from public.driver_location')).rows.length).toBe(1)

  await page.getByRole('button', { name: /Completed/ }).click()
  await expect(page.getByText('This trip has not started yet')).toBeVisible()
  await fake.db.setNow('2030-01-07 10:05'); await page.clock.setSystemTime(new Date('2030-01-07T06:05:00Z'))
  await page.getByRole('button', { name: /Completed/ }).click()
  await expect(page.getByRole('article').getByText('Completed', { exact: true })).toBeVisible()

  await page.clock.setSystemTime(new Date('2030-01-07T14:31:00Z'))                // 6:31 PM Dubai — after hours
  await page.clock.runFor(61_000)
  await expect(page.getByText('Location off — outside working hours')).toBeVisible()
  await expect.poll(async () => (await fake.db.pg.query('select * from public.driver_location')).rows.length).toBe(0)
})

test('admin: adds a staff member who can sign in, then deactivates them', async ({ page, browser }) => {
  await signIn(page, 'faisal')
  await page.getByRole('link', { name: /Staff/ }).click()
  await page.getByRole('button', { name: /Add staff/ }).click()
  const d = page.getByRole('dialog', { name: 'Add staff member' })
  await d.getByLabel(/Full name/).fill('Sinit Thomas')
  await d.getByLabel(/Email/).fill('sinit@tierra.test')
  await d.getByLabel(/WhatsApp/).fill('+971567589593')
  await d.getByLabel(/Temporary password/).fill('Welcome-2030')
  await d.getByRole('button', { name: 'Create login' }).click()
  await expect(page.getByText('Sinit Thomas can now sign in')).toBeVisible()

  const row = page.locator('.card').filter({ hasText: 'Sinit Thomas' })
  await row.getByRole('button', { name: 'Deactivate' }).click()
  await expect(row.getByRole('button', { name: 'Activate' })).toBeVisible()

  const p2 = await browser.newPage(); await fake.attach(p2); await stubPush(p2, { granted: true, subscribed: true }); await p2.clock.install({ time: NOW_UTC })
  await p2.goto('/'); await p2.getByLabel('Email').fill('sinit@tierra.test'); await p2.getByLabel('Password').fill('Welcome-2030')
  await p2.getByRole('button', { name: 'Sign in' }).click()
  await expect(p2.getByRole('heading', { name: 'Account not active' })).toBeVisible()
  await p2.close()
})

test('everyone can change their password and sign out', async ({ page }) => {
  await signIn(page, 'bahaa')
  await page.getByRole('link', { name: /Account/ }).click()
  await page.getByLabel('New password', { exact: true }).fill('short')
  await page.getByLabel('Repeat new password').fill('short')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Use at least 8 characters')).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('Brand-new-pass-1')
  await page.getByLabel('Repeat new password').fill('Brand-new-pass-1')
  await page.getByRole('button', { name: 'Update password' }).click()
  await expect(page.getByText('Password changed')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
})

test('admin: adds many staff at once; a new person must choose a password, then sees their old bookings', async ({ page, browser }) => {
  await fake.db.pg.query(`insert into public.bookings (legacy_id, agent_name, date, start_time, duration_mins, area, location, purpose, status)
    values ('-OLD1', 'Oshani Amaranath', '2029-12-20', '10:00', 60, 'Al Barsha', 'Al Rasis Business Centre', 'Cheque deposit', 'completed')`)
  await signIn(page, 'faisal')
  await page.getByRole('link', { name: /Staff/ }).click()
  await page.getByRole('button', { name: 'Add many' }).click()
  const d = page.getByRole('dialog', { name: 'Add many staff' })
  await d.getByLabel('Staff list').fill('Name, Email, Phone, Role, Department\nOshani Amaranath, oshani@tierra.test, 054 526 4159, agent, Operations/Management Department\nShazia Again, shazia@tierra.test, +971522647579\nBad Line, nope')
  await expect(d.getByText('Line 4: email "nope" is not valid')).toBeVisible()
  await expect(d.getByRole('button', { name: /Create 2 logins/ })).toBeDisabled()
  await d.getByLabel('Staff list').fill('Oshani Amaranath, oshani@tierra.test, 054 526 4159, Accountant, Accounts Department\nShazia Again, shazia@tierra.test, +971522647579')
  await expect(d.getByRole('cell', { name: '+971545264159' })).toBeVisible()
  await expect(d.getByRole('cell', { name: 'Accountant' })).toBeVisible()
  await expect(d.getByLabel('App access for Oshani Amaranath')).toHaveValue('agent')
  await d.getByLabel('App access for Oshani Amaranath').selectOption('manager')
  await d.getByRole('button', { name: 'Create 2 logins' }).click()

  const done = page.getByRole('dialog', { name: 'Logins created' })
  await expect(done.getByText('This email already has a login')).toBeVisible()      // Shazia already exists
  const row = done.locator('.card').filter({ hasText: 'Oshani Amaranath' })
  await expect(row.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/971545264159\?text=.*Temporary%20password/)
  const temp = (await row.locator('.font-mono').textContent())!.trim()

  const p2 = await browser.newPage(); await fake.attach(p2); await stubPush(p2, { granted: true, subscribed: true }); await p2.clock.install({ time: NOW_UTC })
  await p2.goto('/'); await p2.getByLabel('Email').fill('oshani@tierra.test'); await p2.getByLabel('Password').fill(temp)
  await p2.getByRole('button', { name: 'Sign in' }).click()
  await expect(p2.getByRole('heading', { name: 'Welcome, Oshani' })).toBeVisible()
  await p2.getByLabel('New password (8+ characters)').fill('Oshani-own-pass-1')
  await p2.getByLabel('Repeat new password').fill('Oshani-own-pass-1')
  await p2.getByRole('button', { name: 'Save and continue' }).click()
  await expect(p2.getByText('Driver calendar')).toBeVisible()
  await p2.getByRole('link', { name: /Mine/ }).click()
  await p2.getByRole('tab', { name: 'Completed' }).click()
  await expect(p2.getByText('Cheque deposit')).toBeVisible()                       // her old Firebase booking is hers now
  const [o] = await fake.db.pg.query<{ role: string; job_title: string }>(`select role, job_title from public.profiles where full_name='Oshani Amaranath'`).then(r => r.rows)
  expect(o).toEqual({ role: 'manager', job_title: 'Accountant' })
  await p2.close()
})

test('notifications are compulsory: blocked until turned on; signing out unregisters the phone', async ({ browser }) => {
  const page = await browser.newPage(); await fake.attach(page); await stubPush(page, { granted: false, subscribed: false }); await page.clock.install({ time: NOW_UTC })
  await fake.db.pg.query(`insert into public.app_secrets (name, value) values ('vapid_public', 'BAbc') on conflict (name) do update set value = excluded.value`)
  await signInTo(page, 'shazia')
  await expect(page.getByRole('heading', { name: 'Turn on notifications' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)            // no way into the app yet
  await page.getByRole('button', { name: 'Turn on notifications' }).click()
  await expect(page.getByText('Driver calendar')).toBeVisible()
  const subs = () => fake.db.pg.query<{ user_id: string }>('select user_id from public.push_subscriptions').then(r => r.rows)
  expect(await subs()).toEqual([{ user_id: STAFF.shazia.id }])
  await page.getByRole('link', { name: /Account/ }).first().click()
  await expect(page.getByText('On for this device')).toBeVisible()
  await page.getByRole('button', { name: 'Send a test' }).click()
  await expect(page.getByText(/Test sent/)).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  expect(await subs()).toEqual([])
  await page.close()
})

test('the driver must allow location before using the app', async ({ browser }) => {
  const ctx = await browser.newContext()                                                   // no location permission yet
  const page = await ctx.newPage(); await fake.attach(page); await stubPush(page, { granted: true, subscribed: true }); await page.clock.install({ time: NOW_UTC })
  await signInTo(page, 'gagan')
  await expect(page.getByRole('heading', { name: 'Allow your location' })).toBeVisible()
  await expect(page.getByText(/never shared outside working hours/)).toBeVisible()
  await ctx.grantPermissions(['geolocation']); await ctx.setGeolocation({ latitude: 25.08, longitude: 55.14 })
  await page.getByRole('button', { name: 'Allow location' }).click()
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
  await ctx.close()
})
