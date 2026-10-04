# Browser-Notifications (Web Push) — Testplan für die manuellen Tests

Ergänzt `docs/adr/0020-web-push-notifications.md`. Die automatischen
Tests (Playwright/Pact, JUnit) decken Logik und Fehlerpfade ab. Dieser Plan
prüft, was sich nur mit echten Browsern, echtem Push-Dienst (FCM, Mozilla
autopush, APNs/WebKit) und echten Geräten testen lässt.

Ergebnisse trägst du direkt in die Checkboxen und die Ergebnistabelle am Ende
ein (Datum, Browser/Version, OK / Fehler + Notiz).

## 1. Voraussetzungen

### 1.1 Umgebung

| Was | Wofür |
| --- | --- |
| Docker (Compose) mit **Internetzugang** | Der Server sendet an FCM/Mozilla/Apple. Ohne ausgehende HTTPS-Verbindung kommt nichts an. |
| Production-Build (`docker compose up -d --build`) | Der Service Worker wird nur im Production-Build registriert, nicht unter `npm run dev`. |
| Chrome und Firefox (Desktop, aktuelle Versionen) | T1–T9 |
| iPhone/iPad mit iOS ≥ 16.4 und Safari | T10, T11 |
| Öffentliche **HTTPS**-URL auf den Docker-Stack | Nur für iOS nötig (Tunnel, z. B. `cloudflared tunnel --url http://localhost:8080`, oder die Deploy-Umgebung mit eigenem VAPID-Paar). Auf Desktop reicht `http://localhost:8080` (gilt als Secure Context). |

Falls Port 8080 belegt ist, andere Ports setzen (siehe README, „Running
Multiple Environments in Parallel“) und die URLs unten anpassen.

### 1.2 Stack starten

```bash
docker compose up -d --build
```

- App: `http://localhost:8080` (Frontend wird vom Backend ausgeliefert)
- Greenmail-API (Registrierungs-Mails): `http://localhost:8081`
- Test-VAPID-Paar ist in `docker-compose.yml` bereits gesetzt.

Kurzcheck, dass das Feature im Backend aktiv ist:

```bash
curl -i http://localhost:8080/users/push/vapid-public-key
```

Erwartet: `200` und der Public Key `BH4iRy_wgrU6TL1DLmVr7UtWrRSJYCY6RBj92CDOQZGL6ziXJ6fUXwJYxzGxIF4MrzqX4TXMMSQAubhvbSy3IyU`.

Server-Logs während der Tests mitlesen (Fehler beim Senden, 404/410):

```bash
docker compose logs -f meecrowave
```

### 1.3 Testkonten

Es werden **zwei Konten** gebraucht, plus für T7 ein drittes im selben
Browser. Registrierung wie im README („Local Testing and Registration“):
Mail über Greenmail abrufen, Link auf `http://localhost:8080` umschreiben,
Passwort setzen.

| Name | Rolle | Browser |
| --- | --- | --- |
| **Mary** | Empfängerin (hier wird getestet) | Chrome-Profil A, später Firefox-Profil, iOS |
| **Laura** | Absenderin | separates Chrome-Profil B bzw. Inkognito-Fenster (eigener Storage, sonst teilen sich beide Konten die Push-Subscription) |
| **Alice** | drittes Konto für T7 | im selben Browser wie Mary |

Vorbereitung vor T2: Mary und Laura sind Kontakte (Einladung + Annahme),
Mary hat mit Laura einen 1:1-Chat und beide sind in einer **Gruppe**
(„Testgruppe“, Mary ist Mitglied, nicht Owner → deckt den Pfad mit
`groupKey` im Chat-Eintrag ab; zusätzlich eine zweite Gruppe, die Mary selbst
angelegt hat). Mindestens ein Bild liegt in Laura's Dokumenten.

### 1.4 Begriffe

- **„App geschlossen“** = alle Tabs der App sind zu, der Browser läuft aber
  noch (Chrome/Firefox dürfen im Hintergrund weiterlaufen). Zusätzlich in
  T2 einmal mit komplett beendetem Browser, soweit die Plattform das
  unterstützt (Chrome: „Im Hintergrund weiterlaufen“ aktiviert).
