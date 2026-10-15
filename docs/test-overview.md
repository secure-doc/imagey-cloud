# Test overview

Generated from the test titles and the comment above each test (2026-10-15). Pact: one user on one device against the Pact mock server; E2E: several users or devices against the real backend.

## Pact suite


### activity.test.ts

| Test | Comment |
|---|---|
| upload image from activity panel |  |

### authentication.test.ts

| Test | Comment |
|---|---|
| new user enters wrong email |  |
| new user visits page |  |
| existing user visits page with new device |  |
| new user clicks registration link |  |
| mary logges in with new device |  |
| unauthenticated with a userId but no device and no email falls back to the email dialog |  |
| keep me logged in remembers a previous opt-out |  |
| login with lost private key |  |
| switch user using wrong user button |  |
| existing user authenticates via challenge-response on existing device |  |
| existing user authenticates via challenge-response and selects keep me logged in |  |
| device unlock with keep me logged in stores a recovery key and a persistent cookie |  |
| existing user authenticates via challenge-response but provides wrong password |  |
| passwords do not match shows error |  |
| unlockLocalDeviceKey fails if private key missing locally |  |
| existing user auto-logs in with stored recovery key |  |
| existing user fails auto-login due to wrong recovery key |  |

### chat.test.ts

| Test | Comment |
|---|---|
| view chat and send message |  |
| show day separators for messages of several days |  |
| show the last activity of each chat in the chat list |  |
| send empty message does not submit |  |
| send message fails and restores input |  |
| polling fails gracefully |  |
| share a document in chat |  |
| view chat shows the contact's display name and avatar |  |

### chats.test.ts

| Test | Comment |
|---|---|
| pick up an accepted invitation again after a failed confirm reuses the chat |  |
| pick up an accepted invitation fails when confirming receipt fails |  |

### contacts.test.ts

| Test | Comment |
|---|---|
| wrong contact email |  |
| send contact request from the chats list without a known inviter email |  |
| invite contact from empty panel |  |
| invite from empty panel sends an empty inviter email when it is not known locally |  |
| cancel invite contact from empty panel |  |
| send contact request prompts for a display name when mary has no public profile yet |  |
| cancel the display-name prompt when sending a contact request |  |
| send contact request fails gracefully when the POST fails |  |
| invite from empty panel prompts for a display name when mary has no public profile yet |  |

### devices.test.ts

| Test | Comment |
|---|---|
| mary renames her second device |  |
| mary cannot rename a device with a session that is not bound to a device |  |
| mary renames a device after her session was bound to her device |  |
| mary sees an error when the server still refuses renaming after binding |  |
| mary sees an error when renaming a device fails |  |
| mary cancels activating her second device |  |
| a newly registered device stores its encrypted info |  |

### document.test.ts

| Test | Comment |
|---|---|
| a file tile in a folder downloads on click |  |
| an HTML file downloads its original content instead of being rendered |  |
| a shared file in a group chat downloads via the two-hop Access-Path |  |
| a wrong document type behind a file tile shows an error, not a crash |  |
| a load error shows an error snackbar and does not download |  |
| clicking a busy file tile twice triggers only one download |  |
| mobile with the share API shares instead of downloading |  |
| mobile share cancelled by the user does not fall back to a download |  |
| mobile with an expired gesture shows a dialog whose Open re-shares without reloading |  |
| cancelling the expired-gesture dialog shares nothing |  |
| a gesture that stays blocked even on retry shows the error snackbar |  |
| an unexpected share error falls back to downloading |  |
| mobile without the share API falls back to downloading |  |
| a file name with XML-sensitive characters renders a valid tile |  |
| a file name with an emoji straddling the truncation boundary does not crash the app |  |

### errors.test.ts

