import { Message } from "./Message";

// Messages hang off the chat's own Document: /users/{owner}/documents/{chatId}/messages.
// `owner` is whoever created the chat Document (Contact.owner); both parties address the
// same URL - the owner directly, the other party via their ECDH-wrapped chat key.
export const messageRepository = {
  sendMessage: async (
    ownerId: string,
    chatId: string,
    encryptedContent: string,
    // The other chat members to push-notify (ADR 0020 decision 4) - the
    // server only pushes to ones that already pass its own access check for
    // this chat, so this cannot be used to spam arbitrary users.
    notify: string[] = [],
  ): Promise<string> => {
    const headers: Record<string, string> = {
      "Content-Type": "text/plain",
    };
    if (notify.length > 0) {
      headers["Notify"] = notify.join(",");
    }
    const response = await fetch(
      `/users/${ownerId}/documents/${chatId}/messages`,
      {
        method: "POST",
        headers,
        credentials: "same-origin",
        body: encryptedContent,
      },
    );
    if (!response.ok) {
      throw new Error("Failed to send message");
    }
    const location = response.headers.get("Location");
    if (!location) {
      throw new Error("No Location header returned");
    }
    const parts = location.split("/");
    return parts[parts.length - 1];
  },
  receiveMessages: async (
    ownerId: string,
    chatId: string,
    sinceId?: string,
    wait?: number,
  ): Promise<Message[]> => {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (wait !== undefined && wait > 0) {
      headers["Prefer"] = `wait=${wait}`;
    }

    const response = await fetch(
      `/users/${ownerId}/documents/${chatId}/messages${sinceId ? "?" + new URLSearchParams({ sinceId }) : ""}`,
      {
        method: "GET",
        headers,
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      throw new Error("Failed to receive messages");
    }
    return response.json();
  },
};
