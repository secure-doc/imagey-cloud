import { FederationUnavailableError } from "../api/GuestTokenProvider";
import { ContactEntry, GroupEntry } from "../document/DocumentMetadata";
import { FederationGuestTokenProvider } from "./federationGuestTokenProvider";

// The provider App installed for the signed-in user (it is also the GuestTokenProvider of
// repositoriesFor). Pages that redeem an invitation need its extra methods.
let current: FederationGuestTokenProvider | undefined;

export function setFederationProvider(
  provider: FederationGuestTokenProvider | undefined,
): void {
  current = provider;
}

export function federationProvider(): FederationGuestTokenProvider {
  if (!current) {
    throw new FederationUnavailableError("No federation provider configured");
  }
  return current;
}

// The address the account is known by at `origin` right now (none without a provider).
export function addressInUse(origin: string): string | undefined {
  return current?.addressInUse(origin);
}

// After a reload the provider has forgotten which address an account uses at which server (ADR
// 0013 A11): the chat list still knows (ContactEntry.self). Without a provider, nothing to tell.
export function rememberForeignAddresses(
  contacts: ContactEntry[],
  groups: GroupEntry[] = [],
): void {
  if (!current) {
    return;
  }
  // Only one address is kept per server: the contacts come last, so that they win over a group
  // (the chats are older than the groups of the same server).
  for (const entry of [...groups, ...contacts]) {
    if (entry.chatOrigin && entry.self?.address) {
      current.rememberAddress(entry.chatOrigin, entry.self.address);
    }
  }
}
