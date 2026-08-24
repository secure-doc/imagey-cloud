import { UserId } from "../authentication/UserId";
import { contactRepository } from "../contact/ContactRepository";
import DocumentMetadata from "../document/DocumentMetadata";
import { documentService } from "../document/DocumentService";
import {
  Activity,
  ActivityType,
  ImageActivity,
  InvitationActivity,
} from "./Activity";

export const activityService = {
  getActivities: async (
    user: UserId,
    settingsKey: JsonWebKey,
    documentsId: string,
  ): Promise<Activity[]> => {
    const contactRequests = await contactRepository.getContactRequests(user);
    const rootFolder = await documentService.loadDocument(
      user,
      documentsId,
      user,
      settingsKey,
    );
    let documents: DocumentMetadata[] = [];
    if (rootFolder.documents && rootFolder.key) {
      const rootFolderKey = rootFolder.key;
      documents = await Promise.all(
        rootFolder.documents.map(async (documentId) => {
          const doc = await documentService.loadDocument(
            user,
            documentId,
            documentsId,
            rootFolderKey,
          );
          console.log(
            "key in activityService.getActivities: " + JSON.stringify(doc.key),
          );
          return doc;
        }),
      );
    }
    const activities: Activity[] = [
      ...contactRequests.map(
        (request): InvitationActivity => ({
          id: `invitation-${request.userId}`,
          type: ActivityType.INVITATION,
          userId: request.userId,
        }),
      ),
      ...documents.map(
        (image): ImageActivity => ({
          id: `image-${image.documentId}`,
          type: ActivityType.IMAGE,
          image: image,
        }),
      ),
    ];

    if (activities.length === 0) {
      return [{ id: "upload", type: ActivityType.UPLOAD }];
    }
    return activities;
  },
};
