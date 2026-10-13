import {
  createMessageService,
  MessageService,
  messageService,
} from "../chat/MessageService";
import {
  createDocumentService,
  DocumentService,
  documentService,
} from "../document/DocumentService";
import { isOwnOrigin, parseOrigin } from "./RemoteApiClient";
import { Repositories, repositoriesFor } from "./repositoriesFor";

export interface Services {
  documents: DocumentService;
  messages: MessageService;
}

// Keyed by the repositories they are built on, which repositoriesFor caches per
// origin and drops when the guest token provider changes - the services follow.
const remote = new WeakMap<Repositories, Services>();

// Services for the server `origin` (undefined = own server) (ADR 0013, F8).
export function servicesFor(origin?: string): Services {
  if (origin === undefined || isOwnOrigin(origin)) {
    return { documents: documentService, messages: messageService };
  }
  const server = parseOrigin(origin);
  const repositories = repositoriesFor(server);
  let services = remote.get(repositories);
  if (!services) {
    services = {
      documents: createDocumentService(repositories.documents, server),
      messages: createMessageService(repositories.messages),
    };
    remote.set(repositories, services);
  }
  return services;
}
