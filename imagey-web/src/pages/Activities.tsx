import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
//import { useActionIcons } from "../contexts/ActionBarContext";
//import FileChooser from "../components/FileChooser";
import { Activity, ActivityType } from "../activity/Activity";
import ActivityPanel from "../activity/ActivityPanel";
import { activityService } from "../activity/ActivityService";

export default function Activities() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const keyPair = authentication.keyPairs.mainKeyPair;

  const [activities, setActivities] = useState<Activity[]>();

  /*
  useActionIcons([
    <FileChooser
      key="add-image"
      multiple
      onFilesSelected={(files) => setSelectedFiles(files)}
    />,
  ]);
  */

  useEffect(() => {
    activityService
      .getActivities(user, keyPair)
      .then((activities) => setActivities(activities));
  }, [user, keyPair]);

  return (
    <main className="grid">
      {activities ? (
        activities.map((activity, index) => (
          <ActivityPanel
            key={index}
            className="s12 m6 l3"
            activity={activity}
            onActivityHandled={() =>
              setActivities((activities) =>
                activities?.filter((a) => a !== activity),
              )
            }
          />
        ))
      ) : (
        <p>{t("Loading activities...")}</p>
      )}
    </main>
  );
}
