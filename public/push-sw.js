// Loaded into the app's service worker: shows phone notifications and opens the app when tapped.
self.addEventListener('push', event => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Tierra Viewings', body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.title || 'Tierra Viewings', {
    body: d.body || '', tag: d.tag, renotify: Boolean(d.tag), icon: '/icon-192.png', badge: '/icon-192.png',
    data: { url: typeof d.url === 'string' && /^\/(?!\/)[\w\-/]*$/.test(d.url) ? d.url : '/' }, // in-app paths only
  }))
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = new URL(event.notification.data && event.notification.data.url || '/', self.location.origin).href
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.navigate(url); return c.focus() }
    return self.clients.openWindow(url)
  }))
})
