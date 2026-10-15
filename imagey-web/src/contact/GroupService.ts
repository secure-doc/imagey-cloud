import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { repositoriesFor } from "../api/repositoriesFor";
import { servicesFor } from "../api/servicesFor";
import { federationProvider } from "../federation/federationProvider";
import { placeOf } from "../federation/whereabouts";
import { BaseMetadata, GroupEntry } from "../document/DocumentMetadata";
import {
  documentRepository,
  PreconditionFailedError,
} from "../document/DocumentRepository";
import { documentService } from "../document/DocumentService";
import { PublicProfile } from "../profile/PublicProfile";
import {
  ChatList,
  ChatsDocumentState,
  knownSharedFolders,
  reloadChatList,
  updateChatList,
} from "./ContactService";

// How often addMember/renameGroup re-read the group Document and retry after
// the server rejected the write because it changed concurrently (e.g. two
// members added from different tabs) - same reasoning as
// ContactService.updateContact's retry loop.
const MAX_GROUP_UPDATE_RETRIES = 3;
// createGroup's own retry count for its atomic "chats" + group upload - see
// updateGroupMetadata below for why this can't go through updateChatList.
const MAX_GROUP_CREATE_RETRIES = 3;

// Thrown when a document is to be shared into a group on another server (ADR 0019
// amendment, F9): only the group's own server can check the two-hop Access-Path, and a guest
// has no tree there to put the key entry in.
// Thrown when joining a group on another server would need another address than the one this
// account is already known by there (only one is kept per server).
export class OtherAddressInUseError extends Error {
  constructor(origin: string) {
    super("This account is already known by another address at " + origin);
    this.name = "OtherAddressInUseError";
  }
}

export class FederatedGroupShareUnsupported extends Error {
  constructor() {
    super("Sharing into a group on another server is not supported");
    this.name = "FederatedGroupShareUnsupported";
  }
}

type GroupMetadataState = {
  name: string;
  members: string[];
  publicProfiles: Record<string, string>;
  memberNames?: Record<string, string>;
};

type GroupDocumentState = {
  documentId: string;
  key: JsonWebKey;
  revision: string | null;
} & GroupMetadataState;

// Appends a group to the "chats" document's list, replacing any existing
// entry for the same group (a second click on "Join", or the owner's own
// createGroup retry) - dedup mirrors ContactService's appendContact.
function appendGroup(existing: GroupEntry[], entry: GroupEntry): GroupEntry[] {
  const others = existing.filter((g) => g.groupId !== entry.groupId);
  return [...others, entry];
}

// Fetches and decrypts a group Document's content directly, given a group key
// already known - the owner's from their own load, a member's from their
// cached GroupEntry.groupKey (ADR 0019 decision 3) - skipping the normal
// documentService.loadDocument key round-trip entirely (there is no new key
// to fetch: the caller already holds it). `ownerId` is whose tree the group
// lives in - always the caller for the owner, always someone else for a
// member. `origin` is the group's server if it is not the own one (F9): then the member reads it
// as a guest. Used both for GroupChat.tsx's initial full load (name/members/
// publicProfiles) and, for the owner, by updateGroupMetadata's 412 retry
// below (ContactService.reloadChatList is the equivalent for the "chats"
// document).
export async function loadGroupContent(
  ownerId: string,
  groupId: string,
  groupKey: JsonWebKey,
  origin?: string,
): Promise<{ metadata: GroupMetadataState; revision: string | null }> {
  const { content, etag } = await repositoriesFor(
    origin,
  ).documents.loadDocument(ownerId, groupId);
  const decrypted = await cryptoService.decryptDocument(groupKey, content);
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return {
    metadata: {
      name: payload.name,
      members: payload.members ?? [],
      publicProfiles: payload.publicProfiles ?? {},
      ...(payload.memberNames ? { memberNames: payload.memberNames } : {}),
    },
    revision: etag,
  };
}