- **„Angemeldet bleiben“** = Checkbox „Angemeldet bleiben“ im
  Geräte-Dialog beim Login. Nur dann kann der Service Worker Vorschauen
  entschlüsseln.
- Erwartete Texte (Deutsch, siehe `de.json`):
  - Fallback 1:1 / Gruppe: „Neue Nachricht“, Titel = App-Name
  - Kontaktanfrage: „Neue Kontaktanfrage“; angenommen: „Kontaktanfrage angenommen“
  - Geteiltes Dokument: „Hat ein Dokument geteilt“
  - Gruppeneinladung: „Lädt dich in {Gruppe} ein“

## 2. Testfälle

Legende: **Soll** = erwartetes Ergebnis. Jeder Fall wird in Chrome **und**
Firefox ausgeführt, sofern nicht anders angegeben.

### T1 — Opt-in und Einstellungen

Konto: Mary, frisches Browserprofil, „Angemeldet bleiben“ **an**.

- [ ] **T1.1 Banner.** Nach dem Login in „Chats“ erscheint oben der Hinweis
  „Werde über neue Nachrichten benachrichtigt, auch wenn … geschlossen ist.“
  mit „Nicht jetzt“ / „Aktivieren“. Die Berechtigung wurde **noch nicht**
  angefragt.
- [ ] **T1.2 „Nicht jetzt“.** Banner verschwindet, bleibt nach Reload und
  Neustart des Browsers weg. Berechtigung bleibt „Standard“.
- [ ] **T1.3 Aktivieren über den Banner** (Profil zurücksetzen oder
  `localStorage`-Key `imagey.notificationBannerDismissed` löschen). Klick auf
  „Aktivieren“ → Browser fragt die Berechtigung an → „Zulassen“ → Banner
  verschwindet.
  - Server: `PUT /users/{id}/devices/{deviceId}/push-subscription` mit `204`
    (DevTools → Netzwerk).
  - Datei vorhanden:
    `docker compose exec meecrowave find / -name push-subscription.json 2>/dev/null`
- [ ] **T1.4 Einstellungen.** Einstellungen → „Benachrichtigungen“: Schalter
  „Benachrichtigungen auf diesem Gerät“ ist **an**. Layout stimmt (Liste links
  auf Desktop, kein Überlappen mit der Navigation), Zurück-Button funktioniert
  auf dem Smartphone-Layout.
- [ ] **T1.5 Ausschalten.** Schalter aus → `DELETE …/push-subscription` mit
  `204`, die Datei ist weg. Wieder an → neues PUT, Datei wieder da. Es
  erscheint keine zweite Berechtigungsabfrage.
- [ ] **T1.6 Blockiert.** Berechtigung in den Browser-Einstellungen auf
  „Blockieren“ setzen → Seite neu laden: statt des Schalters steht dort
  „Benachrichtigungen sind blockiert. Aktiviere sie in deinen
  Browser-Einstellungen.“ Kein Banner.
- [ ] **T1.7 Hinweis ohne „Angemeldet bleiben“.** Mit einem Gerät, das **ohne**
  „Angemeldet bleiben“ angemeldet ist, Push aktivieren: Unter dem Schalter
  steht „Ohne „Angemeldet bleiben“ siehst du nur „Neue Nachricht“.“ Mit
  „Angemeldet bleiben“ steht der Hinweis nicht da.
- [ ] **T1.8 Fehlerfall: Feature aus.** Stack ohne VAPID-Keys starten (die
  beiden `-Dpush.vapid.*`-Optionen aus `MEECROWAVE_OPTS` entfernen):
  `GET /users/push/vapid-public-key` → `404`. Der Schalter lässt sich nicht
  aktivieren, es erscheint „Benachrichtigungseinstellungen konnten nicht
  aktualisiert werden“. Die App läuft sonst normal, im Log steht kein
  Startfehler. Danach Stack wieder mit Keys starten.

### T2 — Nachrichten bei geschlossener App (Chrome und Firefox Desktop)

