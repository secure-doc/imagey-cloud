import DocumentMetadata from "./DocumentMetadata";

export const documentRepository = {
  createDocument: async (
    email: string,
    metadata: DocumentMetadata,
    content: ArrayBuffer[],
  ) => {
    const response = await fetch(
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
    if (response.status >= 400) {
      return Promise.reject();
    }
    if (metadata.smallImageId) {
      const response = await fetch(
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
      if (response.status >= 400) {
        return Promise.reject();
      }
    }
    if (metadata.previewImageId) {
      const response = await fetch(
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
      if (response.status >= 400) {
        return Promise.reject();
      }
    }
  },

  loadDocuments: async (email: string): Promise<DocumentMetadata[]> => {
    const response = await fetch("/users/" + email + "/documents", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    if (response.status >= 400) {
      return Promise.reject();
    }
    return response.json();
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
    if (response.status >= 400) {
      return Promise.reject();
    }
    return response.text();
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
    if (response.status >= 400) {
      return Promise.reject();
    }
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
    if (response.status >= 400) {
      return Promise.reject();
    }
    return response.arrayBuffer();
  },
};
