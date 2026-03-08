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
    user: string,
    keyPair: JsonWebKeyPair,
  ): Promise<Activity[]> => {
    const contactRequests = await contactRepository.getContactRequests(user);
    const images = await documentService.loadDocuments(
      user,
      keyPair.publicKey,
      keyPair.privateKey,
    );

    const activities: Activity[] = [
      ...contactRequests.map(
        (request): InvitationActivity => ({
          type: ActivityType.INVITATION,
          userName: request.email,
        }),
      ),
      ...images.map(
        (image): ImageActivity => ({
          type: ActivityType.IMAGE,
          image: image,
        }),
      ),
    ];

    if (activities.length === 0) {
      return [{ type: ActivityType.UPLOAD }];
    }
    return activities;
  },
};
