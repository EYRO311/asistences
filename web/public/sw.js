// Fase 6 del plan de implementación: service worker mínimo para Web Push.
// Solo maneja push/notificationclick — no hace caching offline (esta app no
// es una PWA offline-first en web, eso ya lo cubre la app mobile).

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Recordatorio", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Recordatorio";
  const options = {
    body: data.body || "",
    icon: "/file.svg",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
