import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { contactRepository } from "./ContactRepository";

export const contactService = {
  loadSharedKey: async (
    userEmail: string,
    contactEmail: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const encryptedKeys = await contactRepository.getSharedContactKeys(
      userEmail,
      contactEmail,
    );
    let decryptedKey;

    if (encryptedKeys.invitationKey) {
      const contactPublicKey =
        await authenticationRepository.loadPublicMainKey(contactEmail);
      decryptedKey = await cryptoService.decryptKey(
        encryptedKeys.invitationKey,
        contactPublicKey,
        privateKey,
      );
      const encryptedKey = await cryptoService.encryptKey(
        decryptedKey,
        publicKey,
        privateKey,
      );
      await contactRepository.updateContactKey(
        userEmail,
        contactEmail,
        encryptedKey,
      );
    } else {
      decryptedKey = await cryptoService.decryptKey(
        encryptedKeys.key,
        publicKey,
        privateKey,
      );
    }

    return decryptedKey;
  },
};
