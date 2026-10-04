import { cryptoService } from "../authentication/CryptoService";
import { parseMessageContent } from "../chat/parseMessageContent";
import { getAppName } from "../utils/appName";
import type { notificationStore } from "./NotificationStore";
import type { Translate } from "./notificationTranslations";

// `recipient` is the user id of the account the push is for (ADR 0020
// decision 3) - present in every payload so a service worker shared by
// several accounts in the same browser profile can pick the right one.
export type PushPayload =
  | {
      type: "message";
      recipient: string;
      owner: string;
      chatId: string;
      messageId: string;
    }
  | { type: "contact-request"; recipient: string }
  | { type: "contact-accepted"; recipient: string };

const FALLBACK_TAG = "imagey";
const FALLBACK_ROUTE = "/chats";
const PREVIEW_MAX_LENGTH = 120;

// `renotify` is part of the Notifications spec but missing from the current
// lib.dom.d.ts/lib.webworker.d.ts NotificationOptions type.
export type PushNotificationOptions = NotificationOptions & {
  renotify?: boolean;
};

export interface PushDeps {
  fetch: typeof fetch;
  store: Pick<typeof notificationStore, "loadForUser">;
  showNotification(
    title: string,
    options: PushNotificationOptions,
  ): Promise<void>;
  visibleClientRoutes(): Promise<string[]>;
  isWebKit: boolean;
  // Resolves a translator for the given BCP-47 language tag - injectable so
  // tests can stub it, since the service worker has no react-i18next context.
  translate(language: string): Translate;
  defaultLanguage: string;
}

function isPushPayload(value: unknown): value is PushPayload {
  if (!value || typeof value !== "object") {
    return false;
  }
  const payload = value as Record<string, unknown>;
  if (typeof payload.recipient !== "string" || !payload.recipient) {
    return false;
  }
  if (
    payload.type === "contact-request" ||
    payload.type === "contact-accepted"
  ) {
    return true;
  }
  return (
    payload.type === "message" &&
    typeof payload.owner === "string" &&
    typeof payload.chatId === "string" &&
    typeof payload.messageId === "string"
  );
}

async function showFallback(
  deps: PushDeps,
  t: Translate,
  type: PushPayload["type"] | undefined,
): Promise<void> {
  const text =
    type === "contact-request"
      ? t("New contact request")
      : type === "contact-accepted"
        ? t("Contact request accepted")
        : t("New message");
  await deps.showNotification(getAppName(), {
    body: text,
    icon: "/image192.png",
    badge: "/image192.png",
    tag: FALLBACK_TAG,
    renotify: true,
    data: { route: FALLBACK_ROUTE },
  });
}

function truncate(text: string): string {
  return text.length > PREVIEW_MAX_LENGTH
    ? text.slice(0, PREVIEW_MAX_LENGTH - 1) + "…"
    : text;
}

function previewText(
  content: ReturnType<typeof parseMessageContent>,
  t: Translate,
): string {
  if (content.type === "shared-document") {
    return t("Shared a document");
  }
  if (content.type === "group-invitation") {
    return t("Invites you to {{name}}", { name: content.name });
  }
  return truncate(content.content);
}

export async function handlePush(
  payload: unknown,
  deps: PushDeps,
): Promise<void> {
  if (!isPushPayload(payload)) {
    await showFallback(deps, deps.translate(deps.defaultLanguage), undefined);
    return;
  }

  if (payload.type !== "message") {
    // Contact events carry no chat to decrypt - always the generic text, no
    // decryption attempted.
    await showFallback(
      deps,
      deps.translate(deps.defaultLanguage),
      payload.type,
    );
    return;
  }

  const record = await deps.store.loadForUser(payload.recipient);
  const t = deps.translate(record?.language ?? deps.defaultLanguage);
  if (!record?.recoveryBlob || !record?.keyring || !record?.publicDeviceKey) {
    await showFallback(deps, t, payload.type);
    return;
  }

  try {
    const recoveryResponse = await deps.fetch(
      `/users/${record.userId}/devices/${record.deviceId}/recovery-key`,
      { headers: { Accept: "application/json" }, credentials: "same-origin" },
    );
    if (!recoveryResponse.ok) {
      throw new Error("Failed to load recovery key");
    }
    const recoveryKey: string = await recoveryResponse.json();
    const privateDeviceKey = await cryptoService.decryptPrivatePasswordKey(
      record.recoveryBlob,
      recoveryKey,
    );
    const keyringKey = await cryptoService.deriveNotificationKeyringKey(
      privateDeviceKey,
      record.publicDeviceKey,
      record.userId,
      record.deviceId,
    );
    const keyring = JSON.parse(
      await cryptoService.decryptMessage(record.keyring, keyringKey),
    );
    const chat = keyring.chats?.[payload.chatId];
    if (!chat) {
      throw new Error("Chat not found in notification keyring");
    }

    if (!deps.isWebKit) {
      // The open chat polls for its messages itself, so a notification on
      // top of it would only be noise.
      const visibleRoutes = await deps.visibleClientRoutes();
      if (visibleRoutes.includes(chat.route)) {
        return;
      }
    }

    const messageResponse = await deps.fetch(
      `/users/${chat.owner}/documents/${chat.chatId}/messages/${payload.messageId}`,
      { headers: { Accept: "application/json" }, credentials: "same-origin" },
    );
    if (!messageResponse.ok) {
      throw new Error("Failed to load message");
    }
    const message: { sender: string; content: string } =
      await messageResponse.json();
    const decrypted = await cryptoService.decryptMessage(
      message.content,
      chat.key,
    );
    const content = parseMessageContent(decrypted);
    const body = chat.group
      ? `${keyring.names?.[message.sender] ?? t("Someone")}: ${previewText(content, t)}`
      : previewText(content, t);

    await deps.showNotification(chat.title, {
      body,
      icon: "/image192.png",
      badge: "/image192.png",
      tag: chat.chatId,
      renotify: true,
      data: { route: chat.route },
    });
  } catch (e) {
    console.warn("Falling back to a generic push notification", e);
    await showFallback(deps, t, payload.type);
  }
}