// Applies `patch` to a group's metadata and writes it back, retrying on a
// concurrent-modification 412 - the group-metadata equivalent of
// ContactService's (unexported) updateContact.
async function updateGroupMetadata(
  userId: UserId,
  group: GroupDocumentState,
  patch: (current: GroupMetadataState) => GroupMetadataState,
): Promise<GroupMetadataState & { revision: string | null }> {
  let current: GroupMetadataState = {
    name: group.name,
    members: group.members,
    publicProfiles: group.publicProfiles,
    memberNames: group.memberNames,
  };
  let currentRevision = group.revision;
  for (let attempt = 1; attempt <= MAX_GROUP_UPDATE_RETRIES; attempt++) {
    const updated = patch(current);
    try {
      const newRevision = await documentService.updateDocumentMetadata(
        userId,
        group.documentId,
        group.key,
        {
          name: updated.name,
          type: "group",
          members: updated.members,
          publicProfiles: updated.publicProfiles,
          ...(updated.memberNames ? { memberNames: updated.memberNames } : {}),
        },
        currentRevision,
      );
      return { ...updated, revision: newRevision };
    } catch (e) {
      if (
        !(e instanceof PreconditionFailedError) ||
        attempt >= MAX_GROUP_UPDATE_RETRIES
      ) {
        throw e;
      }
      const reloaded = await loadGroupContent(
        userId,
        group.documentId,
        group.key,
      );
      current = reloaded.metadata;
      currentRevision = reloaded.revision;
    }
  }
  // Unreachable: the final iteration either returns or rethrows.
  throw new PreconditionFailedError("Group metadata update retries exhausted");
}

