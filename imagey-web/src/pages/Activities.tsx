import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useAuthentication } from "../contexts/AuthenticationContext";
//import { useActionIcons } from "../contexts/ActionBarContext";
//import FileChooser from "../components/FileChooser";
import { documentService } from "../document/DocumentService";
import { Activity } from "../activity/Activity";
import ActivityPanel from "../activity/ActivityPanel";
import { activityService } from "../activity/ActivityService";

export default function Activities() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const keyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = keyPair.publicKey;
  const privateMainKey = keyPair.privateKey;

  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>();
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
    if (user && selectedFiles) {
      for (const file of selectedFiles) {
        documentService
          .storeDocument(user, file, publicMainKey, privateMainKey)
          .then(() => {
            activityService
              .getActivities(user, keyPair)
              .then((newActivities) => setActivities(newActivities));
          });
      }
      setSelectedFiles(undefined);
    }
  }, [user, selectedFiles, publicMainKey, privateMainKey, keyPair]);

  useEffect(() => {
    activityService
      .getActivities(user, keyPair)
      .then((activities) => setActivities(activities));
  }, [user, keyPair]);
  return (
    <main className="grid">
      {activities ? (
        activities.map((activity) => (
          <ActivityPanel
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