Vorbedingung: Mary hat Push **aktiviert**, „Angemeldet bleiben“ **an**, und
die Chats (1:1 mit Laura, Testgruppe) **mindestens einmal geöffnet**, damit
sie im Keyring stehen. Alle Tabs von Mary sind zu. Laura sendet.

- [ ] **T2.1 Text 1:1.** Laura schreibt „Hallo Mary“. Soll: Notification mit
  Titel „Laura“ (bzw. Kontaktname), Text „Hallo Mary“, Icon der App.
- [ ] **T2.2 Gruppe.** Laura schreibt in die Testgruppe. Soll: Titel =
  Gruppenname, Text „Laura: {Text}“.
- [ ] **T2.3 Geteiltes Dokument.** Laura teilt ein Bild und eine Datei im 1:1-Chat. Soll: Text
  „Hat ein Dokument geteilt“.
- [ ] **T2.4 Gruppeneinladung.** Laura lädt Mary in eine neue Gruppe ein.
  Soll: Text „Lädt dich in {Gruppe} ein“.
- [ ] **T2.5 Kontaktanfrage.** Laura lädt Alice ein (Alice ist registriert und
  hat in ihrem Browser Push aktiviert, siehe T7). Soll bei Alice: „Neue
  Kontaktanfrage“ (generisch, ohne Namen).
- [ ] **T2.6 Anfrage angenommen.** Der Eingeladene nimmt an. Soll beim
  Einladenden: „Kontaktanfrage angenommen“.
- [ ] **T2.7 Lange Nachricht.** Nachricht mit > 150 Zeichen: Text wird bei 120
  Zeichen mit „…“ gekürzt.
- [ ] **T2.8 Zusammenfassen.** Laura sendet drei Nachrichten kurz hintereinander
  in denselben Chat. Soll: **eine** Notification pro Chat, die die jeweils
  neueste Nachricht zeigt und erneut aufmerksam macht (kein Stapel aus drei
  Einträgen). Nachrichten aus einem anderen Chat erzeugen eine eigene
  Notification.
- [ ] **T2.9 Klick.** Klick auf eine Chat-Notification öffnet die App im
  passenden Chat (`/chats/{owner}/{chatId}` bzw. bei Gruppen die
  Gruppenroute). Läuft schon ein Tab auf dieser Route, wird er fokussiert und
  es entsteht kein zweiter. Klick auf eine Kontakt-Notification öffnet
  `/chats`.
- [ ] **T2.10 Browser komplett beendet.** Chrome/Firefox ganz schließen (Chrome
  mit „Apps im Hintergrund weiterlaufen lassen“), Laura sendet. Soll: Die
  Notification erscheint trotzdem (OS-abhängig; Abweichungen notieren).

Zusätzlich bei jedem Fall: Im Log darf kein `Failed to push-notify` oder
`Push service responded with status …` stehen.

### T3 — Unterdrückung bei sichtbarem Chat

- [ ] **T3.1** Mary hat den Chat mit Laura **sichtbar** im Vordergrund. Laura
  sendet. Soll: **keine** Notification, die Nachricht erscheint wie gewohnt im
  Chat (per Polling bzw. `postMessage`).
- [ ] **T3.2** Mary hat die App sichtbar, aber auf einem **anderen** Chat bzw.
  der Chat-Liste. Laura sendet. Soll: Notification wird angezeigt.
- [ ] **T3.3** Mary hat den Chat in einem Tab im Hintergrund (anderes Tab
  aktiv, Fenster minimiert). Soll: Notification wird angezeigt.
- [ ] **T3.4 Firefox/Chrome Dauer.** Fünf Nachrichten bei sichtbarem Chat
  nacheinander: Es erscheint danach keine Chrome-eigene Ersatz-Notification
  („Diese Website wurde im Hintergrund aktualisiert“). Falls doch: notieren
  (bekanntes Risiko „Stille Pushes“ aus dem Konzept).

### T4 — Gerät ohne „Angemeldet bleiben“

- [ ] **T4.1** Mary meldet sich mit einem neuen Browserprofil an, **ohne**
  „Angemeldet bleiben“, aktiviert Push. Laura sendet 1:1 und in der Gruppe.
  Soll: Notification mit Titel = App-Name und Text **„Neue Nachricht“**, keine
  Namen, keine Vorschau.
