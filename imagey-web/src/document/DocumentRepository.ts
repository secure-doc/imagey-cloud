import { cryptoService } from "../authentication/CryptoService";
import EncryptedDocumentMetadata from "./EncryptedDocumentMetadata";

export const documentRepository = {
  uploadDocument: async (
    email: string,
    folderId: string,
    folderContent: ArrayBuffer,
    documentId: string,
    documentContent: ArrayBuffer,
    sharedKey: {
      issuer: string;
      kid: string;
      sharedKey: string;
    },
    files: { filename: string; buffer: ArrayBuffer }[],
  ): Promise<string> => {
    const formData = new FormData();
    formData.append("folderId", folderId);
    formData.append(
      "folder",
      new Blob([folderContent], { type: "application/octet-stream" }),
    );
    formData.append("documentId", documentId);
    formData.append(
      "document",
      new Blob([documentContent], { type: "application/octet-stream" }),
    );
    formData.append(
      "key",
      new Blob([cryptoService.base64ToArrayBuffer(sharedKey.sharedKey)], {
        type: "application/octet-stream",
      }),
      "key",
    );
    for (const file of files) {
      formData.append(
        "files",
        new Blob([file.buffer], { type: "application/octet-stream" }),
        file.filename,
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

  loadDocument: async (
    email: string,
    documentId: string,
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    const url = `/users/${email}/documents/${documentId}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
      },
      credentials: "same-origin",
    });
    return resolve(response, async () => {
      const content = await response.arrayBuffer();
      const etag = response.headers.get("ETag");
      return { content, etag };
    });
  },

  loadDocumentMetadata: async (
    email: string,
    documentId: string,
    folderId?: string,
  ): Promise<{ metadata: EncryptedDocumentMetadata; etag: string | null }> => {
    /*
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
    });*/
    return Promise.reject();
  },

  updateDocumentMetadata: async (
    email: string,
    documentId: string,
    metadata: ArrayBuffer,
    etag?: string,
  ): Promise<void> => {
    /*
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
	*/
    return Promise.reject();
  },

  loadDocuments: async (
    email: string,
    folderId?: string,
  ): Promise<EncryptedDocumentMetadata[]> => {
    /*
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
	*/
  },

  loadKey: async (
    email: string,
    documentId: string,
    kid: string,
  ): Promise<{
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  }> => {
    const targetKid = kid ?? email;
    const response = await fetch(
      "/users/" + email + "/documents/" + documentId + "/keys/" + targetKid,
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
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    const path = `/users/${email}/documents/${documentId}/files/${contentId}`;
    const response = await fetch(path, {
      method: "GET",
      headers: {
        Accept: "application/octet-stream",
      },
      credentials: "same-origin",
      cache: "no-cache",
    });
    const content = await resolve(response, () => response.arrayBuffer());
    return { content, etag: response.headers.get("ETag") };
  },

  storeSharedKey: async (
    email: string,
    documentId: string,
    shareEmail: string,
    key: { issuer: string; kid: string; sharedKey: string },
  ): Promise<void> => {
    /*
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
	*/
    return Promise.reject();
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
