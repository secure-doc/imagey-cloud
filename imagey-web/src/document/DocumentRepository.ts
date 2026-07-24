import { cryptoService } from "../authentication/CryptoService";
import EncryptedDocumentMetadata from "./EncryptedDocumentMetadata";

const cache: Map<string, ArrayBuffer> = new Map();

export const documentRepository = {
  uploadDocument: async (
    email: string,
    metadata: ArrayBuffer,
    sharedKey: {
      issuerType?: string;
      issuer: string;
      kid: string;
      sharedKey: string;
    },
    content: ArrayBuffer[],
  ): Promise<string> => {
    const formData = new FormData();
    formData.append(
      "metadata",
      new Blob([metadata], { type: "application/octet-stream" }),
    );
    formData.append(
      "key",
      new Blob([cryptoService.base64ToArrayBuffer(sharedKey.sharedKey)], {
        type: "application/octet-stream",
      }),
      "key",
    );
    formData.append("issuer", sharedKey.issuer);
    if (content.length > 0) {
      formData.append(
        "content",
        new Blob([content[0]], { type: "application/octet-stream" }),
        "content",
      );
    }
    if (content.length > 1) {
      formData.append(
        "smallImage",
        new Blob([content[1]], { type: "application/octet-stream" }),
        "smallImage",
      );
    }
    if (content.length > 2) {
      formData.append(
        "previewImage",
        new Blob([content[2]], { type: "application/octet-stream" }),
        "previewImage",
      );
    }

    const response = await fetch(`/users/${email}/documents`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });
    return resolve(response, () => {
      const location = response.headers.get("Location");
      if (!location) throw new Error("No location header");
      return Promise.resolve(location.substring(location.lastIndexOf("/") + 1));
    });
  },

  loadDocumentMetadata: async (
    email: string,
    documentId: string,
    folderId?: string,
  ): Promise<{ metadata: EncryptedDocumentMetadata; etag: string | null }> => {
    let url = `/users/${email}/documents/${documentId}`;
    if (folderId) {
      url += "?folderId=" + encodeURIComponent(folderId);
    }
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });
    return resolve(response, async () => {
      const metadata = await response.json();
      const etag = response.headers.get("ETag");
      return { metadata, etag };
    });
  },

  updateDocumentMetadata: async (
    email: string,
    documentId: string,
    metadata: ArrayBuffer,
    etag?: string,
  ): Promise<void> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
    };
    if (etag) {
      headers["If-Match"] = etag;
    }

    const response = await fetch(`/users/${email}/documents/${documentId}`, {
      method: "PUT",
      headers,
      credentials: "same-origin",
      body: metadata,
    });
    return resolve(response, () => Promise.resolve());
  },

  loadDocuments: async (
    email: string,
    folderId?: string,
  ): Promise<EncryptedDocumentMetadata[]> => {
    let url = "/users/" + email + "/documents";
    if (folderId) {
      url += "?folderId=" + encodeURIComponent(folderId);
    }
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
      cache: "no-cache",
    });
    return resolve(response, () => response.json());
  },

  loadKey: async (
    email: string,
    documentId: string,
    shareEmail?: string,
  ): Promise<{
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  }> => {
    const targetEmail = shareEmail ?? email;
    console.error(
      "CALLED LOAD KEY FOR",
      email,
      documentId,
      targetEmail,
      new Error().stack,
    );
    const response = await fetch(
      "/users/" + email + "/documents/" + documentId + "/keys/" + targetEmail,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
        cache: "no-cache",
      },
    );
    return resolve(response, () => response.json());
  },
  loadContent: async (
    email: string,
    documentId: string,
    contentId: string,
    noCache?: boolean,
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    const path = `/users/${email}/documents/${documentId}/files/${contentId}`;
    if (!noCache) {
      const cachedValue = cache.get(path);
      if (cachedValue) {
        return { content: cachedValue, etag: null };
      }
    }
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
      },
      credentials: "same-origin",
      cache: "no-cache",
    });
    const content = await resolve(response, () => response.arrayBuffer());
    if (!noCache) {
      cache.set(path, content);
    }
    return { content, etag: response.headers.get("ETag") };
  },

  storeSharedKey: async (
    email: string,
    documentId: string,
    shareEmail: string,
    key: { issuer: string; kid: string; sharedKey: string },
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + email + "/documents/" + documentId + "/keys/" + shareEmail,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(key),
        credentials: "same-origin",
      },
    );
    return resolve(response, () => Promise.resolve());
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
