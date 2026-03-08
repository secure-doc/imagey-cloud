export const contactService = {
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
};
