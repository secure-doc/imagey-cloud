import DocumentMetadata from "./DocumentMetadata";

const cache: Map<string, ArrayBuffer> = new Map();

export const documentRepository = {
  uploadDocument: async (
    email: string,
    metadata: DocumentMetadata,
    sharedKey: string,
    content: ArrayBuffer[],
  ) => {
    if (content.length === 0) {
      throw new Error("content must be provided");
    }
    const formData = new FormData();
    formData.append("metadata", JSON.stringify(metadata));
    formData.append("sharedKey", sharedKey);
    formData.append(
      "content",
      new Blob([content[0]], { type: "application/octet-stream" }),
    );
    if (content.length > 1 && metadata.smallImageId) {
      formData.append(
        "smallImage",
        new Blob([content[1]], { type: "application/octet-stream" }),
      );
    }
    if (content.length > 2 && metadata.previewImageId) {
      formData.append(
        "previewImage",
        new Blob([content[2]], { type: "application/octet-stream" }),
      );
    }

    const response = await fetch(`/users/${email}/documents`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
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
    const path = `/users/${email}/documents/${documentId}/contents/${contentId}`;
    const cachedValue = cache.get(path);
    if (cachedValue) {
      return cachedValue;
    }
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
      },
      credentials: "same-origin",
    });
    const content = await resolve(response, () => response.arrayBuffer());
    cache.set(path, content);
    return content;
  },
};

async function resolve<T>(
  response: Response,
  result: () => Promise<T>,
): Promise<T> {
  if (response.status >= 400) {
    return Promise.reject(new Error("Http Error " + response.status));
  }
  return result();
}
