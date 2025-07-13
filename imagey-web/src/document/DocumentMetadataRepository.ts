import DocumentMetadata from "./DocumentMetadata";

export const documentMetadataRepository = {
  findDocumentMetadata: async (
    email: string,
    documentId: string,
  ): Promise<DocumentMetadata> => {
    const response = await fetch(
      "/users/" + email + "/documents/" + documentId + "/meta-data",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "same-origin",
      },
    );
    return response.status >= 200 && response.status <= 300
      ? await response.json()
      : Promise.reject();
  },
  createDocumentMetadata: async (
    email: string,
    documentMetadata: DocumentMetadata,
  ) => {
    const response = await fetch(
      "/users/" +
        email +
        "/documents/" +
        documentMetadata.documentId +
        "/meta-data",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(documentMetadata),
      },
    );
    await resolve(response);
  },
};

async function resolve(response: Response): Promise<Response> {
  return response.status >= 200 && response.status <= 300
    ? Promise.resolve(response)
    : response.status === 409
      ? Promise.reject("already existing")
      : Promise.reject();
}
