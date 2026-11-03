// Pillar's service worker. It only shows reminders: pages always come from the
// network, so nobody can be left looking at old numbers.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Pillar", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/favicon.png",
      tag: data.tag,
      data: { url: data.url || "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((open) => {
      for (const c of open) {
        if (new URL(c.url).pathname.startsWith("/app") && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
