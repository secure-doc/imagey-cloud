import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair, Settings } from "../contexts/AuthenticationContext";
import { PublicProfile } from "../profile/PublicProfile";
import { ContactEntry } from "../document/DocumentMetadata";
import { ContactInfo, ContactRequest } from "./ContactRequest";
import { contactRepository } from "./ContactRepository";
import {
  documentRepository,
  HttpError,
  PreconditionFailedError,
} from "../document/DocumentRepository";
import {
  DocumentLoadError,
  documentService,
} from "../document/DocumentService";

// How often updateContact re-reads the "chats" document and
// retries after the server rejected the write because it changed concurrently
// (e.g. the same chat open in two tabs, or a contact-request accept/receive
// racing this update) - same reasoning as DocumentService.storeDocument's own
// retry loop.
const MAX_CHATS_UPDATE_RETRIES = 3;

// Re-fetches and decrypts the "chats" document with a key we already hold,
// returning just what updateContact needs to re-apply its
// change after a concurrent-modification 412: the current contacts list and
// the current revision.
async function reloadChatsContacts(
  userId: UserId,
  chatsDocumentId: string,
  chatsDocumentKey: JsonWebKey,
): Promise<{ contacts: ContactEntry[]; revision: string | null }> {
  const { content, etag } = await documentRepository.loadDocument(
    userId,
    chatsDocumentId,
  );
  const decrypted = await cryptoService.decryptDocument(
    chatsDocumentKey,
    content,
  );
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return { contacts: payload.contacts ?? [], revision: etag };
}

// Appends a contact to the "chats" document's list, replacing any existing
// entry for the same chat (chatId is a freshly generated uuid, unique per
// chat/contact). Both handshake steps are non-atomic read-modify-writes
// followed by a separate server call (accept: the repository call; receive:
// confirmContactRequestReceived) - if that trailing call fails the request
// stays pending and the whole step is retried on the next poll, by which
// point our first attempt's list write has already landed. Deduping here
// keeps the retry from growing the list without bound.
function appendContact(
  existing: ContactEntry[],
  contact: ContactEntry,
): ContactEntry[] {
  const others = existing.filter((c) => c.chatId !== contact.chatId);
  return [...others, contact];
}

// Until the inviter has created the chat Document and the server has filed the
// invitee's key entry (ADR 0015 leg 3), loading it answers 401/403 (no key
// entry yet) or 404. Anything else - a server error, a network failure, an
// undecryptable key - is a real error and must not be masked by `pending`.
function isChatNotAccessibleYet(e: unknown): boolean {
  return (
    e instanceof DocumentLoadError &&
    e.cause instanceof HttpError &&
    [401, 403, 404].includes(e.cause.status)
  );
}

// Both parties' "public-profile" Document ids, keyed by UserId. The other
// party's id is only missing if their public-profile somehow does not exist
// yet (should not normally happen, see docs/plans/chat-public-profile.md §3.6).
function makePublicProfiles(
  ownUserId: string,
  ownPublicProfileId: string,
  contactUserId: string,
  contactPublicProfileId: string | undefined,
): Record<string, string> {
  return {
    [ownUserId]: ownPublicProfileId,
    ...(contactPublicProfileId
      ? { [contactUserId]: contactPublicProfileId }
      : {}),
  };
}

// The other party's public profile isn't reachable yet at accept/receive
// time - name/email come from what they told on the contact request (see
// ContactRequest.contactInfo), if anything. profileRevision starts as "" so
// the first time this chat is opened, the mismatch against the real loaded
// PublicProfileMetadata.revision triggers a snapshot refresh (see Chat.tsx /
// updateContactProfileSnapshot).
function makePlaceholderContactEntry(
  userId: string,
  chatId: string,
  owner: string,
  info: ContactInfo,
): ContactEntry {
  return {
    userId,
    chatId,
    owner,
    name: info.name ?? "",
    ...(info.email ? { email: info.email } : {}),
    profileRevision: "",
  };
}

async function encryptContactInfo(
  info: ContactInfo,
  key: JsonWebKey,
): Promise<string> {
  return cryptoService.encryptMessage(JSON.stringify(info), key);
}

