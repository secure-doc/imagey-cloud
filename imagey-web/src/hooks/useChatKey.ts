import { useEffect, useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useChatsId, useSettingsKey } from "../contexts/SettingsContext";
import { contactService } from "../contact/ContactService";
import { ContactEntry } from "../document/DocumentMetadata";
import { rememberForeignAddresses } from "../federation/federationProvider";
import { documentService } from "../document/DocumentService";

// Resolves the shared key of the chat with `contactUserId` on its own (loads the
// "chats" document, finds the contact, unwraps the chat key) - for pages that
// are reached outside the chat view, e.g. the image detail page after a reload.
// `failed` is set when the contact is unknown or any step fails; a missing
// `contactUserId` leaves the hook idle.
export function useChatKey(contactUserId: string | null): {
  key?: JsonWebKey;
  // The entry of the contact, for what it says about where things live.
  contact?: ContactEntry;
  failed: boolean;
} {
  const { user } = useAuthentication();
  const chatsId = useChatsId();
  const settingsKey = useSettingsKey();
  const [result, setResult] = useState<{
    contactUserId: string;
    key?: JsonWebKey;
    contact?: ContactEntry;
    failed: boolean;
  }>();

  useEffect(() => {
    if (!contactUserId) {
      return;
    }
    let cancelled = false;
    const finish = (key?: JsonWebKey, contact?: ContactEntry) => {
      if (!cancelled) {
        setResult({ contactUserId, key, contact, failed: !key });
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
      // A page reached by a deep link has not seen the chat list: tell the guest-token provider
      // which address each foreign server knows us by before any session is renewed.
      rememberForeignAddresses(chats.contacts);
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
      finish(key, contact);
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
  return {
    key: current?.key,
    contact: current?.contact,
    failed: current?.failed ?? false,
  };
}
