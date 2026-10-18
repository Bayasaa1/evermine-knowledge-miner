/* Minimal service worker so mobile browsers can display Evermind notifications.
 * It never caches pages or feed data, and wipes any cache left by older versions,
 * so a phone can never show a month-old feed. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch(() => undefined)
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) return c.focus();
      }
      return self.clients.openWindow(url || "/explore");
    }),
  );
});
