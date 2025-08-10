import DocumentMetadata from "./DocumentMetadata";

export const documentRepository = {
  createDocument: async (
    email: string,
    metadata: DocumentMetadata,
    content: ArrayBuffer[],
  ) => {
    let response = await fetch(
      "/users/" +
        email +
        "/documents/" +
        metadata.documentId +
        "/contents/" +
        metadata.documentId,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        credentials: "same-origin",
        body: content[0],
      },
    );
    if (response.status < 400 && metadata.smallImageId) {
      response = await fetch(
        "/users/" +
          email +
          "/documents/" +
          metadata.documentId +
          "/contents/" +
          metadata.smallImageId,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          credentials: "same-origin",
          body: content[1],
        },
      );
    }
    if (response.status < 400 && metadata.previewImageId) {
      response = await fetch(
        "/users/" +
          email +
          "/documents/" +
          metadata.documentId +
          "/contents/" +
          metadata.previewImageId,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          credentials: "same-origin",
          body: content[2],
        },
      );
    }
    return resolve(response, () => Promise.resolve());
  },

  loadDocuments: async (email: string): Promise<DocumentMetadata[]> => {
    const response = await fetch("/users/" + email + "/documents", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    return resolve(response, () => response.json());
  },

  loadKey: async (email: string, documentId: string): Promise<string> => {
    const response = await fetch(
      "/users/" +
        email +
        "/documents/" +
        documentId +
        "/encrypted-shared-keys/" +
        email,
      {
        method: "GET",
        headers: {
          Accept: "text/plain",
        },
        credentials: "same-origin",
      },
    );
    return resolve(response, () => response.text());
  },
  storeKey: async (email: string, documentId: string, key: string) => {
    const response = await fetch(
      "/users/" +
        email +
        "/documents/" +
        documentId +
        "/encrypted-shared-keys/" +
        email,
      {
        method: "PUT",
        headers: {
          "Content-Type": "text/plain",
        },
        credentials: "same-origin",
        body: key,
      },
    );
    return resolve(response, () => Promise.resolve());
  },
  loadContent: async (
    email: string,
    documentId: string,
    contentId: string,
  ): Promise<ArrayBuffer> => {
    const response = await fetch(
      "/users/" + email + "/documents/" + documentId + "/contents/" + contentId,
      {
        method: "GET",
        headers: {
          Accept: "application/octet-stream",
        },
        credentials: "same-origin",
      },
    );
    return resolve(response, () => response.arrayBuffer());
  },
};

async function resolve<T>(
  response: Response,
  result: () => Promise<T>,
): Promise<T> {
  if (response.status >= 400) {
    return Promise.reject();
  }
  return result();
}
