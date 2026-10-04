import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { messageService } from "../chat/MessageService";
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

type GroupMetadataState = {
  name: string;
  members: string[];
  publicProfiles: Record<string, string>;
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
// member. Used both for GroupChat.tsx's initial full load (name/members/
// publicProfiles) and, for the owner, by updateGroupMetadata's 412 retry
// below (ContactService.reloadChatList is the equivalent for the "chats"
// document).
export async function loadGroupContent(
  ownerId: string,
  groupId: string,
  groupKey: JsonWebKey,
): Promise<{ metadata: GroupMetadataState; revision: string | null }> {
  const { content, etag } = await documentRepository.loadDocument(
    ownerId,
    groupId,
  );
  const decrypted = await cryptoService.decryptDocument(groupKey, content);
  const payload = JSON.parse(new TextDecoder().decode(decrypted));
  return {
    metadata: {
      name: payload.name,
      members: payload.members ?? [],
      publicProfiles: payload.publicProfiles ?? {},
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
        currentList = { contacts: currentList.contacts, groups: updatedGroups };
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
      // The 1:1 chat the invitation is posted into.
      chatOwnerId: string;
      chatId: string;
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
    }));
    await documentService.shareDocument(
      userId,
      { documentId: group.documentId, key: group.key },
      member.userId,
      member.pairChatKey,
    );
    await messageService.sendEncryptedMessage(
      userId,
      member.chatOwnerId,
      member.chatId,
      JSON.stringify({
        type: "group-invitation",
        groupId: group.documentId,
        owner: userId,
        name: updated.name,
      }),
      member.pairChatKey,
      [member.userId],
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
  ): Promise<{
    key: JsonWebKey;
    name: string;
    members: string[];
    publicProfiles: Record<string, string>;
  }> => {
    const group = await documentService.loadDocument(
      groupOwnerId,
      groupId,
      userId,
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
    ownPublicProfile: PublicProfile,
  ): Promise<{ list: ChatList; revision: string | null }> => {
    const group = await groupService.loadGroupKey(
      userId,
      groupOwnerId,
      groupId,
      pairChatKey,
    );
    const groupEntry: GroupEntry = {
      groupId,
      owner: groupOwnerId,
      name: group.name,
      groupKey: group.key,
    };
    const { list, revision } = await updateChatList(
      userId,
      chatsDocument,
      (current) => ({
        ...current,
        groups: appendGroup(current.groups, groupEntry),
      }),
    );
    await documentService.shareDocument(
      userId,
      { documentId: ownPublicProfile.documentId, key: ownPublicProfile.key },
      userId,
      group.key,
      groupOwnerId,
      groupId,
    );
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
  ): Promise<void> =>
    documentService.shareDocument(
      userId,
      document,
      userId,
      groupKey,
      groupOwnerId,
      groupId,
    ),
};
