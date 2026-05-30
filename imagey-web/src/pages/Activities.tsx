import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
//import { useActionIcons } from "../contexts/ActionBarContext";
//import FileChooser from "../components/FileChooser";
import { Activity } from "../activity/Activity";
import ActivityPanel from "../activity/ActivityPanel";
import { activityService } from "../activity/ActivityService";
import { contactRepository } from "../contact/ContactRepository";
import { Contact } from "../contact/Contact";
import { ActivityType } from "../activity/Activity";

export default function Activities() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const keyPair = authentication.keyPairs.mainKeyPair;

  const [activities, setActivities] = useState<Activity[]>();
  const [contacts, setContacts] = useState<Contact[]>();

  useEffect(() => {
    activityService
      .getActivities(user, keyPair)
      .then((activities) => setActivities(activities))
      .catch((e) => console.error("Failed to fetch activities", e));
    contactRepository
      .getContacts(user)
      .then((contacts) => setContacts(contacts))
      .catch((e) => console.error("Failed to fetch contacts", e));
  }, [user, keyPair]);

  return (
    <main
      className="grid"
      style={{
        alignContent: "flex-start",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
      }}
    >
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
