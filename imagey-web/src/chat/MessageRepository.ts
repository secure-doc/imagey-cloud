import { Message } from "./Message";

// Messages hang off the chat's own Document: /users/{owner}/documents/{chatId}/messages.
// `owner` is whoever created the chat Document (Contact.owner); both parties address the
// same URL - the owner directly, the other party via their ECDH-wrapped chat key.
export const messageRepository = {
  sendMessage: async (
    ownerId: string,
    chatId: string,
    encryptedContent: string,
  ): Promise<string> => {
    const response = await fetch(
      `/users/${ownerId}/documents/${chatId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
        },
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
