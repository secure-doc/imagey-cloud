import { Message } from "./Message";

export const messageRepository = {
  sendMessage: async (
    senderId: string,
    contactId: string,
    encryptedContent: string,
  ): Promise<string> => {
    const response = await fetch(
      `/users/${senderId}/contacts/${contactId}/messages`,
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
    receiverId: string,
    senderId: string,
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
      `/users/${receiverId}/contacts/${senderId}/messages${sinceId ? "?" + new URLSearchParams({ sinceId }) : ""}`,
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