export const groupService = {
  // Creates a group (ADR 0019 decision 1/2): a random group key, a new group
  // Document listing only the owner as a member, uploaded atomically together
  // with the updated "chats" list (a new GroupEntry) - exactly the shape
  // ContactService.receiveContactRequest uses for a chat Document's leg 3.
  // Unlike that atomic upload, this one retries itself on a concurrent-
  // modification 412 (re-reading the "chats" list and re-appending the same
  // GroupEntry/groupId/groupKey) since there is no separate UI-driven retry
  // path for it. Finishes by sharing the owner's own public profile into the
  // group (ADR 0019 decision 4) - otherwise members would see the owner as an
  // unknown member.
  createGroup: async (
    userId: UserId,
    name: string,
    chatsDocument: ChatsDocumentState,
    ownPublicProfile: PublicProfile,
  ): Promise<{
    groupId: string;
    groupKey: JsonWebKey;
    list: ChatList;
    revision: string | null;
  }> => {
    const groupId = cryptoService.generateUuid();
    const groupKey = await cryptoService.generateSymmetricKey();
    const groupEntry: GroupEntry = { groupId, owner: userId, name };
    const [encryptedGroupContent] = await cryptoService.encryptDocument(
      groupKey,
      [
        new TextEncoder().encode(
          JSON.stringify({
            documentId: groupId,
            name,
            type: "group",
            members: [userId],
            publicProfiles: { [userId]: ownPublicProfile.documentId },
          }),
        ).buffer,
      ],
    );

    let currentList: ChatList = {
      contacts: chatsDocument.contacts,
      groups: chatsDocument.groups,
      sharedFolders: await knownSharedFolders(userId, chatsDocument),
    };
    let currentRevision = chatsDocument.revision;
    let folderETag: string | null = null;
    for (let attempt = 1; attempt <= MAX_GROUP_CREATE_RETRIES; attempt++) {
      const updatedGroups = appendGroup(currentList.groups, groupEntry);
      const [encryptedChatsContent] = await cryptoService.encryptDocument(
        chatsDocument.key,
        [
          new TextEncoder().encode(
            JSON.stringify({
              name: chatsDocument.name,
              type: "chatList",
              contacts: currentList.contacts,
              groups: updatedGroups,
              sharedFolders: currentList.sharedFolders,
            }),
          ).buffer,
        ],
      );
      try {
        const result = await documentRepository.uploadDocument(
          userId,
          userId, // the group is created under the owner's own "chats" document
          chatsDocument.documentId,
          encryptedChatsContent,
          currentRevision,
          groupId,
          encryptedGroupContent,
          {
            issuer: userId,
            kid: chatsDocument.documentId,
            sharedKey: await cryptoService.encryptKey(
              groupKey,
              chatsDocument.key,
            ),
          },
          [],
        );
        folderETag = result.folderETag;
        currentList = { ...currentList, groups: updatedGroups };
        break;
      } catch (e) {
        if (
          !(e instanceof PreconditionFailedError) ||
          attempt >= MAX_GROUP_CREATE_RETRIES
        ) {
          throw e;
        }
        const reloaded = await reloadChatList(
          userId,
          chatsDocument.documentId,
          chatsDocument.key,
        );
        currentList = reloaded.list;
        currentRevision = reloaded.revision;
      }
    }

    await documentService.shareDocument(
      userId,
      { documentId: ownPublicProfile.documentId, key: ownPublicProfile.key },
      userId,
      groupKey,
      userId,
      groupId,
    );

    return {
      groupId,
      groupKey,
      list: currentList,
      revision: folderETag ?? currentRevision,
    };
  },

  // Adds an existing contact to a group the caller owns (ADR 0019 decision 2).
  // Order matters: metadata PUT, then the key entry that makes `member` an
  // actual member, then the invitation - so a join never finds an
  // inaccessible group, and a failure before the key is filed never sends an
  // invitation that would lead nowhere. Idempotent: re-adding an already-added
  // member dedupes in `members`, overwrites their `publicProfiles` entry, and
  // relies on documentRepository.storeSharedKey swallowing the resulting 409
  // on the key entry (still re-sends the invitation - the UI's "invite
  // again").
  addMember: async (
    userId: UserId,
    group: GroupDocumentState,
    member: {
      userId: string;
      // The member's "public-profile" Document id, if already known from the
      // 1:1 chat's metadata (ContactService.loadChatKey) - absent members show
      // as "Unknown member" until they share it themselves.
      publicProfileId?: string;
      // The member's display name, for a member whose profile is not reachable through the
      // group (F9: the contact lives on another server) - then no `publicProfileId` is given.
      memberName?: string;
      // The 1:1 chat the invitation is posted into, and the server it lives on if that is not
      // the own one (then the invitation says where the group is) with the own id there.
      chatOwnerId: string;
      chatId: string;
      chatOrigin?: string;
      chatSelfId?: string;
      // The address the member is registered under here, told in the invitation if the chat is
      // elsewhere: the guest session on this server is bound to it.
      memberAddress?: string;
      // The id the invitation's push goes to (the contact on the chat's server).
      notifyId?: string;
      // The 1:1 chat's own key (ContactService.loadChatKey) - both the
      // transport for the group key and, once filed as a key entry under the
      // group, the member's direct grant (ADR 0009).
      pairChatKey: JsonWebKey;
    },
  ): Promise<GroupMetadataState & { revision: string | null }> => {
    const updated = await updateGroupMetadata(userId, group, (current) => ({
      name: current.name,
      members: current.members.includes(member.userId)
        ? current.members
        : [...current.members, member.userId],
      publicProfiles: member.publicProfileId
        ? {
            ...current.publicProfiles,
            [member.userId]: member.publicProfileId,
          }
        : current.publicProfiles,
      memberNames: member.memberName
        ? { ...current.memberNames, [member.userId]: member.memberName }
        : current.memberNames,
    }));
    await documentService.shareDocument(
      userId,
      { documentId: group.documentId, key: group.key },
      member.userId,
      member.pairChatKey,
    );
    await servicesFor(member.chatOrigin).messages.sendEncryptedMessage(
      member.chatSelfId ?? userId,
      member.chatOwnerId,
      member.chatId,
      JSON.stringify({
        type: "group-invitation",
        groupId: group.documentId,
        owner: userId,
        name: updated.name,
        // The group stays on our server: say so if that is not the chat's.
        ...(member.chatOrigin
          ? {
              origin: window.location.origin,
              ...(member.memberAddress
                ? { address: member.memberAddress }
                : {}),
            }
          : {}),
      }),
      member.pairChatKey,
      [member.notifyId ?? member.userId],
    );
    return updated;
  },

  // Renames a group (owner-only, ADR 0019 decision 1): updates the group
  // metadata and the owner's own GroupEntry snapshot in the "chats" document.
  // Members' cached GroupEntry.name snapshots go stale until they re-join or
  // Phase 2 adds a refresh - see docs/plans/chat-groups-implementation.md's
  // "Offene Punkte".
  renameGroup: async (
    userId: UserId,
    group: GroupDocumentState,
    chatsDocument: ChatsDocumentState,
    newName: string,
  ): Promise<{
    group: GroupMetadataState & { revision: string | null };
    list: ChatList;
    revision: string | null;
  }> => {
    const updatedGroup = await updateGroupMetadata(
      userId,
      group,
      (current) => ({ ...current, name: newName }),
    );
    const { list, revision } = await updateChatList(
      userId,
      chatsDocument,
      (current) => ({
        ...current,
        groups: current.groups.map((g) =>
          g.groupId === group.documentId ? { ...g, name: newName } : g,
        ),
      }),
    );
    return { group: updatedGroup, list, revision };
  },

  // Loads the group key for a member who is not its owner: the group
  // Document reached via the own key entry filed under it at addMember time
  // (`parentFolderId = own userId` matches the kid it was filed under,
  // `parentFolderKey = pairChatKey` matches how it was wrapped) - exactly the
  // shape ContactService.loadChatKey uses for a non-owned chat Document.
  loadGroupKey: async (
    userId: UserId,
    groupOwnerId: string,
    groupId: string,
    pairChatKey: JsonWebKey,
    // The group's server, if it is not the own one (F9): our key entry is filed under our id
    // THERE.
    origin?: string,
  ): Promise<{
    key: JsonWebKey;
    name: string;
    members: string[];
    publicProfiles: Record<string, string>;
    place: Awaited<ReturnType<typeof placeOf>>;
  }> => {
    const place = await placeOf(origin, userId);
    const group = await servicesFor(origin).documents.loadDocument(
      groupOwnerId,
      groupId,
      place.selfId,
      pairChatKey,
    );
    if (group.type !== "group") {
      throw new Error(`Expected a group document, got ${group.type}`);
    }
    return {
      key: group.key,
      name: group.name,
      members: group.members,
      publicProfiles: group.publicProfiles,
      place,
    };
  },

  // Joins a group from its invitation (ADR 0019 decision 3): loads the group
  // Document (which also yields the group key, via loadGroupKey above), adds
  // a GroupEntry to the own "chats" document (deduplicated - a second click,
  // or a second tab), and shares the own public profile into the group so
  // other members can name the new joiner.
  joinGroup: async (
    userId: UserId,
    groupOwnerId: string,
    groupId: string,
    pairChatKey: JsonWebKey,
    chatsDocument: ChatsDocumentState,
    ownPublicProfile: PublicProfile | undefined,
    // The group's server, if it is not the own one (F9), and the address the own account is
    // known by there, if known: a member from another server joins as a guest, and does not
    // share the own profile into the group (its other members cannot reach it).
    origin?: string,
    address?: string,
  ): Promise<{ list: ChatList; revision: string | null }> => {
    // The guest session is bound to this address: it is remembered for the first access (and
    // taken back if that fails), unless the account is known by another one there already.
    let remembered = false;
    if (origin && address) {
      const provider = federationProvider();
      const inUse = provider.addressInUse(origin);
      if (inUse && inUse !== address) {
        throw new OtherAddressInUseError(origin);
      }
      if (!inUse) {
        provider.rememberAddress(origin, address);
        remembered = true;
      }
    }
    let group;
    try {
      group = await groupService.loadGroupKey(
        userId,
        groupOwnerId,
        groupId,
        pairChatKey,
        origin,
      );
    } catch (e) {
      if (remembered && origin) {
        federationProvider().forgetAddress(origin);
      }
      throw e;
    }
    const groupEntry: GroupEntry = {
      groupId,
      owner: groupOwnerId,
      name: group.name,
      groupKey: group.key,
      ...(group.place.origin
        ? {
            chatOrigin: group.place.origin,
            self: {
              userId: group.place.selfId,
              ...(address ? { address } : {}),
            },
          }
        : {}),
    };
    const { list, revision } = await updateChatList(
      userId,
      chatsDocument,
      (current) => ({
        ...current,
        groups: appendGroup(current.groups, groupEntry),
      }),
    );
    if (!group.place.origin && ownPublicProfile) {
      await documentService.shareDocument(
        userId,
        { documentId: ownPublicProfile.documentId, key: ownPublicProfile.key },
        userId,
        group.key,
        groupOwnerId,
        groupId,
      );
    }
    return { list, revision };
  },

  // Shares a document into a group (ADR 0019 decision 4): one key entry in
  // the sharer's tree, `{issuer: groupOwnerId, kid: groupId}` instead of one
  // per member - readers prove membership with an Access-Path
  // (FolderContext.buildGroupAccessPath) instead of a direct grant.
  shareDocumentIntoGroup: async (
    userId: string,
    document: Pick<BaseMetadata, "documentId" | "key">,
    groupOwnerId: string,
    groupId: string,
    groupKey: JsonWebKey,
    // The group's server, if it is not the own one: sharing is not possible there (F9).
    origin?: string,
  ): Promise<void> => {
    if (origin) {
      throw new FederatedGroupShareUnsupported();
    }
    return documentService.shareDocument(
      userId,
      document,
      userId,
      groupKey,
      groupOwnerId,
      groupId,
    );
  },
};