| Test | Comment |
|---|---|
| activateDevice rejects when this device has no local deviceId |  |
| unlockDevice rejects when this device has no local deviceId |  |
| unlockDevice rejects when the local device key is gone |  |
| unlockLocalDeviceKey rejects when the local device key is gone |  |
| readInvitationInfo resolves to what it can read, never rejects |  |
| acceptContactRequest rejects when the chats document can't be loaded |  |
| acceptContactRequest rejects when the chats document isn't actually a chatList |  |
| receiveContactRequest rejects when the chats document can't be loaded |  |
| receiveContactRequest rejects when the chats document isn't actually a chatList |  |
| loadChatKey rejects when the chat document isn't actually a chat |  |
| loadChatKey rejects when a contact's chat document can't be loaded and nothing is pending |  |
| loadChatKey falls back to the pending chat key while the inviter has not created the chat |  |
| loadChatKey does not mask a server error with the pending chat key |  |
| updateContactProfileSnapshot keeps the pending chat key, dropPendingChatKey removes only it |  |
| updateContactProfileSnapshot re-reads the chats document and retries when the write hits a concurrent-change 412 |  |
| updateContactProfileSnapshot propagates a genuine (non-412) write failure without retrying |  |
| ensurePublicProfile adopts a concurrently created public profile after a 412 |  |
| ensurePublicProfile rethrows the original error when the concurrent winner hasn't linked a public profile yet |  |
| loadContactProfile falls back to undefined when the contact's public profile isn't reachable |  |
| ensurePublicProfile propagates a genuine (non-412) creation failure |  |
| loadProfileAndEnsurePublicProfile rejects when the profile document isn't actually a profile |  |
| ensurePublicProfile rejects when the linked public profile can no longer be loaded |  |
| loadContactProfile falls back to undefined when the contact's public profile document has an unexpected type |  |
| ensurePublicProfile rejects when the linked public profile document has an unexpected type |  |
| setName falls back to the previous revision when the update response carries no ETag |  |
| setAvatar falls back to the previous revision when the update response carries no ETag |  |
| shareDocument rejects a document that carries no key |  |
| shareDocument tolerates a 409 - the document is already shared into this chat |  |
| loadContent rejects when neither a content id nor a preview image is available |  |
| getSettings rejects when the settings document is missing its ids |  |
| storeDocument re-reads the folder and retries when the upload hits a concurrent-change 412 |  |
| storeDocument's concurrent-change retry carries the Access-Path header through to the reload |  |
| storeDocument rejects a successful upload response that carries no Location header |  |
| updateDocumentMetadata rejects with a precondition error when the document changed since load |  |
| shows a mail-server-unavailable message when starting auth returns 503 |  |
| shows a generic error when starting auth fails with 500 |  |
| challenge login surfaces an error when the challenge request fails |  |
| image scaling rejects when the picked file isn't a decodable image |  |
| registration shows an error when the server rejects the new user |  |
| the home page logs an error when activities can't be loaded |  |
| the chats page logs an error when an accepted request can't be received |  |
| device activation shows an error when storing the key fails |  |
| profile page shows a retry message, not a broken form, when the profile fails to load |  |
| profile page shows a retry message when the profile document isn't actually a profile |  |
| the folder page shows an error when the folder document can't be loaded |  |
| the folder page shows an error when the folder document isn't actually a folder |  |
| decryption error shows an error message when a chat key can't be decrypted |  |
| decryption error shows an error message when a chat key entry is missing |  |
| a server error while loading the medium image shows the error box |  |
| an image document that cannot be loaded shows 'No image found' |  |
| a document that is not an image shows 'No image found' |  |
| a chat image without an owner parameter cannot be resolved |  |
| addMember's group-metadata retry carries through after a concurrent-modification 412 |  |
| createGroup's atomic-upload retry carries through after a concurrent-modification 412 |  |
| CreateGroupDialog shows a failure message when creating a group fails |  |
| CreateGroupDialog keeps the group and shows a separate message when adding a member fails |  |
| AddGroupMemberDialog shows a failure message when adding a member fails |  |
| GroupInvitationMessage's Join button shows Retry after a failed join |  |
| GroupChat shows an error when the group isn't in mary's chats list |  |
| Chat.tsx shows a chats-load error when the chats document fails to load |  |
| Chat.tsx shows a decryption error for a contact that isn't in mary's chats list |  |
| the chats list still renders when fetching contact requests fails |  |

### federated-chat.test.ts

