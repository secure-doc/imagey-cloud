// Per-device, encrypted under the notification-keyring key (ADR 0020): what a
// push handler needs to decrypt a message preview without any further access
// check - a chat's key plus enough to render it and route a click to it.
export interface KeyringChat {
  owner: string;
  chatId: string;
  key: JsonWebKey;
  // Contact name or group name, shown as the notification title.
  title: string;
  // "/chats/<contactUserId>" | "/chats/groups/<groupId>" - the 1:1 and group
  // routes are not derivable from `owner`/`chatId` alone (see
  // docs/plans/browser-notifications-implementation.md, finding 2).
  route: string;
  group: boolean;
}

export interface NotificationKeyring {
  chats: Record<string /* chatId */, KeyringChat>;
  names: Record<string /* userId */, string>;
}

export function emptyKeyring(): NotificationKeyring {
  return { chats: {}, names: {} };
}
