import { FederationUnavailableError } from "../api/GuestTokenProvider";
import { ContactEntry } from "../document/DocumentMetadata";
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

// After a reload the provider has forgotten which address an account uses at which server (ADR
// 0013 A11): the chat list still knows (ContactEntry.self). Without a provider, nothing to tell.
export function rememberForeignAddresses(contacts: ContactEntry[]): void {
  if (!current) {
    return;
  }
  for (const contact of contacts) {
    if (contact.chatOrigin && contact.self) {
      current.rememberAddress(contact.chatOrigin, contact.self.address);
    }
  }
}
