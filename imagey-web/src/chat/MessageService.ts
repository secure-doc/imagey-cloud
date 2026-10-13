import { cryptoService } from "../authentication/CryptoService";
import { MessageRepository, messageRepository } from "./MessageRepository";
import { Message } from "./Message";

export type MessageService = ReturnType<typeof createMessageService>;

// One service per server (see createDocumentService).
export function createMessageService(messages: MessageRepository) {
  return {
    receiveDecryptedMessages: async (
      userId: string,
      ownerId: string,
      chatId: string,
      sinceId: string | undefined,
      sharedKey: JsonWebKey,
      wait?: number,
    ): Promise<Message[]> => {
      const newMessages = await messages.receiveMessages(
        ownerId,
        chatId,
        sinceId,
        wait,
      );

      if (!newMessages || newMessages.length === 0) {
        return [];
      }

      return await Promise.all(
        newMessages.map(async (m) => ({
          id: m.id,
          sender: m.sender,
          content: await cryptoService.decryptMessage(m.content, sharedKey),
          timestamp: m.timestamp,
          isMine: m.sender === userId,
        })),
      );
    },

    sendEncryptedMessage: async (
      userId: string,
      ownerId: string,
      chatId: string,
      content: string,
      sharedKey: JsonWebKey,
      notify: string[] = [],
    ): Promise<Message> => {
      const encryptedContent = await cryptoService.encryptMessage(
        content,
        sharedKey,
      );
      const { id, timestamp } = await messages.sendMessage(
        ownerId,
        chatId,
        encryptedContent,
        notify,
      );

      return {
        id: id,
        sender: userId,
        content: content,
        timestamp,
      };
    },
  };
}

export const messageService = createMessageService(messageRepository);
