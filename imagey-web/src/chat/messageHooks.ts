import { useEffect, useState } from "react";
import { Message } from "./Message";
import { messageService } from "./MessageService";

export function usePolling(
  userId: string,
  ownerId: string | undefined,
  chatId: string | undefined,
  sharedKey?: JsonWebKey,
) {
  const [messages, setMessages] = useState<Message[]>();

  // Drop the previous chat's messages as soon as the chat identity changes.
  // Polling restarts with sinceId=undefined and would otherwise merge the new
  // chat's history onto the old one (message ids never collide across chats),
  // leaking one contact's plaintext messages into another's thread.
  useEffect(() => {
    setMessages(undefined);
  }, [ownerId, chatId]);

  useEffect(() => {
    let mounted = true;

    const pollMessages = async () => {
      if (!sharedKey || !ownerId || !chatId) return;
      let sinceId: string | undefined = undefined;

      while (mounted) {
        try {
          const newMessages = await messageService.receiveDecryptedMessages(
            userId,
            ownerId,
            chatId,
            sinceId,
            sharedKey,
            sinceId === undefined ? 0 : 30, // wait=0 for initial load, wait=30 for long polling
          );

          if (newMessages.length > 0 && mounted) {
            setMessages((prev) => {
              const existingIds = new Set(prev?.map((p) => p.id) ?? []);
              const uniqueNew = newMessages.filter(
                (m) => !existingIds.has(m.id),
              );
              return [...(prev ?? []), ...uniqueNew];
            });
            sinceId = newMessages[newMessages.length - 1].id;
          } else {
            if (mounted) {
              setMessages((prev) => prev ?? []);
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
        } catch (e) {
          console.error(e);
          if (mounted) {
            setMessages((prev) => prev ?? []);
          }
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }
    };

    if (sharedKey) {
      pollMessages();
    }

    return () => {
      mounted = false;
    };
  }, [userId, ownerId, chatId, sharedKey]);

  return { messages, setMessages };
}
