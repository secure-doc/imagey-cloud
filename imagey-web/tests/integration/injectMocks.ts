import { TestData } from "./testdata";
import { mockDocuments } from "./mockDocuments";

const users = ["mary", "alice", "laura", "bill"] as const;

for (const user of users) {
  const mockDocs = mockDocuments[user];
  if (!mockDocs) continue;

  const userData = TestData[user];
  if (user !== "mary") {
    userData.documents.push({
      documentId: "68980188-577d-4d2f-9e36-a6b32b25cd3a",
      name: "root",
      metadata: mockDocs.rootFolder.metadata,
    });

    userData.documents.push({
      documentId: "profile",
      name: "profile.json",
      metadata: mockDocs.profile.metadata,
    });

    userData.documents.push({
      documentId: "profile-pic-doc-id",
      name: "profile.jpg",
      metadata: mockDocs.profilePic.metadata,
    });
  }
}
