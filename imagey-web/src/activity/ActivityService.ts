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
    // Folders have no file content to show as an image activity (and no
    // previewImageId to load it from), and a failed-load placeholder has no
    // `type` - loadFolderChildren drops both, leaving only actual images.
    const documents: DocumentMetadata[] =
      await documentService.loadFolderChildren(
        user,
        documentsId,
        user,
        settingsKey,
      );
    // Only invitations addressed to us that we haven't acted on yet are
    // shown here - a request we've ACCEPTED (or that's since moved to
    // RECEIVED) is no longer ours to decide on.
    const activities: Activity[] = [
      ...contactRequests
        .filter(
          (request) => request.invitee === user && request.status === "INVITED",
        )
        .map(
          (request): InvitationActivity => ({
            id: `invitation-${request.inviter}`,
            type: ActivityType.INVITATION,
            userId: request.inviter,
            publicKey: request.publicKey,
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
