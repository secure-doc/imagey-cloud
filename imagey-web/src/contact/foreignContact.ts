import { ContactEntry } from "../document/DocumentMetadata";

// A contact whose chat or profile lives on another server (ADR 0013 A11). Until F8/F9 the
// features that need to reach them (group membership, ...) leave them out.
export function isForeignContact(contact: ContactEntry): boolean {
  return !!contact.chatOrigin || !!contact.profileHome;
}