// Never rejects: contact info is a display nicety only - a missing or
// undecryptable one (e.g. the invitee signed in with a different address than
// the one they were invited with) resolves to {}.
async function decryptContactInfo(
  encrypted: string | undefined,
  key: JsonWebKey,
): Promise<ContactInfo> {
  if (!encrypted) {
    return {};
  }
  try {
    const info = JSON.parse(await cryptoService.decryptMessage(encrypted, key));
    return {
      name:
        typeof info.name === "string"
          ? info.name.trim() || undefined
          : undefined,
      email:
        typeof info.email === "string" ? info.email || undefined : undefined,
    };
  } catch (e) {
    console.error("Failed to decrypt contact info", e);
    return {};
  }
}

// What the chat view keeps of the "chats" document to write it back.
type ChatsDocumentState = {
  documentId: string;
  name: string;
  key: JsonWebKey;
  revision: string | null;
  contacts: ContactEntry[];
};

// Applies `patch` to one contact of the "chats" document and writes it back -
// a read-modify-write that re-reads the document and re-applies the patch if
// the server rejects the write because it changed concurrently (e.g. the same
// chat open in two tabs, a contact-request accept/receive, or the chat view's
// own profile-snapshot and pending-key updates racing each other) - same
// reasoning as DocumentService.storeDocument's own retry loop.
async function updateContact(
  userId: UserId,
  chatsDocument: ChatsDocumentState,
  contactUserId: string,
  patch: (contact: ContactEntry) => ContactEntry,
): Promise<{ contacts: ContactEntry[]; revision: string | null }> {
  let currentContacts = chatsDocument.contacts;
  let currentRevision = chatsDocument.revision;
  for (let attempt = 1; attempt <= MAX_CHATS_UPDATE_RETRIES; attempt++) {
    const updatedContacts = currentContacts.map((contact) =>
      contact.userId === contactUserId ? patch(contact) : contact,
    );
    try {
      const newRevision = await documentService.updateDocumentMetadata(
        userId,
        chatsDocument.documentId,
        chatsDocument.key,
        {
          name: chatsDocument.name,
          type: "chatList",
          contacts: updatedContacts,
        },
        currentRevision,
      );
      return { contacts: updatedContacts, revision: newRevision };
    } catch (e) {
      if (
        !(e instanceof PreconditionFailedError) ||
        attempt >= MAX_CHATS_UPDATE_RETRIES
      ) {
        throw e;
      }
      const reloaded = await reloadChatsContacts(
        userId,
        chatsDocument.documentId,
        chatsDocument.key,
      );
      currentContacts = reloaded.contacts;
      currentRevision = reloaded.revision;
    }
  }
  // Unreachable: the final iteration either returns or rethrows.
  throw new PreconditionFailedError("Chats document update retries exhausted");
}

