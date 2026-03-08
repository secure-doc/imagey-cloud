import { Activity, ActivityType } from "./Activity";
import ImagePanel from "./ImagePanel";
import InvitationPanel from "./InvitationPanel";
import UploadPanel from "./UploadPanel";

export default function ActivityPanel({
  className,
  activity,
  onActivityHandled,
}: {
  className?: string;
  activity: Activity;
  onActivityHandled: () => void;
}) {
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
      return <UploadPanel className={className} />;
    default:
      return <></>;
  }
}
