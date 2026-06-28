self.addEventListener("push", function (event) {
  console.log("Push message received.");
  let notificationTitle = "Imagey";
  const notificationOptions = {
    body: "Du hast eine neue Nachricht.",
    icon: "/image192.png",
    badge: "/image192.png",
    tag: "imagey-chat",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(notificationTitle, notificationOptions),
  );
});

self.addEventListener("notificationclick", function (event) {
  console.log("Notification click received.");
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/chats") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/chats");
      }
    }),
  );
});
