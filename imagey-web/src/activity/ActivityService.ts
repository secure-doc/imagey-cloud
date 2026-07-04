import { UserId } from "../authentication/UserId";
import { contactRepository } from "../contact/ContactRepository";
import { JsonWebKeyPair } from "../contexts/AuthenticationContext";
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
    keyPair: JsonWebKeyPair,
  ): Promise<Activity[]> => {
    const contactRequests = await contactRepository.getContactRequests(user);
    const rootFolder = await documentService.getRootFolder(
      user,
      keyPair.publicKey,
      keyPair.privateKey,
    );
    const images = await documentService.loadDocuments(
      user,
      keyPair.publicKey,
      keyPair.privateKey,
      rootFolder.documentId,
      rootFolder.key,
    );

    const activities: Activity[] = [
      ...contactRequests.map(
        (request): InvitationActivity => ({
          id: `invitation-${request.userId}`,
          type: ActivityType.INVITATION,
          userId: request.userId,
        }),
      ),
      ...images.map(
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