- [ ] **T4.2** Kontaktanfrage/-annahme verhalten sich wie in T2 (generisch).
- [ ] **T4.3** Klick öffnet `/chats`.
- [ ] **T4.4 Nachträglich „Angemeldet bleiben“.** Gerät erneut anmelden mit
  „Angemeldet bleiben“, Chats öffnen. Soll: Ab dann entschlüsselte
  Vorschauen wie in T2.
- [ ] **T4.5 Gegenprobe Datenschutz.** Im Browser: DevTools → Application →
  IndexedDB → `imagey-notifications` → `devices`. Der Eintrag enthält
  `keyring` (verschlüsselter String) und `recoveryBlob`, **keinen**
  Klartext von Namen, Schlüsseln oder Nachrichten.

### T5 — Chats, die auf dem Gerät nie geöffnet wurden

- [ ] **T5.1** Mary hat Push und „Angemeldet bleiben“ aktiv. Laura legt einen
  **neuen** Chat/eine neue Gruppe an, Mary öffnet nur die **Chat-Liste**
  (nicht den Chat). Nach einigen Sekunden sendet Laura. Soll: Notification
  mit Klartext-Vorschau (Keyring wurde im Hintergrund nachgeladen).
- [ ] **T5.2 Kontaktname.** Laura ändert ihren Anzeigenamen, Mary öffnet die
  Chat-Liste und schließt die App. Soll: Neue Notification zeigt den neuen
  Namen.

### T6 — Sprache

- [ ] **T6.1** Mary stellt die App auf Englisch um, öffnet die Chat-Liste und
  schließt die App. Laura teilt ein Dokument. Soll: Text „Shared a document“.
- [ ] **T6.2** Zurück auf Deutsch → „Hat ein Dokument geteilt“.
- [ ] **T6.3** Gerät ohne „Angemeldet bleiben“ zeigt den Fallback in der
  zuletzt benutzten Sprache („New message“ / „Neue Nachricht“).

### T7 — Mehrere Konten in einem Browser

Vorbedingung: Mary und Alice nutzen dasselbe Browserprofil (nacheinander
angemeldet), beide haben Push aktiviert (jedes Konto hat einen eigenen
Geräte-Eintrag in IndexedDB, die Browser-Subscription ist **eine**).

- [ ] **T7.1** Eingeloggt ist Mary (gültiges Session-Cookie). Laura schreibt an
  Mary → Vorschau im Klartext. Laura schreibt an Alice (nicht eingeloggt) →
  Notification mit „Neue Nachricht“ (kein Fehler).
- [ ] **T7.2** Alice deaktiviert Push (Schalter aus), Mary bleibt aktiv. Danach
  bekommt Mary weiterhin Notifications. In IndexedDB fehlt nur Alice's
  Eintrag. Die Browser-Subscription besteht weiter (`pushManager.getSubscription()`
  in der Konsole liefert ein Objekt).
- [ ] **T7.3** Mary deaktiviert ebenfalls. Jetzt gibt es keine Einträge mehr,
  die Browser-Subscription wird abgemeldet (`getSubscription()` → `null`).
- [ ] **T7.4 Kontowechsel.** Auf dem Gerät als anderer Nutzer anmelden
  (`handleWrongUser`): Der Keyring des vorherigen Kontos ist gelöscht bzw.
  wird nicht für das neue verwendet; es erscheinen keine fremden Namen oder
  Vorschauen.

### T8 — Widerruf und Aufräumen auf dem Server

- [ ] **T8.1 Abo im Browser entzogen.** In der Konsole der App:
  `(await (await navigator.serviceWorker.ready).pushManager.getSubscription()).unsubscribe()`.
  Datei `push-subscription.json` ist noch vorhanden. Laura sendet eine
  Nachricht. Soll: Keine Notification; im Server-Log erscheint kein
  Stacktrace. Nach kurzer Zeit (bzw. spätestens nach der nächsten Nachricht)
  ist die Datei **gelöscht** (Push-Dienst antwortet 404/410 → Subscription
  wird entfernt).
  `docker compose exec meecrowave find / -name push-subscription.json 2>/dev/null`
