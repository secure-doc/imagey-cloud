import i18n from "../translation/i18n";
import { cryptoService } from "../authentication/CryptoService";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
import { deviceRepository } from "../device/DeviceRepository";
import { contactService } from "../contact/ContactService";
import { documentService } from "../document/DocumentService";
import { ContactEntry, GroupEntry } from "../document/DocumentMetadata";
import { notificationStore } from "./NotificationStore";
import {
  KeyringChat,
  NotificationKeyring,
  emptyKeyring,
} from "./NotificationKeyring";

async function decryptKeyring(
  encrypted: string,
  deviceKeyPair: JsonWebKeyPair,
  userId: string,
  deviceId: string,
): Promise<NotificationKeyring> {
  const key = await cryptoService.deriveNotificationKeyringKey(
    deviceKeyPair.privateKey,
    deviceKeyPair.publicKey,
    userId,
    deviceId,
  );
  return JSON.parse(await cryptoService.decryptMessage(encrypted, key));
}

async function encryptKeyring(
  keyring: NotificationKeyring,
  deviceKeyPair: JsonWebKeyPair,
  userId: string,
  deviceId: string,
): Promise<string> {
  const key = await cryptoService.deriveNotificationKeyringKey(
    deviceKeyPair.privateKey,
    deviceKeyPair.publicKey,
    userId,
    deviceId,
  );
  return cryptoService.encryptMessage(JSON.stringify(keyring), key);
}

// sync() reads, patches and writes the keyring in separate IndexedDB
// transactions, so two updates running at once (Chat.tsx also renders the chat
// list) would both start from the same old keyring and the later write would
// drop the earlier one's entry. They run one after the other instead.
let syncQueue: Promise<void> = Promise.resolve();

async function syncNow(
  userId: string,
  deviceKeyPair: JsonWebKeyPair,
  patch: (keyring: NotificationKeyring) => NotificationKeyring,
): Promise<void> {
  if (!(await notificationKeyringService.isActive(userId))) {
    return;
  }
  const deviceId = deviceRepository.loadDeviceId(userId)!;
  const record = await notificationStore.load(deviceId);
  const current = record?.keyring
    ? await decryptKeyring(record.keyring, deviceKeyPair, userId, deviceId)
    : emptyKeyring();
  const encrypted = await encryptKeyring(
    patch(current),
    deviceKeyPair,
    userId,
    deviceId,
  );
  await notificationStore.patch(deviceId, {
    userId,
    recoveryBlob: deviceRepository.loadRecoveryKey(deviceId),
    publicDeviceKey: deviceKeyPair.publicKey,
    keyring: encrypted,
    language: i18n.language,
  });
}

export const notificationKeyringService = {
  // Push is active on this device once it has both a "keep me logged in"
  // recovery blob and a store record (only created by
  // PushSubscriptionService.enable) - the same condition under which the
  // service worker's own decryption attempt could succeed.
  isActive: async (userId: string): Promise<boolean> => {
    const deviceId = deviceRepository.loadDeviceId(userId);
    if (!deviceId || !deviceRepository.loadRecoveryKey(deviceId)) {
      return false;
    }
    return (await notificationStore.load(deviceId)) != null;
  },

  load: async (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
  ): Promise<NotificationKeyring | undefined> => {
    if (!(await notificationKeyringService.isActive(userId))) {
      return undefined;
    }
    const deviceId = deviceRepository.loadDeviceId(userId)!;
    const record = await notificationStore.load(deviceId);
    return record?.keyring
      ? decryptKeyring(record.keyring, deviceKeyPair, userId, deviceId)
      : emptyKeyring();
  },

  // Loads (or creates), patches and re-encrypts the keyring. A no-op while
  // push is not active on this device (see isActive) - there would be nothing
  // for a service worker to decrypt it with.
  sync: (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    patch: (keyring: NotificationKeyring) => NotificationKeyring,
  ): Promise<void> => {
    const run = syncQueue.then(() => syncNow(userId, deviceKeyPair, patch));
    // A failed update must not block the ones queued behind it.
    syncQueue = run.catch(() => undefined);
    return run;
  },

  rememberChat: (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    entry: KeyringChat,
  ): Promise<void> =>
    notificationKeyringService.sync(userId, deviceKeyPair, (keyring) => ({
      ...keyring,
      chats: { ...keyring.chats, [entry.chatId]: entry },
    })),

  rememberNames: (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    contacts: ContactEntry[],
  ): Promise<void> =>
    notificationKeyringService.sync(userId, deviceKeyPair, (keyring) => ({
      ...keyring,
      names: contacts.reduce(
        (names, contact) => ({ ...names, [contact.userId]: contact.name }),
        keyring.names,
      ),
    })),

  // Loads the chat key of every contact and group not yet in the keyring, in
  // the background, so a chat never opened on this device still gets a
  // decrypted preview. Only runs while push is active (see isActive), so a
  // device without it never triggers these extra requests - existing tests
  // for pages/Chats.tsx stay unaffected.
  fillMissing: async (
    userId: string,
    deviceKeyPair: JsonWebKeyPair,
    chatList: { contacts: ContactEntry[]; groups: GroupEntry[] },
    chatsId: string,
    chatsKey: JsonWebKey,
  ): Promise<void> => {
    const keyring = await notificationKeyringService.load(
      userId,
      deviceKeyPair,
    );
    if (!keyring) {
      return;
    }

    for (const contact of chatList.contacts) {
      if (keyring.chats[contact.chatId]) {
        continue;
      }
      try {
        const { key } = await contactService.loadChatKey(
          userId,
          contact,
          chatsId,
          chatsKey,
        );
        await notificationKeyringService.rememberChat(userId, deviceKeyPair, {
          owner: contact.owner,
          chatId: contact.chatId,
          key,
          title: contact.name,
          route: `/chats/${contact.userId}`,
          group: false,
        });
      } catch (e) {
        console.warn(
          `Failed to fill in notification key for chat ${contact.chatId}`,
          e,
        );
      }
    }

    for (const group of chatList.groups) {
      if (keyring.chats[group.groupId]) {
        continue;
      }
      try {
        let key: JsonWebKey;
        if (group.owner === userId) {
          const doc = await documentService.loadDocument(
            userId,
            group.groupId,
            chatsId,
            chatsKey,
          );
          if (doc.type !== "group") {
            continue;
          }
          key = doc.key;
        } else {
          if (!group.groupKey) {
            continue;
          }
          key = group.groupKey;
        }
        await notificationKeyringService.rememberChat(userId, deviceKeyPair, {
          owner: group.owner,
          chatId: group.groupId,
          key,
          title: group.name,
          route: `/chats/groups/${group.groupId}`,
          group: true,
        });
      } catch (e) {
        console.warn(
          `Failed to fill in notification key for group ${group.groupId}`,
          e,
        );
      }
    }
  },
};