| Test | Comment |
|---|---|
| before alice created the chat the pending key is used |  |
| once the chat exists the pending key is dropped |  |
| the profile of alice is read at A and refreshes the snapshot |  |
| a contact whose profile lives on another server is read there as a guest |  |
| a shared document naming a server the contact does not live on is not loaded |  |
| a detail link naming a server the contact does not live on finds no image |  |
| a detail page opened by deep link renews the guest session with the address of the chat |  |
| an origin in the URL that is no origin finds no image |  |
| an image mary shares stays on the own server and says so |  |
| an entry from before F8 gets the id of alice on the own server when sharing |  |
| nothing can be shared with a contact on another server without an address |  |
| the last activity of a chat on another server is shown, and a failure only blanks its row |  |
| the last activity of a chat on another server is asked from A |  |
| without push there is no bell |  |
| with push the bell of a chat on another server is struck through, in the list and in the chat |  |
| a bell follows a change of the push state even if a lookup is under way |  |
| with push the bell of a chat on the own server is a normal one |  |

### federated-groups.test.ts

| Test | Comment |
|---|---|
| a group invitation naming a server the contact does not live on is not followed |  |
| a group at A joined without a known address is still read after a reload |  |
| a contact from A who is a member already is neither invited nor shared with again |  |
| opening the dialog registers nobody on the server |  |
| joining is refused if the account is known by another address at that server |  |
| a join that fails after the address was taken in leaves nothing behind |  |

### federation-accept.test.ts

| Test | Comment |
|---|---|
| a foreign principal is registered on the own server (contract) |  |
| after a reload the address for the foreign server is known again |  |
| an invitation waiting for a login leads back to its page |  |
| an invitation older than an hour is dropped |  |
| without an invitation the page says so |  |
| a link that does not name the inviting server is ignored |  |
| an incomplete fragment is ignored |  |
| a refusal at A is reported and the invitation stays |  |
| another address is used as typed, an address she does not own is refused |  |
| the button needs an address |  |
| no matching invitation at A is reported |  |
| without alice's address the profile is not shared, accepting still works |  |
| a name is asked for first when mary has none |  |
| an accept that fails is reported and can be retried |  |
| mary declines at A |  |
| a decline that fails is reported |  |
| cancelling forgets the invitation |  |
| a profile that cannot be loaded is reported |  |
| switching to another user forgets the invitation |  |

### federation-contacts.test.ts

| Test | Comment |
|---|---|
| a contact whose profile cannot be read on its server is shown from its snapshot |  |
| a contact whose profile lives here has it loaded |  |
| contacts on other servers can be put into a group if their id here is known |  |
| picking up an accepted request keeps ${name} |  |

### federation.test.ts

| Test | Comment |
|---|---|
| mary asks her server for an assertion for another server |  |
| renew asks for an assertion and redeems it without any credentials |  |
| redeeming an invitation sends it, and renewing uses the address it was redeemed with |  |
| a remembered address is used for renewing, whatever the account's own address is |  |
| the address in use is the remembered one, else the account's once a session exists |  |
| without an address there is no federation, and no request |  |
| a refused assertion is a 401 for the caller |  |
| when the own server refuses, nothing is redeemed |  |
| a request to another server first gets a session, then goes out with it |  |
| when the user changes, remembered addresses and sessions are gone |  |
| the signed-in app gets guest sessions on behalf of the user |  |

### folder.test.ts

| Test | Comment |
|---|---|
| create folder |  |
| a well-formed but non-matching Access-Path header does not grant access |  |
| navigating into a freshly created folder shows its empty state, not a stuck spinner |  |
| navigate into folder and upload image |  |

### groups.test.ts

| Test | Comment |
|---|---|
| create a group and add a member |  |
| mary opens a group she owns and adds another member via Add Member |  |
| leaving a group before a member's profile finishes loading doesn't error |  |
| addMember re-adding an existing member dedupes and leaves publicProfiles untouched |  |
| renameGroup updates only the renamed group's entry, leaving others untouched |  |
| loadGroupKey rejects when the target document isn't actually a group |  |
| Add Member shows an empty state once every contact is already a member |  |

### image.test.ts

