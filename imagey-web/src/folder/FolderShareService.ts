import { UserId } from "../authentication/UserId";
import { servicesFor } from "../api/servicesFor";
import {
  ChatsDocumentState,
  contactService,
  updateChatList,
} from "../contact/ContactService";
import { chatPlace, placeOf } from "../federation/whereabouts";
import {
  ContactEntry,
  FolderMetadata,
  SharedFolderEntry,
} from "../document/DocumentMetadata";
import { PreconditionFailedError } from "../document/DocumentRepository";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";

export class NoAddressToShareWithError extends Error {
  constructor() {
    super("No address to share with");
    this.name = "NoAddressToShareWithError";
  }
}

export interface ShareFolderResult {
  // The folder's `sharedWith` list and revision after the share was recorded.
  sharedWith: NonNullable<FolderMetadata["sharedWith"]>;
  revision: string | null;
  // The "chats" document after resolving the grantee (it may have gained the contact's local id).
  contacts?: ContactEntry[];
  chatsRevision?: string | null;
}

export const folderShareService = {
  // Shares one of the user's own folders with a contact (docs/plans/share-folders.md §4.1):
  // 1. grants the contact a key on the folder, wrapped with the chat key,
  // 2. gives the contact the right to contribute - to this folder and everything below it - if
  //    asked to, else takes a right given before away (the server only gives it to somebody the
  //    folder is shared with),
  // 3. tells the contact in the 1:1 chat, and
  // 4. records the share in the folder, so the owner's other devices know it.
  shareFolder: async (
    user: UserId,
    chatsDocument: ChatsDocumentState,
    folder: Document<FolderMetadata>,
    contact: ContactEntry,
    contributions: boolean,
  ): Promise<ShareFolderResult> => {
    const resolved = await contactService.resolveShareGrantee(
      user,
      chatsDocument,
      contact,
    );
    if (!resolved) {
      throw new NoAddressToShareWithError();
    }
    const chatKey = (
      await contactService.loadChatKey(
        user,
        contact,
        chatsDocument.documentId,
        chatsDocument.key,
      )
    ).key;

    await documentService.shareDocument(
      user,
      folder,
      resolved.grantee,
      chatKey,
    );

    // The right is the contact's own (not the folder's): somebody else's, or none, changes nothing
    // for the others.
    // Shared again with other rights, the share says what it says: a right given before is taken
    // away when the folder is shared without it.
    if (contributions) {
      await documentService.allowContributions(
        user,
        folder.documentId,
        resolved.grantee,
      );
    } else {
      await documentService.denyContributions(
        user,
        folder.documentId,
        resolved.grantee,
      );
    }

    const place = chatPlace(contact, user);
    await servicesFor(place.origin).messages.sendEncryptedMessage(
      place.selfId,
      contact.owner,
      contact.chatId,
      JSON.stringify({
        type: "shared-folder",
        documentId: folder.documentId,
        owner: user,
        name: folder.name,
        contributions,
        // The folder stays on our server: say so if that is not the chat's.
        ...(contact.chatOrigin ? { origin: window.location.origin } : {}),
      }),
      chatKey,
      [contact.userId],
    );

    const recorded = await recordShare(user, folder, {
      contactUserId: contact.userId,
      contributions,
    });
    return {
      ...recorded,
      contacts: resolved.contacts,
      chatsRevision: resolved.revision,
    };
  },

  // Takes a folder somebody shared in a chat over into the "Shared with me"
  // list: loads it once through the chat key (which yields the folder key)
  // and caches the key in the "chats" document.
  acceptSharedFolder: async (
    user: UserId,
    chatsDocument: ChatsDocumentState,
    chatKey: JsonWebKey,
    shared: {
      documentId: string;
      owner: string;
      contributions: boolean;
      // Where the folder lives; undefined = own server.
      origin?: string;
    },
    // The chat entry the message came from (its address on the folder's server).
    contact: ContactEntry,
  ): Promise<{
    entry: SharedFolderEntry;
    sharedFolders: SharedFolderEntry[];
    revision: string | null;
  }> => {
    const place = await placeOf(shared.origin, user);
    const loaded = await servicesFor(shared.origin).documents.loadDocument(
      shared.owner,
      shared.documentId,
      place.selfId,
      chatKey,
    );
    if (loaded.type !== "folder") {
      throw new Error(`Expected a folder document, got ${loaded.type}`);
    }
    const address =
      shared.origin && shared.origin === contact.chatOrigin
        ? contact.self?.address
        : undefined;
    const entry: SharedFolderEntry = {
      documentId: shared.documentId,
      owner: shared.owner,
      name: loaded.name,
      folderKey: loaded.key,
      contributions: shared.contributions,
      ...(place.origin
        ? {
            chatOrigin: place.origin,
            self: { userId: place.selfId, ...(address ? { address } : {}) },
          }
        : {}),
    };
    const { list, revision } = await updateChatList(
      user,
      chatsDocument,
      (current) => ({
        ...current,
        sharedFolders: [
          ...(current.sharedFolders ?? []).filter(
            (f) => f.documentId !== entry.documentId,
          ),
          entry,
        ],
      }),
    );
    return { entry, sharedFolders: list.sharedFolders ?? [], revision };
  },
};

// Adds the share to the folder's own (encrypted) `sharedWith`. A concurrent
// change of the folder is retried once on the freshly read folder; failing
// to record is not fatal - the contact already has access - so the caller
// only loses the "shared" marker then.
async function recordShare(
  user: UserId,
  folder: Document<FolderMetadata>,
  share: { contactUserId: string; contributions: boolean },
): Promise<{
  sharedWith: NonNullable<FolderMetadata["sharedWith"]>;
  revision: string | null;
}> {
  let current = folder;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const sharedWith = [
      ...(current.sharedWith ?? []).filter(
        (s) => s.contactUserId !== share.contactUserId,
      ),
      share,
    ];
    try {
      const revision = await documentService.updateDocumentMetadata(
        user,
        current.documentId,
        current.key,
        {
          documentId: current.documentId,
          name: current.name,
          owner: current.owner,
          key: current.key,
          type: "folder",
          documents: current.documents,
          sharedWith,
        },
        current.revision,
      );
      return { sharedWith, revision };
    } catch (e) {
      if (!(e instanceof PreconditionFailedError) || attempt >= 2) {
        console.error("Could not record the folder share", e);
        return { sharedWith: folder.sharedWith ?? [], revision: null };
      }
      const reloaded = await documentService.loadDocumentWithKey(
        user,
        current.documentId,
        current.key,
      );
      if (reloaded.type !== "folder") {
        return { sharedWith: folder.sharedWith ?? [], revision: null };
      }
      current = reloaded;
    }
  }
  return { sharedWith: folder.sharedWith ?? [], revision: null };
}
