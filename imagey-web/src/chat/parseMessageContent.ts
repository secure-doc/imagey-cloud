import { normalizeOrigin } from "../api/RemoteApiClient";

// A message's raw content is a plain string; two structured conventions are
// sniffed off a `startsWith` prefix (a `JSON.parse` up front would throw on
// every ordinary text message): "shared-document" (an image shared into the
// chat, ADR 0015) and "group-invitation" (ADR 0019 decision 2), posted only
// into a 1:1 chat. Anything else - including a structured prefix that fails
// to parse - is plain text.
export type ParsedMessageContent =
  | { type: "text"; content: string }
  | {
      type: "shared-document";
      documentId: string;
      owner: string;
      // Where the document lives, relative to the reader (F8): absent = on the chat's server,
      // null = on the own server, else the origin of that other server (the sender's home
      // when the chat is elsewhere).
      origin?: string | null;
    }
  | {
      type: "group-invitation";
      groupId: string;
      owner: string;
      name: string;
      // Where the group lives, relative to the reader (F9), like `shared-document`: absent =
      // on the chat's server, null = on the own server, else the origin of that other server.
      origin?: string | null;
      // The address the inviter registered the reader under on the group's server (F9), if the
      // group is not on the chat's server: the guest session there is bound to it.
      address?: string;
    };

// The `origin` of a message comes from the other party: only a well-formed one passes. The own
// origin is normalized to null, as the document then is local.
function parseDocumentOrigin(origin: unknown): string | null {
  if (typeof origin !== "string") {
    throw new TypeError("Invalid origin");
  }
  return normalizeOrigin(origin) ?? null;
}

// Only a well-formed address is taken over; anything else is dropped (the invitation still
// counts, the reader's own address is then used).
function parseAddress(address: unknown): string | undefined {
  return typeof address === "string" &&
    address.length <= 254 &&
    /^\S+@\S+\.\S+$/.test(address)
    ? address
    : undefined;
}

export function parseMessageContent(content: string): ParsedMessageContent {
  if (content.startsWith('{"type":"shared-document"')) {
    try {
      const payload = JSON.parse(content);
      return {
        type: "shared-document",
        documentId: payload.documentId,
        owner: payload.owner,
        ...(payload.origin !== undefined
          ? { origin: parseDocumentOrigin(payload.origin) }
          : {}),
      };
    } catch {
      // fall through to plain text
    }
  } else if (content.startsWith('{"type":"group-invitation"')) {
    try {
      const payload = JSON.parse(content);
      const address = parseAddress(payload.address);
      return {
        type: "group-invitation",
        groupId: payload.groupId,
        owner: payload.owner,
        name: payload.name,
        ...(payload.origin !== undefined
          ? { origin: parseDocumentOrigin(payload.origin) }
          : {}),
        ...(address ? { address } : {}),
      };
    } catch {
      // fall through to plain text
    }
  }
  return { type: "text", content };
}
