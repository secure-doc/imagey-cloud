import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { Activity } from "../activity/Activity";
import ActivityPanel from "../activity/ActivityPanel";
import { activityService } from "../activity/ActivityService";
import { documentService } from "../document/DocumentService";
import { useReloadableLoad } from "../hooks/useReloadableLoad";
import { Contact } from "../contact/Contact";
import { ActivityType } from "../activity/Activity";
import {
  useChatsId,
  useDocumentsId,
  useSettingsKey,
} from "../contexts/SettingsContext";

export default function Activities() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;

  const [activities, setActivities] = useState<Activity[]>();
  const [contacts, setContacts] = useState<Contact[]>();
  const settingsKey = useSettingsKey();
  const documentsId = useDocumentsId();
  const chatsId = useChatsId();

  const { failed: loadFailed } = useReloadableLoad(async () => {
    activityService
      .getActivities(user, settingsKey, documentsId)
      .then((activities) => setActivities(activities))
      .catch((e) => console.error("Failed to fetch activities", e));
    // Contacts now live inside the (also encrypted) "chats" document,
    // same as on the Chats page, instead of a dedicated /contacts endpoint.
    const chatsDocument = await documentService.loadDocument(
      user,
      chatsId,
      user,
      settingsKey,
    );
    if (chatsDocument.loadFailed) {
      console.error("Failed to load chats document");
      return false;
    }
    setContacts(chatsDocument.contacts ?? []);
    return true;
  }, [user, settingsKey, documentsId, chatsId]);

  return (
    <main
      className="grid"
      style={{
        alignContent: "flex-start",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))",
      }}
    >
      {loadFailed && <p>{t("Could not load your activities. Retrying...")}</p>}
      {contacts && contacts.length === 0 && (
        <ActivityPanel
          key="no-contacts"
          activity={{ id: "no-contacts", type: ActivityType.NO_CONTACTS }}
          onActivityHandled={() => {}}
        />
      )}
      {activities ? (
        activities.map((activity) => {
          return (
            <ActivityPanel
              key={activity.id}
              activity={activity}
              onActivityHandled={() =>
                setActivities((activities) =>
                  activities?.filter((a) => a !== activity),
                )
              }
            />
          );
        })
      ) : (
        <p>{t("Loading activities...")}</p>
      )}
    </main>
  );
}
