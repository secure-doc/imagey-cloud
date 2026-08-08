import { UserId } from "../authentication/UserId";
import { contactRepository } from "../contact/ContactRepository";
import { Settings } from "../contexts/AuthenticationContext";
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
    settings: Settings,
  ): Promise<Activity[]> => {
    const contactRequests = await contactRepository.getContactRequests(user);
    const rootFolder = await documentService.loadDocument(
      user,
      settings.documents,
	  user,
      settings.settingsKey,
    );
    const images = await documentService.loadDocuments(
      user,
      rootFolder.documents || [],
      rootFolder.documentId,
      rootFolder.key!,
    );

    const activities: Activity[] = [
      ...contactRequests
        .filter((req) => req.invitee === user && req.sharedKey == null)
        .map(
          (request): InvitationActivity => ({
            id: `invitation-${request.inviter}`,
            type: ActivityType.INVITATION,
            userId: request.inviter,
          }),
        ),
      ...images.map(
        (image): ImageActivity => ({
          id: `image-${image.documentId}`,
          type: ActivityType.IMAGE,
          image: image,
          folderId: rootFolder.documentId,
        }),
      ),
    ];

    if (activities.length === 0) {
      return [{ id: "upload", type: ActivityType.UPLOAD }];
    }
    return activities;
  },
};
