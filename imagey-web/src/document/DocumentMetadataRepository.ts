import DocumentMetadata from "./DocumentMetadata";

export const documentMetadataRepository = {
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