- [ ] **T8.2 Berechtigung entzogen.** In den Browser-Einstellungen die
  Berechtigung auf „Blockieren“ setzen, Laura sendet. Soll: Keine
  Notification, App läuft weiter. Nach erneutem Zulassen und erneutem
  Einschalten des Schalters (T1.5) funktioniert Push wieder.
- [ ] **T8.3 Service Worker entfernt.** DevTools → Application → Service
  Workers → „Unregister“. Seite neu laden: Der Service Worker ist neu
  registriert, der Schalter zeigt den korrekten Zustand an
  (Subscription/Berechtigung bleiben bestehen oder werden neu angelegt).
- [ ] **T8.4 Endpoint-Allowlist.** `PUT …/push-subscription` mit einem
  Endpoint außerhalb der Allowlist (z. B. `https://evil.example.com/x`) oder
  mit `http://…` liefert `400`, es wird keine Datei geschrieben.
- [ ] **T8.5 `pushsubscriptionchange`.** In Firefox/Chrome lässt sich das Event
  über DevTools auslösen (Chrome: Application → Service Workers →
  „Push“/Events; Firefox: `about:debugging`). Soll: Neues Abo wird per PUT
  gespeichert, Push funktioniert danach weiter.

### T9 — Berechtigungen und Sicherheit (API-Ebene)

Mit `curl` bzw. DevTools, eingeloggt als Mary (Session-Cookie vorhanden):

- [ ] **T9.1** `PUT` auf `…/devices/{fremdeDeviceId}/push-subscription` →
  `403` (Session ist nicht an dieses Gerät gebunden).
- [ ] **T9.2** `POST …/messages` mit `Notify: {userId-eines-Nichtmitglieds}`
  → Nachricht wird gespeichert (`201`), der Nicht-Mitglied-Empfänger erhält
  **keinen** Push.
- [ ] **T9.3** `Notify` mit leerem/ungültigem Eintrag (`a,,b`) → `400`.
- [ ] **T9.4** Push-Payload enthält keine Inhalte. Mit einem Proxy oder dem
  DevTools-Netzwerk lässt sich der Payload nicht lesen (verschlüsselt, RFC
  8291). Im Service-Worker-Debugger (`chrome://serviceworker-internals`,
  Firefox `about:debugging`) sichtbar: nur `type`, `recipient`, `owner`,
  `chatId`, `messageId` — **kein** Nachrichtentext, kein Name.

### T10 — iOS (Safari, nicht installiert)

Voraussetzung: HTTPS-URL (siehe 1.1), iOS ≥ 16.4.

- [ ] **T10.1** Seite in Safari öffnen, anmelden. Einstellungen →
  „Benachrichtigungen“: Statt des Schalters steht „Installiere diese App auf
  deinem Startbildschirm, um Benachrichtigungen zu aktivieren.“ Kein Banner
  in der Chat-Liste.

### T11 — iOS (installierte PWA)

- [ ] **T11.1 Installation.** Teilen → „Zum Home-Bildschirm“, App vom
  Home-Bildschirm starten, anmelden mit „Angemeldet bleiben“.
- [ ] **T11.2 Opt-in.** Banner in der Chat-Liste erscheint. Klick auf
  „Aktivieren“ → iOS fragt die Berechtigung an (nur durch Klick möglich) →
  „Erlauben“. Schalter in den Einstellungen ist an.
- [ ] **T11.3 App geschlossen.** App aus dem App-Wechsler entfernen, Laura
  sendet. Soll: Notification auf dem Sperrbildschirm mit Klartext-Vorschau
  (Titel = Chatname, Text = Nachricht).
- [ ] **T11.4 Gruppe, Bild, Einladung, Kontaktanfrage** wie T2.2–T2.6 (mind.
  Gruppe und Bild).
- [ ] **T11.5 Keine Unterdrückung unter WebKit.** App im Vordergrund auf dem
  Chat, Laura sendet. Soll: Es **wird** zusätzlich eine Notification
  angezeigt (WebKit entzieht sonst das Abo bei stillen Pushes). Die Nachricht
  erscheint trotzdem im Chat.
