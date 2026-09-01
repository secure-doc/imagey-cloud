// Thrown when the server rejects a write because the ETag the client sent
// (If-Match on a PUT, folderETag in an upload) no longer matches - the
// resource was changed by someone else in the meantime. Callers doing a
// read-modify-write should re-read and retry.
export class PreconditionFailedError extends Error {
  constructor(message = "Precondition failed") {
    super(message);
    this.name = "PreconditionFailedError";
  }
}

export const documentRepository = {
  uploadDocument: async (
    userId: string,
    folderOwner: string,
    folderId: string,
    folderContent: ArrayBuffer,
    // The ETag the client last saw for the parent folder document. The server
    // rejects the upload with 412 (surfaced as PreconditionFailedError) if the
    // folder changed since - see documentService.storeDocument for the retry.
    folderETag: string | null,
    documentId: string,
    documentContent: ArrayBuffer,
    sharedKey: {
      issuer: string;
      kid: string;
      sharedKey: string;
    },
    files: { filename: string; buffer: ArrayBuffer }[],
  ): Promise<{ documentId: string; folderETag: string | null }> => {
    const formData = new FormData();
    // Mirrors the registration request (see AuthenticationRepository.register): one JSON
    // "metadata" part with every scalar value, plus the opaque encrypted blobs as their own
    // binary parts. The content type on the JSON blob is mandatory - a plain Blob defaults to
    // application/octet-stream, which CXF routes to the wrong MessageBodyReader.
    // `userId` is the caller (the new document lands in their tree); `folderOwner` is whose tree the
    // parent folder lives in - the same account when adding to one's own folder.
    formData.append(
      "metadata",
      new Blob(
        [
          JSON.stringify({
            folderOwner,
            folderId,
            ...(folderETag ? { folderETag } : {}),
            documentId,
            key: sharedKey,
          }),
        ],
        { type: "application/json" },
      ),
    );
    formData.append(
      "folder",
      new Blob([folderContent], { type: "application/octet-stream" }),
    );
    formData.append(
      "document",
      new Blob([documentContent], { type: "application/octet-stream" }),
    );
    for (const file of files) {
      formData.append(
        "files",
        new Blob([file.buffer], { type: "application/octet-stream" }),
        file.filename,
      );
    }

    const response = await fetch(`/users/${userId}/documents`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
      // The browser sets Content-Type (including the multipart boundary) itself.
    });
    if (response.status === 412) {
      throw new PreconditionFailedError("Folder changed during upload");
    }
    return resolve(response, () => {
      const location = response.headers.get("Location");
      if (!location) throw new Error("No location header");
      return Promise.resolve({
        documentId: location.substring(location.lastIndexOf("/") + 1),
        folderETag: response.headers.get("ETag"),
      });
    });
  },

  loadDocument: async (
    userId: string,
    documentId: string,
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    const url = `/users/${userId}/documents/${documentId}`;
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

  updateDocumentMetadata: async (
    userId: string,
    documentId: string,
    metadata: ArrayBuffer,
    etag?: string | null,
  ): Promise<string | null> => {
    const response = await fetch(`/users/${userId}/documents/${documentId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        ...(etag ? { "If-Match": etag } : {}),
      },
      credentials: "same-origin",
      body: metadata,
    });
    if (response.status === 412) {
      throw new PreconditionFailedError("Document changed since it was loaded");
    }
    // The server returns the new ETag so a follow-up save in the same session
    // can send a fresh If-Match instead of the now-stale one it was loaded with.
    return resolve(response, () =>
      Promise.resolve(response.headers.get("ETag")),
    );
  },

  storeContent: async (
    userId: string,
    documentId: string,
    contentId: string,
    content: ArrayBuffer,
  ): Promise<void> => {
    const response = await fetch(
      `/users/${userId}/documents/${documentId}/files/${contentId}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
        },
        credentials: "same-origin",
        body: content,
      },
    );
    return resolve(response, () => Promise.resolve());
  },

  loadKey: async (
    userId: string,
    documentId: string,
    kid: string,
  ): Promise<{
    issuerType?: string;
    issuer: string;
    kid: string;
    sharedKey: string;
  }> => {
    const targetKid = kid ?? userId;
    const response = await fetch(
      "/users/" + userId + "/documents/" + documentId + "/keys/" + targetKid,
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
    userId: string,
    documentId: string,
    contentId: string,
  ): Promise<{ content: ArrayBuffer; etag: string | null }> => {
    const path = `/users/${userId}/documents/${documentId}/files/${contentId}`;
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
    userId: string,
    documentId: string,
    key: { issuer: string; kid: string; sharedKey: string },
  ): Promise<void> => {
    const response = await fetch(
      "/users/" + userId + "/documents/" + documentId + "/keys",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(key),
        credentials: "same-origin",
      },
    );
    // Key slots are write-once server-side. A 409 means this contact's entry is
    // already filed (the document was shared into this chat before) - that is
    // the state we wanted, so treat it as success.
    if (response.status === 409) {
      return;
    }
    return resolve(response, () => Promise.resolve());
  },
};

async function resolve<T>(
  response: Response,
  result: () => Promise<T>,
): Promise<T> {
  // Any 4xx/5xx is an error here; 2xx/3xx (including the 201 that uploads
  // return) fall through to the caller-supplied result handler.
  if (response.status >= 400) {
    return Promise.reject(new Error("Http Error " + response.status));
  }
  return result();
}