export const contactService = {
  // Inviter side, leg 1: encrypts our own name/address for the invitee, who
  // can read it before accepting (see ContactRequest.contactInfo).
  encryptInvitationInfo: async (
    info: ContactInfo,
    inviteeEmail: string,
    chatId: string,
  ): Promise<string> =>
    encryptContactInfo(
      info,
      await cryptoService.deriveInvitationKey(inviteeEmail, chatId),
    ),

  // Invitee side: reads the inviter's name/address off an INVITED request.
  // Resolves to {} if it cannot be read.
  readInvitationInfo: async (
    request: Pick<ContactRequest, "chatId" | "contactInfo">,
    ownEmail: string | undefined,
  ): Promise<ContactInfo> => {
    if (!ownEmail) {
      return {};
    }
    return decryptContactInfo(
      request.contactInfo,
      await cryptoService.deriveInvitationKey(ownEmail, request.chatId),
    );
  },

  // Invitee side, leg 2 of the handshake (ADR 0015): accept an INVITED
  // request. The inviter owns the chat and creates its Document later (leg 3);
  // we only derive the chat key (ECDH + HKDF, nothing is transported), record
  // the contact - with the key in its `pending` part, so the chat is usable
  // right away - share our public profile into the chat, and hand the server
  // our own entry for the chat key (wrapped under our "chats" document key),
  // which it files under the chat Document once the inviter created it.
  acceptContactRequest: async (
    userId: UserId,
    invitation: Pick<
      ContactRequest,
      "inviter" | "chatId" | "publicKey" | "publicProfileId" | "contactInfo"
    >,
    ownEmail: string | undefined,
    ownPublicProfile: PublicProfile,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<ContactEntry> => {
    const {
      inviter: contactId,
      chatId,
      publicKey: inviterPublicKey,
      publicProfileId: inviterPublicProfileId,
    } = invitation;
    try {
      const chatsDocument = await documentService.loadDocument(
        userId,
        settings.chats,
        userId,
        settings.settingsKey,
      );
      if (chatsDocument.type !== "chatList") {
        throw new Error(
          `Expected the "chats" document to be a chatList, got ${chatsDocument.type}`,
        );
      }

      const chatKey = await cryptoService.deriveChatKey(
        mainKeyPair.privateKey,
        inviterPublicKey,
        chatId,
        contactId,
        userId,
      );
      const wrappedChatKey = await cryptoService.encryptKey(
        chatKey,
        chatsDocument.key,
      );
      // Both parties' "public-profile" Document ids (see
      // docs/plans/chat-public-profile.md §3.3) - the inviter writes them into
      // the chat's metadata in leg 3; until then we keep them in `pending`.
      const publicProfiles = makePublicProfiles(
        userId,
        ownPublicProfile.documentId,
        contactId,
        inviterPublicProfileId,
      );

      const contact: ContactEntry = {
        ...makePlaceholderContactEntry(
          contactId,
          chatId,
          contactId,
          await contactService.readInvitationInfo(invitation, ownEmail),
        ),
        pending: { chatKey, publicProfiles },
      };
      await documentService.updateDocumentMetadata(
        userId,
        settings.chats,
        chatsDocument.key,
        {
          name: chatsDocument.name,
          type: chatsDocument.type,
          contacts: appendContact(chatsDocument.contacts, contact),
        },
        // Reject (rather than silently clobber) if the "chats" document changed
        // since we loaded it - another accepted request would otherwise be lost.
        chatsDocument.revision,
      );

      // Share our own public profile into the chat (§3.2): a keys/{contactId}.json entry under our
      // ppId, wrapped with the chat key - the same mechanism documentService.shareDocument uses for
      // any other document shared into a chat. Done before the accept so a failure leaves the
      // request INVITED and the whole step can be retried.
      await documentService.shareDocument(
        userId,
        { documentId: ownPublicProfile.documentId, key: ownPublicProfile.key },
        contactId,
        chatKey,
      );

      await contactRepository.acceptContactRequest(
        userId,
        contactId,
        mainKeyPair.publicKey,
        wrappedChatKey,
        ownPublicProfile.documentId,
        // Our own name/address for the inviter, who can read it with the
        // chat key they derive in leg 3.
        await encryptContactInfo(
          { name: ownPublicProfile.name, email: ownEmail },
          chatKey,
        ),
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

  // Inviter side, leg 3 of the handshake (ADR 0015): pick up a request the
  // invitee has ACCEPTED. Derives the chat key from the invitee's public key,
  // creates the chat Document under our own "chats" document (atomically
  // together with the new contact entry), shares our public profile into the
  // chat and confirms receipt - whereupon the server files the invitee's key
  // entry under the chat Document.
  receiveContactRequest: async (
    userId: UserId,
    request: ContactRequest,
    ownPublicProfile: PublicProfile,
    settings: Settings,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<ContactEntry> => {
    const chatId = request.chatId;

    const chatsDocument = await documentService.loadDocument(
      userId,
      settings.chats,
      userId,
      settings.settingsKey,
    );
    if (chatsDocument.type !== "chatList") {
      throw new Error(
        `Expected the "chats" document to be a chatList, got ${chatsDocument.type}`,
      );
    }

    const chatKey = await cryptoService.deriveChatKey(
      mainKeyPair.privateKey,
      request.publicKey,
      chatId,
      userId,
      request.invitee,
    );

    // A retry after a failed confirm finds the chat already created (the
    // contact entry and the chat Document are written in one atomic upload).
    const existing = chatsDocument.contacts.find((c) => c.chatId === chatId);
    const contact =
      existing ??
      makePlaceholderContactEntry(
        request.invitee,
        chatId,
        userId,
        await decryptContactInfo(request.contactInfo, chatKey),
      );
    if (!existing) {
      const [encryptedChatContent] = await cryptoService.encryptDocument(
        chatKey,
        [
          new TextEncoder().encode(
            JSON.stringify({
              documentId: chatId,
              name: request.invitee,
              type: "chat",
              publicProfiles: makePublicProfiles(
                userId,
                ownPublicProfile.documentId,
                request.invitee,
                request.publicProfileId,
              ),
            }),
          ).buffer,
        ],
      );
      const [encryptedChatsContent] = await cryptoService.encryptDocument(
        chatsDocument.key,
        [
          new TextEncoder().encode(
            JSON.stringify({
              name: chatsDocument.name,
              type: chatsDocument.type,
              contacts: appendContact(chatsDocument.contacts, contact),
            }),
          ).buffer,
        ],
      );
      await documentRepository.uploadDocument(
        userId,
        userId, // the chat is created under the inviter's own "chats" document
        settings.chats,
        encryptedChatsContent,
        chatsDocument.revision,
        chatId,
        encryptedChatContent,
        {
          issuer: userId,
          kid: settings.chats,
          sharedKey: await cryptoService.encryptKey(chatKey, chatsDocument.key),
        },
        [],
      );
    }

    // Share our own public profile into the chat (§3.2/§4): only we can grant the invitee read
    // access to ours (issuer = them, filed under our own ppId).
    await documentService.shareDocument(
      userId,
      { documentId: ownPublicProfile.documentId, key: ownPublicProfile.key },
      request.invitee,
      chatKey,
    );

    await contactRepository.confirmContactRequestReceived(
      userId,
      request.invitee,
    );

    return contact;
  },

  // Loads the symmetric key of a chat's Document. Both parties keep their
  // own key entry wrapped symmetrically under their own "chats" document's
  // key: the owner (the inviter) filed theirs when creating the chat
  // Document; the invitee's entry was filed by the server during the
  // receipt-confirmation step. Either way it unwraps with our own
  // chats-document key. Until the inviter has created the chat Document, the
  // invitee falls back to the `pending` part of their contact entry.
  loadChatKey: async (
    user: UserId,
    contact: ContactEntry,
    chatsId: string,
    chatsDocumentKey: JsonWebKey,
  ): Promise<{
    key: JsonWebKey;
    publicProfiles: Record<string, string>;
    // true if the chat Document could not be loaded and `contact.pending` was
    // used instead.
    pending: boolean;
  }> => {
    let document;
    try {
      document =
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
    } catch (e) {
      if (contact.pending && isChatNotAccessibleYet(e)) {
        return {
          key: contact.pending.chatKey,
          publicProfiles: contact.pending.publicProfiles,
          pending: true,
        };
      }
      throw e;
    }
    if (document.type !== "chat") {
      throw new Error(`Expected a chat document, got ${document.type}`);
    }
    return {
      key: document.key,
      publicProfiles: document.publicProfiles,
      pending: false,
    };
  },

  // Patches one contact's denormalized public-profile snapshot (name/avatarId
  // /profileRevision) in the "chats" document - called from the chat view
  // when the freshly-loaded PublicProfileMetadata.revision no longer matches
  // the cached ContactEntry.profileRevision.
  updateContactProfileSnapshot: (
    userId: UserId,
    chatsDocument: ChatsDocumentState,
    contactUserId: string,
    snapshot: { name: string; avatarId?: string; revision: string },
  ): Promise<{ contacts: ContactEntry[]; revision: string | null }> =>
    updateContact(userId, chatsDocument, contactUserId, (contact) => ({
      ...contact,
      name: snapshot.name,
      avatarId: snapshot.avatarId,
      profileRevision: snapshot.revision,
    })),

  // Removes a contact's `pending` chat key (ADR 0015 decision 5) - called
  // from the chat view once the chat Document itself has been loaded, i.e.
  // the inviter has created it and the server has filed our key entry.
  dropPendingChatKey: (
    userId: UserId,
    chatsDocument: ChatsDocumentState,
    contactUserId: string,
  ): Promise<{ contacts: ContactEntry[]; revision: string | null }> =>
    updateContact(userId, chatsDocument, contactUserId, (contact) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { pending, ...rest } = contact;
      return rest;
    }),
};
