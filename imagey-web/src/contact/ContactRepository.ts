import { authenticationRepository } from "../authentication/AuthenticationRepository";
import { cryptoService } from "../authentication/CryptoService";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
import { Contact } from "./Contact";
import { ContactRequest } from "./ContactRequest";

export const contactRepository = {
  sendContactRequest: async (
    senderEmail: string,
    addresseeEmail: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + senderEmail + "/contact-requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ email: addresseeEmail }),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to send contact request");
    }
  },
  getContactRequests: async (userEmail: string): Promise<ContactRequest[]> => {
    const response = await fetch("/users/" + userEmail + "/contact-requests", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Failed to get contact requests");
    }
    const emails: string[] = await response.json();
    return emails.map((email) => ({ email }));
  },
  acceptContactRequest: async (
    userEmail: string,
    contactEmail: string,
    mainKeyPair: JsonWebKeyPair,
  ): Promise<void> => {
    try {
      const contactPublicKey =
        await authenticationRepository.loadPublicMainKey(contactEmail);
      console.log("Loaded public key", contactPublicKey);
      const sharedKey = await cryptoService.generateSymmetricKey();
      console.log("Generated shared key", sharedKey);

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
      console.log(
        "Encrypted shared keys",
        contactEncryptedSharedKey,
        myEncryptedSharedKey,
      );

      const contactKeys = {
        key: myEncryptedSharedKey,
        invitationKey: contactEncryptedSharedKey,
      };

      const response = await fetch(
        "/users/" + userEmail + "/contacts/" + contactEmail,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify(contactKeys),
        },
      );
      if (!response.ok) {
        throw new Error("Failed to accept contact request");
      }
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
  declineContactRequest: async (
    userEmail: string,
    contactEmail: string,
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + userEmail + "/contact-requests/" + contactEmail,
      {
        method: "DELETE",
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      throw new Error("Failed to decline contact request");
    }
  },
  getContacts: async (userEmail: string): Promise<Contact[]> => {
    const response = await fetch("/users/" + userEmail + "/contacts", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    if (!response.ok) {
      throw new Error("Failed to get contact requests");
    }
    const emails: string[] = await response.json();
    return emails.map((email) => ({ email }));
  },
  getSharedContactKeys: async (
    userEmail: string,
    contactEmail: string,
  ): Promise<{ key: string; invitationKey: string }> => {
    const response = await fetch(
      `/users/${userEmail}/contacts/${contactEmail}/key`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    );
    if (!response.ok) {
      throw new Error("Failed to get shared contact key");
    }
    return response.json();
  },
  updateContactKey: async (
    userEmail: string,
    contactEmail: string,
    contactKey: string,
  ) => {
    const response = await fetch(
      `/users/${userEmail}/contacts/${contactEmail}/key`,
      {
        method: "PUT",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          key: contactKey,
        }),
      },
    );
    if (!response.ok) {
      throw new Error("Failed to store shared contact key");
    }
  },
};