| Test | Comment |
|---|---|
| open an image from a sub-folder in the detail view and go back into it |  |
| open a shared image from the chat in the detail view and go back to the chat |  |
| open an own shared image detail view directly after a reload |  |
| an image shared by a contact without a chat cannot be resolved |  |
| an image in a sub-folder cannot be resolved after a reload |  |
| download action from a folder: lazy contentId, exactly one extra metadata request |  |
| download action from a chat: contentId already registered, no metadata request |  |
| download action after a reload: contentId from the resolve itself, no extra request |  |
| download action on mobile shares the original instead of downloading |  |
| download action error shows a snackbar and leaves the displayed image alone |  |
| a wrong document type behind the download action shows an error |  |

### invitations.test.ts

| Test | Comment |
|---|---|
| accept open invitations fails |  |
| decline open invitations fails |  |
| accept invitation prompts for a display name when mary has no public profile yet |  |
| cancel the display-name prompt when accepting an invitation |  |

### join.test.ts

| Test | Comment |
|---|---|
| the own server's federation key is a contract |  |
| shows the invited address and registers here by form post |  |
| an address with umlauts is shown as it is |  |
| an undecodable token only hides the address |  |
| without a fragment the link is reported as invalid |  |
| a federation check that fails hides the second option |  |
| a typed server is normalized, checked and the invitation handed over |  |
| the server address "${input}" is rejected |  |
| plain http is only accepted for localhost |  |
| the continue button needs an input |  |
| a server that ${name} is not accepted |  |
| the own server is rejected |  |

### manifest.test.ts

| Test | Comment |
|---|---|
| loads app name from manifest and updates title |  |

### media.test.ts

| Test | Comment |
|---|---|
| a video tile in a folder navigates to the media detail page |  |
| an audio tile in a folder plays back and goes back to the folder |  |
| an unusual mimeType with parameters falls back to a generic blob type |  |
| a shared video in a 1:1 chat navigates without a metadata request and back goes to the chat |  |
| a shared video in a group chat does not open the media page and downloads instead |  |
| deep link into a folder-resolved media page after a reload |  |
| a media deep link into an unresolvable sub-folder shows no file found |  |
| a non-media document behind a media link shows no file found |  |
| a file over the size limit is not fetched and offers a download fallback |  |
| an unplayable video's fallback downloads without a second content request |  |
| the app-bar download action downloads the original file |  |
| mobile app-bar download action shares instead of downloading |  |
| a content load error shows the standard error message |  |

### navigation.test.ts

| Test | Comment |
|---|---|
| navigate to chats |  |
| open and close navigation drawer on mobile resolution |  |
| navigate to image details |  |
| navigate to devices and back on mobile resolution |  |

### notifications.test.ts

