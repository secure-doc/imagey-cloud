import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair, Settings } from "../contexts/AuthenticationContext";
import { PublicProfile } from "../profile/PublicProfile";
import { Contact } from "./Contact";
import { ContactRequest } from "./ContactRequest";
import { contactRepository } from "./ContactRepository";
import { documentRepository } from "../document/DocumentRepository";
import { documentService } from "../document/DocumentService";

// Appends a contact to the "chats" document's list, replacing any existing
// entry for the same chat (chatId is a freshly generated uuid, unique per
// chat/contact). Both handshake steps are non-atomic read-modify-writes
// followed by a separate server call (accept: the repository call; receive:
// confirmContactRequestReceived) - if that trailing call fails the request
// stays pending and the whole step is retried on the next poll, by which
// point our first attempt's list write has already landed. Deduping here
// keeps the retry from growing the list without bound.
function appendContact(
  existing: Contact[] | undefined,
  contact: Contact,
): Contact[] {
  const others = (existing ?? []).filter((c) => c.chatId !== contact.chatId);
  return [...others, contact];
}

export const contactService = {
  // Invitee side: accept an INVITED request. The chat is - like everything
  // else - its own encrypted Document, created here as a child of the
  // user's "chats" document; its Document key doubles as the chat's shared
  // key (messages, documents shared in-chat, ...). We keep our own access
  // to it the normal way (self-issued, wrapped under the chats document's
  // key), and hand the inviter their own access by ECDH-wrapping the same
  // key with their public key and our private key.
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    inviterPublicKey: JsonWebKey,
    inviterPublicProfileId: string | undefined,
    ownPublicProfile: PublicProfile,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<Contact> => {
    try {
      const chatsDocument = await documentService.loadDocument(
        userId,
        settings.chats,
        userId,
        settings.settingsKey,
      );
      // A failed load returns a key-less placeholder, so this also guards
      // against rebuilding the contacts list off a placeholder (which would
      // persist an empty list and drop every existing contact).
      if (!chatsDocument.key) {
        throw new Error("Chats document key not found");
      }

      const chatId = cryptoService.generateUuid();
      const chatDocumentKey = await cryptoService.generateSymmetricKey();
      // Both parties' "public-profile" Document ids travel in the chat's own metadata (see
      // docs/plans/chat-public-profile.md §3.3), so either side can find the other's without relying
      // on the message history. The inviter's id is only missing if their public-profile somehow
      // does not exist yet (should not normally happen, see §3.6) - the chat is still created either
      // way, it just leaves that lookup unresolved until a later exchange fills it in (§6/§11).
      const publicProfiles: Record<string, string> = {
        [userId]: ownPublicProfile.documentId,
        ...(inviterPublicProfileId
          ? { [contactId]: inviterPublicProfileId }
          : {}),
      };
      const [encryptedChatContent] = await cryptoService.encryptDocument(
        chatDocumentKey,
        [
          new TextEncoder().encode(
            JSON.stringify({
              documentId: chatId,
              name: contactId,
              type: "Chat",
              publicProfiles,
            }),
          ).buffer,
        ],
      );
      const encryptedChatKey = await cryptoService.encryptKey(
        chatDocumentKey,
        chatsDocument.key,
      );

      const contact: Contact = { userId: contactId, chatId, owner: userId };
      const updatedContacts = appendContact(chatsDocument.contacts, contact);
      const [encryptedChatsContent] = await cryptoService.encryptDocument(
        chatsDocument.key,
        [
          new TextEncoder().encode(
            JSON.stringify({
              name: chatsDocument.name,
              type: chatsDocument.type,
              contacts: updatedContacts,
            }),
          ).buffer,
        ],
      );

      await documentRepository.uploadDocument(
        userId,
        userId, // the chat is created under the invitee's own "chats" document
        settings.chats,
        encryptedChatsContent,
        // Reject (rather than silently clobber) if the "chats" document changed
        // since we loaded it - another accepted request would otherwise be lost.
        chatsDocument.etag ?? null,
        chatId,
        encryptedChatContent,
        {
          issuer: userId,
          kid: settings.chats,
          sharedKey: encryptedChatKey,
        },
        [],
      );

      // Hand the inviter their own copy of the chat's Document key, ECDH-
      // wrapped so only they (and we) can decrypt it. Their public key is
      // already known - it was sent along with the original request - so
      // no extra fetch is needed here.
      const sharedKeyForInviter = await cryptoService.encryptKey(
        chatDocumentKey,
        inviterPublicKey,
        mainKeyPair.privateKey,
      );
      await contactRepository.acceptContactRequest(
        userId,
        contactId,
        mainKeyPair.publicKey,
        chatId,
        sharedKeyForInviter,
        ownPublicProfile.documentId,
      );

      // Share our own public profile into the chat (§3.2): a keys/{contactId}.json entry under our
      // ppId, wrapped with the chat's own key - the same mechanism documentService.shareDocument
      // uses for any other document shared into a chat.
      await documentService.shareDocument(
        userId,
        {
          documentId: ownPublicProfile.documentId,
          name: "",
          key: ownPublicProfile.key,
        },
        contactId,
        chatDocumentKey,
      );

      return contact;
    } catch (e) {
      console.error(
        "Error in acceptContactRequest",
        typeof e,
        e,
        e instanceof Error ? e.stack : "",
      );
      throw e;
    }
  },

  // Inviter side: pick up a request the invitee has ACCEPTED. Decrypts the
  // chat Document key (to make sure it's actually usable before we tell
  // the server we're done with this request), records the contact in our
  // own "chats" document, and confirms receipt so the server can delete
  // the now-redundant request.
  receiveContactRequest: async (
    userId: UserId,
    request: ContactRequest,
    ownPublicProfile: PublicProfile,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<Contact> => {
    if (!request.chatId || !request.sharedKey) {
      throw new Error("Accepted contact request is missing chatId/sharedKey");
    }

    const chatsDocument = await documentService.loadDocument(
      userId,
      settings.chats,
      userId,
      settings.settingsKey,
    );
    // A failed load returns a key-less placeholder, so this also guards
    // against rebuilding the contacts list off one.
    if (!chatsDocument.key) {
      throw new Error("Chats document key not found");
    }

    // Decrypt the ECDH-wrapped chat Document key from the invitee, then
    // re-wrap it symmetrically under our own chats-document key. The server
    // files that entry under the chat Document in the invitee's tree
    // (issuer = us), which is what grants us the "member" role on the chat
    // from now on - we no longer keep an ECDH-wrapped copy.
    const chatDocumentKey = await cryptoService.decryptKey(
      request.sharedKey,
      request.publicKey,
      mainKeyPair.privateKey,
    );
    const rewrappedChatKey = await cryptoService.encryptKey(
      chatDocumentKey,
      chatsDocument.key,
    );

    // Share our own public profile into the chat (§3.2/§4): the invitee already put both parties'
    // ppIds into the chat metadata at accept time, but only we can grant them read access to ours
    // (issuer = them, filed under our own ppId).
    await documentService.shareDocument(
      userId,
      {
        documentId: ownPublicProfile.documentId,
        name: "",
        key: ownPublicProfile.key,
      },
      request.invitee,
      chatDocumentKey,
    );

    const contact: Contact = {
      userId: request.invitee,
      chatId: request.chatId,
      owner: request.invitee,
    };
    const updatedContacts = appendContact(chatsDocument.contacts, contact);
    await documentService.updateDocumentMetadata(
      userId,
      settings.chats,
      chatsDocument.key,
      {
        name: chatsDocument.name,
        type: chatsDocument.type,
        contacts: updatedContacts,
      },
      chatsDocument.etag,
    );

    await contactRepository.confirmContactRequestReceived(
      userId,
      request.invitee,
      {
        issuer: userId,
        kid: settings.chats,
        sharedKey: rewrappedChatKey,
      },
    );

    return contact;
  },

  // Loads the symmetric key of a chat's Document. Both parties keep their
  // own key entry wrapped symmetrically under their own "chats" document's
  // key: the owner (whoever accepted the original request) filed theirs
  // when creating the chat Document; the other party's copy was synced into
  // the chat Document (in the owner's tree, under their own email) by the
  // server during the receipt-confirmation step. Either way it unwraps with
  // our own chats-document key.
  loadChatKey: async (
    user: UserId,
    contact: Contact,
    chatsId: string,
    chatsDocumentKey: JsonWebKey,
  ): Promise<{ key: JsonWebKey; publicProfiles?: Record<string, string> }> => {
    const document =
      contact.owner === user
        ? await documentService.loadDocument(
            user,
            contact.chatId,
            chatsId,
            chatsDocumentKey,
          )
        : await documentService.loadDocument(
            contact.owner,
            contact.chatId,
            user,
            chatsDocumentKey,
          );
    if (!document.key) {
      throw new Error("Chat document key not found");
    }
    return { key: document.key, publicProfiles: document.publicProfiles };
  },
};
