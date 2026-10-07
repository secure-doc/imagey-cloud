import { ApiClient, localApiClient } from "../api/ApiClient";
import { Message } from "./Message";

// Messages hang off the chat's own Document: /users/{owner}/documents/{chatId}/messages.
// `owner` is whoever created the chat Document (Contact.owner); both parties address the
// same URL - the owner directly, the other party via their ECDH-wrapped chat key.
export function createMessageRepository(api: ApiClient) {
  return {
    sendMessage: async (
      ownerId: string,
      chatId: string,
      encryptedContent: string,
      // The other chat members to push-notify (ADR 0020 decision 4) - the
      // server only pushes to ones that already pass its own access check for
      // this chat, so this cannot be used to spam arbitrary users.
      notify: string[] = [],
    ): Promise<{ id: string; timestamp: string }> => {
      const headers: Record<string, string> = {
        "Content-Type": "text/plain",
      };
      if (notify.length > 0) {
        headers["Notify"] = notify.join(",");
      }
      const response = await api.fetch(
        `/users/${ownerId}/documents/${chatId}/messages`,
        {
          method: "POST",
          headers,
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
      const { timestamp } = await response.json();
      return { id: parts[parts.length - 1], timestamp };
    },
    // The time of the chat's newest message, from the Last-Modified header of
    // HEAD .../messages (ADR 0021). undefined for a chat without messages.
    fetchLastActivity: async (
      ownerId: string,
      chatId: string,
    ): Promise<Date | undefined> => {
      const response = await api.fetch(
        `/users/${ownerId}/documents/${chatId}/messages`,
        { method: "HEAD" },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch last activity");
      }
      const lastModified = response.headers.get("Last-Modified");
      return lastModified ? new Date(lastModified) : undefined;
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

      const response = await api.fetch(
        `/users/${ownerId}/documents/${chatId}/messages${sinceId ? "?" + new URLSearchParams({ sinceId }) : ""}`,
        {
          method: "GET",
          headers,
        },
      );
      if (!response.ok) {
        throw new Error("Failed to receive messages");
      }
      return response.json();
    },
  };
}
export type MessageRepository = ReturnType<typeof createMessageRepository>;

// The own server - every existing caller keeps using this.
export const messageRepository = createMessageRepository(localApiClient);
