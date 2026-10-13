import { UserId } from "../authentication/UserId";
import { ContactEntry } from "../document/DocumentMetadata";
import { contactDisplayName } from "./contactDisplayName";
import { contactService } from "./ContactService";
import { groupService } from "./GroupService";

// A contact can join a group on this server if we know (or can look up) their id here: a
// contact of this server is that id itself, one whose chat lives elsewhere needs the id from
// their ForeignUserMapping here, which takes their address (ADR 0019 amendment, F9).
export function isAddableToGroup(contact: ContactEntry): boolean {
  return !contact.chatOrigin || !!contact.localUserId || !!contact.email;
}

// The id of `contact` as a member of a group on this server, as far as the entry tells.
export function knownMemberId(contact: ContactEntry): string | undefined {
  return contact.chatOrigin ? contact.localUserId : contact.userId;
}

// Everything GroupService.addMember needs to know about `contact`.
export async function memberOf(
  user: UserId,
  contact: ContactEntry,
  chatsId: string,
  chatsDocumentKey: JsonWebKey,
): Promise<Parameters<typeof groupService.addMember>[2]> {
  // Before anything is written: the invitation is sent under the own id on the chat's server.
  if (contact.chatOrigin && !contact.self) {
    throw new Error("No id on the chat's server for " + contact.userId);
  }
  const [memberId, { key: pairChatKey, publicProfiles }] = await Promise.all([
    contactService.localIdOf(user, contact),
    contactService.loadChatKey(user, contact, chatsId, chatsDocumentKey),
  ]);
  if (!memberId) {
    throw new Error("No id on this server for " + contact.userId);
  }
  // A profile on another server cannot be reached through the group: the others see the name
  // we know them by instead.
  const profileElsewhere = !!contact.chatOrigin || !!contact.profileHome;
  return {
    userId: memberId,
    ...(profileElsewhere
      ? {
          memberName:
            contactDisplayName(contact.userId, contact, "") || undefined,
        }
      : { publicProfileId: publicProfiles[contact.userId] }),
    chatOwnerId: contact.owner,
    chatId: contact.chatId,
    chatOrigin: contact.chatOrigin,
    chatSelfId: contact.self?.userId,
    memberAddress: contact.email,
    notifyId: contact.userId,
    pairChatKey,
  };
}
