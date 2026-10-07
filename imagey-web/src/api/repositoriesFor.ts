import {
  createMessageRepository,
  messageRepository,
  MessageRepository,
} from "../chat/MessageRepository";
import {
  contactRepository,
  ContactRepository,
  createContactRepository,
} from "../contact/ContactRepository";
import {
  createDocumentRepository,
  documentRepository,
  DocumentRepository,
} from "../document/DocumentRepository";
import {
  GuestTokenProvider,
  unavailableGuestTokenProvider,
} from "./GuestTokenProvider";
import { createRemoteApiClient, parseOrigin } from "./RemoteApiClient";

export interface Repositories {
  documents: DocumentRepository;
  messages: MessageRepository;
  contacts: ContactRepository;
}

let provider: GuestTokenProvider = unavailableGuestTokenProvider;
const remote = new Map<string, Repositories>();

// Set by the real provider (2b). Drops cached remote repositories, as they hold the old one.
export function setGuestTokenProvider(next: GuestTokenProvider): void {
  provider = next;
  remote.clear();
}

// Repositories for the server `origin` (undefined = own server). Remote clients are
// cached per origin, so all callers share one guest session and one renewal.
export function repositoriesFor(origin?: string): Repositories {
  // Compare with the own origin before parseOrigin, which rejects plain http (also for it).
  if (
    origin === undefined ||
    new URL(origin).origin === window.location.origin
  ) {
    return {
      documents: documentRepository,
      messages: messageRepository,
      contacts: contactRepository,
    };
  }
  // Normalized, so "https://x/" and "https://X" are the same server (and the same cache entry).
  const server = parseOrigin(origin);
  let repositories = remote.get(server);
  if (!repositories) {
    const client = createRemoteApiClient(server, provider);
    repositories = {
      documents: createDocumentRepository(client),
      messages: createMessageRepository(client),
      contacts: createContactRepository(client),
    };
    remote.set(server, repositories);
  }
  return repositories;
}
