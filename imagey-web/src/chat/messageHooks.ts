import { useEffect, useState } from "react";
import { Message } from "./Message";
import { messageService } from "./MessageService";

export function usePolling(
  userEmail: string,
  contactEmail: string,
  sharedKey?: JsonWebKey,
) {
  const [messages, setMessages] = useState<Message[]>();

  useEffect(() => {
    let mounted = true;

    const pollMessages = async () => {
      if (!sharedKey) return;
      let sinceId: string | undefined = undefined;

      while (mounted) {
        try {
          const newMessages = await messageService.receiveDecryptedMessages(
            userEmail,
            contactEmail,
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
  }, [userEmail, contactEmail, sharedKey]);

  return { messages, setMessages };
}
