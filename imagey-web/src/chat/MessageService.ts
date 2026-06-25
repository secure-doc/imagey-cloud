import { cryptoService } from "../authentication/CryptoService";
import { messageRepository } from "./MessageRepository";
import { Message } from "./Message";

export const messageService = {
  receiveDecryptedMessages: async (
    userEmail: string,
    contactEmail: string,
    sinceId: string | undefined,
    sharedKey: JsonWebKey,
    wait?: number,
  ): Promise<Message[]> => {
    const newMessages = await messageRepository.receiveMessages(
      userEmail,
      contactEmail,
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
    contactEmail: string,
    content: string,
    sharedKey: JsonWebKey,
  ): Promise<Message> => {
    const encryptedContent = await cryptoService.encryptMessage(
      content,
      sharedKey,
    );
    await messageRepository.sendMessage(
      userEmail,
      contactEmail,
      encryptedContent,
    );

    return {
      id: Date.now().toString() + "-" + Math.random().toString(),
      sender: userEmail,
      content: content,
    };
  },
};
