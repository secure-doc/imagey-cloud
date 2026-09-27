import { useEffect, useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useChatsId, useSettingsKey } from "../contexts/SettingsContext";
import { contactService } from "../contact/ContactService";
import { documentService } from "../document/DocumentService";

// Resolves the shared key of the chat with `contactUserId` on its own (loads the
// "chats" document, finds the contact, unwraps the chat key) - for pages that
// are reached outside the chat view, e.g. the image detail page after a reload.
// `failed` is set when the contact is unknown or any step fails; a missing
// `contactUserId` leaves the hook idle.
export function useChatKey(contactUserId: string | null): {
  key?: JsonWebKey;
  failed: boolean;
} {
  const { user } = useAuthentication();
  const chatsId = useChatsId();
  const settingsKey = useSettingsKey();
  const [result, setResult] = useState<{
    contactUserId: string;
    key?: JsonWebKey;
    failed: boolean;
  }>();

  useEffect(() => {
    if (!contactUserId) {
      return;
    }
    let cancelled = false;
    const finish = (key?: JsonWebKey) => {
      if (!cancelled) {
        setResult({ contactUserId, key, failed: !key });
      }
    };
    (async () => {
      const chats = await documentService.loadDocument(
        user,
        chatsId,
        user,
        settingsKey,
      );
      if (chats.type !== "chatList") {
        throw new Error(`Expected a chatList, got ${chats.type}`);
      }
      const contact = chats.contacts.find((c) => c.userId === contactUserId);
      if (!contact) {
        throw new Error(`No chat found for contact ${contactUserId}`);
      }
      const { key } = await contactService.loadChatKey(
        user,
        contact,
        chatsId,
        chats.key,
      );
      finish(key);
    })().catch((e) => {
      console.error("Failed to resolve chat key", e);
      finish();
    });
    return () => {
      cancelled = true;
    };
  }, [user, chatsId, settingsKey, contactUserId]);

  // Ignore a result that belongs to a previous contact.
  const current = result?.contactUserId === contactUserId ? result : undefined;
  return { key: current?.key, failed: current?.failed ?? false };
}
