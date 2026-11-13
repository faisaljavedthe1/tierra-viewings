// Design review screenshots (not part of CI): SCREENS=/path npx playwright test zz-screens --project=phone
import { test, type Page } from '@playwright/test'
import { FakeSupabase, PASSWORD, STAFF } from './fake-supabase'

const OUT = process.env.SCREENS
test.skip(!OUT, 'design screenshots only on request')
const NOW = new Date('2030-01-07T06:10:00Z') // Mon 10:10 Dubai

async function setup(page: Page, who: keyof typeof STAFF, push = true) {
  const fake = await new FakeSupabase().start('2030-01-07 10:10')
  await fake.attach(page)
  await page.addInitScript(granted => {
    const w = window as unknown as Record<string, unknown>
    const sub = { endpoint: 'https://fcm.googleapis.com/x', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'B'.repeat(87), auth: 'A'.repeat(22) } } }, unsubscribe: async () => true }
    const reg = { pushManager: { getSubscription: async () => (granted ? sub : null), subscribe: async () => sub } }
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve(reg), register: async () => reg, getRegistration: async () => reg, getRegistrations: async () => [], addEventListener() {}, removeEventListener() {} } })
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => (granted ? 'granted' : 'default') })
  }, push)
  await page.clock.install({ time: NOW })
  const book = async (who: keyof typeof STAFF, o: Record<string, unknown>) => (await fake.db.as<{ id: string }>(STAFF[who].id, 'select * from public.book_viewing($1::jsonb)', [JSON.stringify({ duration_hours: 1.5, trip_type: 'direct', purpose: 'Client viewing', ...o })]))[0].id
  await fake.db.setNow('2030-01-06 09:00')
  const a = await book('shazia', { date: '2030-01-07', start_time: '11:00', area: 'Dubai Marina', location: 'Marina Gate 1' })
  await book('bahaa', { date: '2030-01-07', start_time: '13:30', duration_hours: 2, area: 'Damac Hills / Hills 2', location: 'Damac Hills 2' })
  const c = await book('shazia', { date: '2030-01-07', start_time: '16:00', area: 'Business Bay', location: 'Bay Square 5', trip_type: 'pickup', pickup_location: 'Tierra office' })
  await book('bahaa', { date: '2030-01-08', start_time: '10:00', area: 'JVC', location: 'Bloom Towers' })
  await fake.db.as(STAFF.nabeeha.id, 'select public.confirm_booking($1)', [a])
  await fake.db.as(STAFF.nabeeha.id, 'select public.confirm_booking($1)', [c])
  await fake.db.setNow('2030-01-07 10:10')
  await page.goto('/')
  return { fake, signIn: async () => {
    await page.getByLabel('Email').fill(STAFF[who].email); await page.getByLabel('Password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
  } }
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })

test('screens', async ({ page }) => {
  const s = await setup(page, 'nabeeha')
  await shot(page, '01-login')
  await s.signIn(); await page.getByText('Driver calendar').waitFor()
  await shot(page, '02-calendar')
  await page.getByRole('button', { name: /11:00 AM Dubai Marina/ }).click(); await page.waitForTimeout(400)
  await shot(page, '03-booking-sheet'); await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Book', exact: true }).click(); await page.waitForTimeout(400)
  await shot(page, '04-book-form'); await page.keyboard.press('Escape')
  await page.getByRole('link', { name: /Manage/ }).last().click(); await page.waitForTimeout(500)
  await shot(page, '05-manage')
})
test('setup + driver', async ({ browser }) => {
  const ctx = await browser.newContext({ ...(await import('@playwright/test')).devices['Pixel 7'], permissions: ['geolocation'], geolocation: { latitude: 25.08, longitude: 55.14 } })
  const page = await ctx.newPage()
  const s = await setup(page, 'gagan', false)
  await s.signIn(); await page.getByRole('heading', { name: 'Turn on notifications' }).waitFor()
  await shot(page, '06-setup-notifications')
  await ctx.close()
  const ctx2 = await browser.newContext({ ...(await import('@playwright/test')).devices['Pixel 7'], permissions: ['geolocation'], geolocation: { latitude: 25.08, longitude: 55.14 } })
  const p2 = await ctx2.newPage(); const s2 = await setup(p2, 'gagan')
  await s2.signIn(); await p2.getByRole('heading', { name: 'My trips' }).waitFor(); await p2.waitForTimeout(500)
  await shot(p2, '07-driver')
  await ctx2.close()
})
