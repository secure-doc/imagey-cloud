import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { UserId } from "../authentication/UserId";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
import { ContactKeys } from "./Contact";
import { contactRepository } from "./ContactRepository";

export const contactService = {
  acceptContactRequest: async (
    userId: UserId,
    contactId: UserId,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<void> => {
    try {
      const contactPublicKey =
        await authenticationRepository.loadPublicMainKey(contactId);
      const sharedKey = await cryptoService.generateSymmetricKey();

      const contactEncryptedSharedKey = await cryptoService.encryptKey(
        sharedKey,
        contactPublicKey,
        mainKeyPair.privateKey,
      );
      const myEncryptedSharedKey = await cryptoService.encryptKey(
        sharedKey,
        mainKeyPair.publicKey,
        mainKeyPair.privateKey,
      );

      const contactKeys: ContactKeys = {
        userKey: {
          issuer: userId,
          kid: "0",
          sharedKey: myEncryptedSharedKey,
        },
        contactKey: {
          issuer: contactId,
          kid: "0",
          sharedKey: contactEncryptedSharedKey,
        },
      };

      await contactRepository.acceptContactRequest(
        userId,
        contactId,
        contactKeys,
      );
    } catch (e) {
      console.error(
        "Error in acceptContactRequest",
        typeof e,
        e,
        e instanceof Error ? e.stack : "",
      );
      throw e;
    }
  },
  loadSharedKey: async (
    userId: UserId,
    contactId: UserId,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const myKeyEntry = await contactRepository.getSharedContactKey(
      userId,
      contactId,
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
          await authenticationRepository.loadPublicMainKey(contactId);
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
    userId: UserId,
    contactId: UserId,
    publicKey: JsonWebKey,
    privateKey: JsonWebKey,
  ): Promise<JsonWebKey> => {
    const contactPublicKey =
      await authenticationRepository.loadPublicMainKey(contactId);
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
    await contactRepository.reissueContactKey(userId, contactId, {
      userKey: {
        issuer: userId,
        kid: "0",
        sharedKey: myEncryptedSharedKey,
      },
      contactKey: {
        issuer: contactId,
        kid: "0",
        sharedKey: contactEncryptedSharedKey,
      },
    });
    return sharedKey;
  },
};
