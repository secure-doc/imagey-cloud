import { cryptoService } from "../authentication/CryptoService";
import { messageRepository } from "./MessageRepository";
import { Message } from "./Message";

export const messageService = {
  receiveDecryptedMessages: async (
    userEmail: string,
    ownerEmail: string,
    chatId: string,
    sinceId: string | undefined,
    sharedKey: JsonWebKey,
    wait?: number,
  ): Promise<Message[]> => {
    const newMessages = await messageRepository.receiveMessages(
      ownerEmail,
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
        isMine: m.sender === userEmail,
      })),
    );
  },

  sendEncryptedMessage: async (
    userEmail: string,
    ownerEmail: string,
    chatId: string,
    content: string,
    sharedKey: JsonWebKey,
  ): Promise<Message> => {
    const encryptedContent = await cryptoService.encryptMessage(
      content,
      sharedKey,
    );
    const id = await messageRepository.sendMessage(
      ownerEmail,
      chatId,
      encryptedContent,
    );

    return {
      id: id,
      sender: userEmail,
      content: content,
    };
  },
};
