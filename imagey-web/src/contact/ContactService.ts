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
    const myKeyEntry = await contactRepository.getSharedContactKey(
      userEmail,
      contactEmail,
    );
    if (!myKeyEntry) {
      throw new Error("Shared key not found");
    }

    try {
      return await cryptoService.decryptKey(
        myKeyEntry.sharedKey,
        publicKey,
        privateKey,
      );
    } catch (e) {
      console.warn("Decryption failed, attempting fallback", e);
      try {
        const contactPublicKey =
          await authenticationRepository.loadPublicMainKey(contactEmail);
        return await cryptoService.decryptKey(
          myKeyEntry.sharedKey,
          contactPublicKey,
          privateKey,
        );
      } catch (fallbackError) {
        console.error("Fallback decryption failed", fallbackError);
      }
    }

    throw new Error("Could not decrypt shared key");
  },
  reissueKey: async (
    userEmail: string,
    contactEmail: string,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const contactPublicKey =
      await authenticationRepository.loadPublicMainKey(contactEmail);
    const sharedKey = await cryptoService.generateSymmetricKey();
    const contactEncryptedSharedKey = await cryptoService.encryptKey(
      sharedKey,
      contactPublicKey,
      privateKey,
    );
    const myEncryptedSharedKey = await cryptoService.encryptKey(
      sharedKey,
      publicKey,
      privateKey,
    );
    await contactRepository.reissueContactKey(userEmail, contactEmail, {
      userKey: {
        issuer: userEmail,
        kid: "0",
        sharedKey: myEncryptedSharedKey,
      },
      contactKey: {
        issuer: contactEmail,
        kid: "0",
        sharedKey: contactEncryptedSharedKey,
      },
    });
    return sharedKey;
  },
};
