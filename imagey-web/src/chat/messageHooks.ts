import { useCallback, useEffect, useMemo, useState } from "react";
import { Message } from "./Message";
import { messageService } from "./MessageService";
import { messageRepository } from "./MessageRepository";

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

  // A sent message can already have arrived via the running long poll before
  // the POST response does - append it only if polling hasn't added it yet.
  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) =>
      prev?.some((m) => m.id === message.id)
        ? prev
        : [...(prev ?? []), message],
    );
  }, []);

  return { messages, appendMessage };
}

// The newest message of the open chat as a ChatsList `liveActivity` (see
// Chats.tsx), so the list follows sent and polled messages.
export function useLiveActivity(
  chatId: string | undefined,
  messages: Message[] | undefined,
): { chatId: string; date: Date } | undefined {
  const timestamp = messages?.[messages.length - 1]?.timestamp;
  return useMemo(
    () =>
      chatId && timestamp ? { chatId, date: new Date(timestamp) } : undefined,
    [chatId, timestamp],
  );
}

// The time of a chat's newest message for the chat list (ADR 0021) - loaded
// once. undefined while loading, for a chat without messages and on failure
// (the list then simply shows no date).
export function useLastActivity(
  ownerId: string,
  chatId: string,
): Date | undefined {
  const [lastActivity, setLastActivity] = useState<Date>();
  useEffect(() => {
    let mounted = true;
    messageRepository
      .fetchLastActivity(ownerId, chatId)
      .then((date) => mounted && setLastActivity(date))
      .catch((e) => console.warn("Failed to load the last activity", e));
    return () => {
      mounted = false;
    };
  }, [ownerId, chatId]);
  return lastActivity;
}