| Test | Comment |
|---|---|
| a 1:1 message shows the decrypted preview |  |
| a group message from a known sender is prefixed with their name |  |
| a group message from an unrecognized sender falls back to 'Someone' |  |
| a shared-document message shows a generic 'shared a picture' preview |  |
| a group-invitation message shows an 'invites you to' preview |  |
| a long message preview is truncated to 120 characters |  |
| falls back to a generic notification when there is no store record for the recipient |  |
| falls back to a generic notification when the chat is missing from the keyring |  |
| falls back to a generic notification when fetching the recovery key fails |  |
| falls back to a generic notification when the message can no longer be loaded |  |
| falls back to a generic notification when the keyring can't be decrypted |  |
| a contact-request push shows a generic text without any network request |  |
| notificationStore.list returns every stored device record |  |
| the legacy notification database is migrated and removed |  |
| migrating the legacy notification database keeps newer records |  |
| no legacy notification database is created when there is none |  |
| a legacy notification database that is still in use does not block the store |  |
| a broken legacy notification database does not break the store |  |
| a contact-accepted push shows a generic text |  |
| an invalid or recipient-less payload falls back to a generic notification |  |
| suppresses the notification when a client is visible on the chat's route |  |
| does not suppress on WebKit even when a client is visible on the chat's route |  |
| PushResource.vapidPublicKey: 404 is surfaced as `undefined` |  |
| PUT push-subscription stores the subscription for the bound device |  |
| DELETE push-subscription removes it |  |
| pushSubscriptionService.enable subscribes, stores the subscription and makes isEnabled true |  |
| pushSubscriptionService.enable rejects when push is disabled server-side |  |
| pushSubscriptionService.disable only unsubscribes once no account uses the browser subscription any more |  |
| notificationKeyringService: sync/rememberChat/rememberNames on an active (keep-me-logged-in) device |  |
| notificationKeyringService.fillMissing leaves out chats on other servers |  |
| notificationKeyringService keeps every entry when several updates run at once |  |
| pushSubscriptionService.enable drops stale records of the same account but not of other accounts |  |
| notificationKeyringService.fillMissing loads the chat key of every contact and group not yet in the keyring |  |
| pushSubscriptionService.support reports 'denied' when notifications are blocked |  |
| pushSubscriptionService.support reports 'needs-install' |  |
| pushSubscriptionRepository.store maps 401/403/404/503 to the matching ResponseError |  |
| pushSubscriptionService.isEnabled is false before anything ever subscribed |  |
| pushSubscriptionService.isEnabled/disable tolerate a rejected serviceWorkerReady |  |
| pushSubscriptionService.disable logs a warning but still cleans up when removing the server-side subscription fails |  |
| pushSubscriptionService.disable binds the session and retries when the server rejects the delete as unbound |  |
| does nothing for a device without push enabled |  |
| does nothing while the notification permission is not granted |  |
| does nothing when there is no service worker |  |
| does nothing when the stored subscription is still the current one |  |
| stores a subscription the browser rotated |  |
| subscribes again when the browser lost its subscription |  |
| does not subscribe again once push is disabled server-side |  |
| mary turns notifications on and off from Settings |  |
| mary sees an error when turning notifications on fails |  |
| NotificationBanner: dismissing hides it permanently, enabling subscribes and dismisses it |  |
| NotificationBanner: 'Not now' dismisses it without subscribing |  |
| NotificationBanner: a failed enable logs an error and hides the banner (permission was already consumed) |  |
| Chats.tsx logs a warning when refreshing an active but undecryptable notification keyring fails |  |
| Chat.tsx logs a warning when remembering a chat in an active but undecryptable keyring fails |  |
| App logs a warning when reconciling the push subscription fails |  |
| switching user logs a warning when disabling notifications for the previous user fails |  |

### profile.test.ts

| Test | Comment |
|---|---|
| edit and save profile |  |
| load existing profile with picture |  |
| edit and save profile - name only, no picture change |  |
| edit and save profile - picture only, no name change |  |

### remote-api.test.ts

| Test | Comment |
|---|---|
| remote request carries the bearer token, no cookie |  |
| a missing token is fetched before the request |  |
| a token expiring within 60 s is renewed proactively |  |
| 401 renews once and retries with the new token |  |
| a second 401 is handed to the repository |  |
| 403 is never renewed |  |
| parallel 401s share a single renewal |  |
| a failing provider reaches the caller and leaves the store alone |  |
| a POST body is sent identically when retried |  |
| a stream body is not replayed after a 401 |  |
| the store is empty after clear() |  |
| a switched user drops all guest sessions |  |
| origins are validated |  |
| paths outside /users/ are refused without a request |  |
| receiveMessages sends Prefer and Authorization |  |
| repositoriesFor shares the own repositories and caches remote ones |  |
| contact requests work against a remote server |  |
| a renewal that was in flight during clear() is not stored |  |
| after clear() a new request does not join the old renewal |  |
| a late 401 uses the token another request already renewed |  |
| a 401 after logout is not retried with the next user's token |  |
| repositoriesFor normalizes the origin |  |
| a path that leaves /users/ is refused |  |
| a provider with a short TTL does not renew on every request |  |
| session() hands out the stored session without a renewal |  |
| session() renews an expiring session and returns the new id |  |
| session() and a request share a single renewal |  |
| session() does not hand out the id of a user who logged out meanwhile |  |
| the place on the own server is the own id, on a foreign one the id of the session |  |
| services are cached per server and stamp their origin on a loaded document |  |
| parseMessageContent reads the origin of a shared document | What a message says about where an image shared into the chat lives (F8). |

### settings.test.ts

| Test | Comment |
|---|---|
| navigate from devices to profile via settings list |  |

### unlock.test.ts

| Test | Comment |
|---|---|
| mary unlocks new device after her session was bound to her device |  |
| mary cannot unlock a new device with a session that is not bound to a device |  |

### upload.test.ts

