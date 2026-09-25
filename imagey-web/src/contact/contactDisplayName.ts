import { ContactInfo } from "./ContactRequest";

// The large label for a contact: their display name, else their address -
// never their opaque userId. Older contact entries carry the userId as a
// placeholder name, which counts as "no name".
export function contactDisplayName(
  userId: string,
  info: ContactInfo,
  unknown: string,
): string {
  const name = info.name?.trim();
  if (name && name !== userId) {
    return name;
  }
  return info.email || unknown;
}
