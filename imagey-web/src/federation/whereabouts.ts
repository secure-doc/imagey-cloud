import { isOwnOrigin } from "../api/RemoteApiClient";
import { repositoriesFor } from "../api/repositoriesFor";
import { UserId } from "../authentication/UserId";
import { ContactEntry } from "../document/DocumentMetadata";

// Where something lives and who we are there (ADR 0013, F8). Every access to a document or a
// message needs both: the server to talk to, and the own UserId on it (as `kid` when loading
// keys, to tell own messages from the others').
export interface Place {
  origin?: string; // undefined = own server
  selfId: UserId; // own UserId on that server
}

// The place on `origin`. On a foreign server the id comes from the guest session, renewed if
// needed - the same single-flight renewal the requests use.
export async function placeOf(
  origin: string | undefined,
  user: UserId,
): Promise<Place> {
  if (origin === undefined || isOwnOrigin(origin)) {
    return { selfId: user };
  }
  const session = await repositoriesFor(origin).session?.();
  if (!session) {
    throw new Error("No guest session for " + origin);
  }
  return { origin: session.origin, selfId: session.userId };
}

// The foreign servers a contact may point us to: where the chat lives and where their profile
// does. A shared document (message `origin`) or a detail page (`?origin=`) naming any other server
// is refused, as loading it would log us in there with an address of ours (ADR 0013 A12).
export function foreignOriginsOf(
  contact: Pick<ContactEntry, "chatOrigin" | "profileHome">,
): string[] {
  return [contact.chatOrigin, contact.profileHome?.origin].filter(
    (origin): origin is string => !!origin,
  );
}

// Chat and messages of a contact. Synchronous: the own id there is part of the entry.
export function chatPlace(contact: ContactEntry, user: UserId): Place {
  return contact.chatOrigin
    ? { origin: contact.chatOrigin, selfId: contact.self?.userId ?? user }
    : { selfId: user };
}

// The contact's public profile: on their home server if it differs from the chat's (then we
// read it as a guest there), else next to the chat.
export async function profilePlace(
  contact: ContactEntry,
  user: UserId,
): Promise<Place & { owner: UserId }> {
  if (contact.profileHome) {
    return {
      ...(await placeOf(contact.profileHome.origin, user)),
      owner: contact.profileHome.userId,
    };
  }
  return { ...chatPlace(contact, user), owner: contact.userId };
}