| Test | Comment |
|---|---|
| upload portrait |  |
| upload small image |  |

## E2E suite


### e0-smoke.e2e.ts

| Test | Comment |
|---|---|
| E0: new user registers, uploads an image and stays logged in across reloads | E0 (docs/plans/e2e-test-setup.md): the only single-user test of this suite. It proves the whole chain - bundle, FrontendFilter, mail, cookies - against the real server. |

### e1-second-device.e2e.ts

| Test | Comment |
|---|---|
| E1: alice activates her second device, which then sees her image | E1: a second device is registered through the login mail, activated by the first one and then reads the first device's data. Device 1 renames it afterwards. |

### e2-invitation.e2e.ts

| Test | Comment |
|---|---|
| E2: alice invites bob, bob registers via the invitation link and both see each other | E2: a registered user invites someone who is not registered yet. The invitee registers through the mailed link and both see each other with display name and address (ADR 0016). |
| E2: opening the invitation link registers nobody | Opening the link (a mail client's link scanner does that) must not register anybody: the account is created by the invitee's click on "create an account here" (ADR 0013 A11). |

### e3-contact-request.e2e.ts

| Test | Comment |
|---|---|
| E3: bob declines alice's request, then invites her and she accepts | E3: contact request between two registered users. bob declines the first one, after which alice cannot send another (409). bob then invites alice, who accepts. |

### e4-chat.e2e.ts

| Test | Comment |
|---|---|
| E4: bob writes first, alice answers, both see both messages | E4: bob writes right after accepting, before alice's chat list has created the chat (ADR 0015 section 4). alice then answers; both read both messages with their time (ADR 0021), also after logging in again. |

### e5-share-image.e2e.ts

| Test | Comment |
|---|---|
| E5: bob downloads the original of an image alice shared | E5: alice shares an image in the chat (the share dialog lists the top-level documents only); bob opens it and downloads the original, which has to be byte-identical to what alice uploaded. |
| E5: bob downloads a file alice shared in the chat | A file that is not an image is shared as a tile of the chat; a click downloads it. |

### e6-group.e2e.ts

| Test | Comment |
|---|---|
| E6: alice creates a group, carol shares an image, bob sees it with carol's name | E6: alice creates a group and invites bob and carol through their 1:1 chats. Both join; carol shares an image and bob sees it with carol's name. |

### f1-federation-key.e2e.ts

| Test | Comment |
|---|---|
| F1: the signing key of a server is readable from the page of another one | F1 (docs/plans/f1-f2-federation-keys.md): a page of server A reads the signing key of server B, as the client will do before it trusts a server name the user typed (F7): across the origin boundary, without credentials. That the browser lets the answer through is the CORS check. |

### f11-two-servers.e2e.ts

| Test | Comment |
|---|---|
| F11: servers A and B share neither users, data nor sessions | F11 (docs/plans/f11-f3-second-server-guest-auth.md): the two servers of the stack are independent, as two real instances are. No federation feature is needed to show that. |

### f3-guest-cors.e2e.ts

| Test | Comment |
|---|---|
| F3: a foreign origin reaches the guest routes without credentials, and nothing else | F3 (docs/plans/f11-f3-second-server-guest-auth.md): CORS across a real origin boundary. A page of server B calls server A like a guest would (bearer token, no credentials). No guest token is issued yet (F4), so an invalid one is used: what counts is that the browser lets the answer pass. |

### f4-guest-session.e2e.ts

| Test | Comment |
|---|---|
| F4/F5: a user of server B redeems an invitation of server A with an assertion of B |  |

### f7-federated-invitation.e2e.ts

| Test | Comment |
|---|---|
| F7: bob accepts alice's invitation with his account on B and both see each other |  |
| F7: a user whose device B knows only has to unlock it |  |
| F7: a wrong address does not redeem the invitation, which can still be accepted on A |  |

### f8-federated-chat.e2e.ts

| Test | Comment |
|---|---|
| F8: bob and alice chat across the servers, share images and keep it after a reload |  |

### f9-federated-groups.e2e.ts

| Test | Comment |
|---|---|
| F9: alice's group on A has bob from B as a member, who reads and writes there but cannot share |  |
| F9: bob's group on B has alice from A as a member |  |