- [ ] **T11.6 Klick** auf die Notification öffnet die PWA im richtigen Chat.
- [ ] **T11.7 Ohne „Angemeldet bleiben“** (zweites Gerät/Neuinstallation):
  „Neue Nachricht“.
- [ ] **T11.8 Abo entziehen.** iOS-Einstellungen → Benachrichtigungen → App →
  aus. Laura sendet: keine Notification. Server entfernt das Abo nach der
  nächsten Nachricht (wie T8.1).

## 3. Regression (kurz, nach jedem Durchlauf)

- [ ] Registrierung, Login, Auto-Login mit „Angemeldet bleiben“ funktionieren
  weiterhin (kein Passwort-Prompt bei jedem Reload).
- [ ] Nachrichten senden/empfangen im geöffneten Chat (Polling) und
  Gruppennachrichten funktionieren auch **ohne** aktives Push unverändert.
- [ ] PWA-Installation und Offline-Cache der App-Shell funktionieren wie vor
  der Änderung (Service Worker ersetzt `public/sw.js`).
- [ ] Die Chat-Liste lädt auf Geräten **ohne** aktives Push nicht mehr
  Requests als vorher (kein Nachladen für den Keyring).

## 4. Fehlersuche

| Symptom | Prüfen |
| --- | --- |
| Es kommt gar nichts an | `curl …/users/push/vapid-public-key` = 200? `docker compose logs meecrowave` auf `Push service responded with status`/`Failed to send`. Container hat Internet? Ist `push-subscription.json` vorhanden? Auf dem Desktop: OS-„Nicht stören“ / Fokus-Modus aus? Chrome: `chrome://settings/content/notifications`. |
| Notification zeigt immer „Neue Nachricht“ | Gerät mit „Angemeldet bleiben“ angemeldet? Chat vorher geöffnet bzw. Chat-Liste geladen? IndexedDB `imagey-notifications` hat `keyring` und `recoveryBlob`? Session-Cookie des Kontos gültig (Sliding-Session, `SameSite=Lax`)? Konsole des Service Workers nach `Failed to load recovery key`/`Chat not found in notification keyring` durchsuchen. |
| Schalter fehlt / „Installiere diese App …“ | Auf iOS nur in der installierten PWA. Desktop: Production-Build? Unter `npm run dev` gibt es keinen Service Worker. |
| Schalter lässt sich nicht aktivieren | Browser blockiert? `GET /users/push/vapid-public-key` = 404 (Server ohne Keys)? Netzwerk: `PUT` liefert `403` → Session ist nicht an das Gerät gebunden (die App bindet und wiederholt automatisch, bei Fehler Seite neu laden). |
| `PUT` liefert `400` | Endpoint-Host nicht in `push.allowed-hosts` (Default: FCM, Mozilla, Apple, Windows). |
| Doppelte Notifications | Zwei Browser-Profile/Konten mit derselben Subscription? Alte Subscription nach Neuinstallation? `getSubscription()` und die Dateien auf dem Server vergleichen. |
| Service-Worker-Logs ansehen | Chrome: `chrome://serviceworker-internals` → „Inspect“. Firefox: `about:debugging#/runtime/this-firefox` → „Inspect“. |

## 5. Ergebnisse

| Fall | Chrome | Firefox | iOS | Notiz |
| --- | --- | --- | --- | --- |
| T1 Opt-in/Einstellungen | | | – | |
| T2 Nachrichten (App geschlossen) | | | – | |
| T3 Unterdrückung | | | – | |
| T4 ohne „Angemeldet bleiben“ | | | | |
| T5 ungeöffnete Chats | | | | |
| T6 Sprache | | | – | |
| T7 mehrere Konten | | | – | |
| T8 Widerruf/Aufräumen | | | | |
| T9 API/Sicherheit | | | – | |
| T10 iOS nicht installiert | – | – | | |
| T11 iOS PWA | – | – | | |
| Regression | | | | |

Gefundene Fehler: als Issue mit Fallnummer, Browser/OS-Version, Server-Log und
(wenn möglich) Service-Worker-Konsole ablegen.
