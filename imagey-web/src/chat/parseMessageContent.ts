// A message's raw content is a plain string; two structured conventions are
// sniffed off a `startsWith` prefix (a `JSON.parse` up front would throw on
// every ordinary text message): "shared-document" (an image shared into the
// chat, ADR 0015) and "group-invitation" (ADR 0019 decision 2), posted only
// into a 1:1 chat. Anything else - including a structured prefix that fails
// to parse - is plain text.
export type ParsedMessageContent =
  | { type: "text"; content: string }
  | { type: "shared-document"; documentId: string; owner: string }
  | { type: "group-invitation"; groupId: string; owner: string; name: string };

export function parseMessageContent(content: string): ParsedMessageContent {
  if (content.startsWith('{"type":"shared-document"')) {
    try {
      const payload = JSON.parse(content);
      return {
        type: "shared-document",
        documentId: payload.documentId,
        owner: payload.owner,
      };
    } catch {
      // fall through to plain text
    }
  } else if (content.startsWith('{"type":"group-invitation"')) {
    try {
      const payload = JSON.parse(content);
      return {
        type: "group-invitation",
        groupId: payload.groupId,
        owner: payload.owner,
        name: payload.name,
      };
    } catch {
      // fall through to plain text
    }
  }
  return { type: "text", content };
}
