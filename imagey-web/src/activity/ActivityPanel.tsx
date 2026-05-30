import { useState, useEffect } from "react";
import { Activity, ActivityType } from "./Activity";
import ImagePanel from "./ImagePanel";
import InvitationPanel from "./InvitationPanel";
import UploadPanel from "./UploadPanel";

export default function ActivityPanel({
  className,
  activity: initialActivity,
  onActivityHandled,
}: {
  className?: string;
  activity: Activity;
  onActivityHandled: () => void;
}) {
  const [activity, setActivity] = useState<Activity>(initialActivity);

  useEffect(() => {
    setActivity(initialActivity);
  }, [initialActivity]);

  switch (activity.type) {
    case ActivityType.INVITATION:
      return (
        <InvitationPanel
          className={className}
          activity={activity}
          onActivityHandled={onActivityHandled}
        />
      );
    case ActivityType.IMAGE:
      return <ImagePanel className={className} activity={activity} />;
    case ActivityType.UPLOAD:
      return (
        <UploadPanel
          className={className}
          onUploadComplete={(document) =>
            setActivity({
              id: `image-${document.documentId}`,
              type: ActivityType.IMAGE,
              image: document,
            })
          }
        />
      );
    default:
      return <></>;
  }
}
