import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import { InvitationActivity } from "./Activity";
import Person from "../components/Person";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import { useAuthentication } from "../contexts/AuthenticationContext";

export default function InvitationPanel({
  className,
  activity,
  onActivityHandled,
}: {
  className?: string;
  activity: InvitationActivity;
  onActivityHandled: () => void;
}) {
  const { t } = useTranslation();
  const user = useAuthentication().user;
  return (
    <Panel
      className={className}
      title={t("Contact request")}
      image={
        <div className="row center-align">
          <Person size="100px" />
        </div>
      }
      actions={[
        <AcceptInvitationButton
          key="accept"
          user={user}
          contact={activity.userId}
          onAccepted={() => onActivityHandled()}
        />,
        <DeclineInvitationButton
          key="decline"
          user={user}
          contact={activity.userId}
          onDeclined={() => onActivityHandled()}
        />,
      ]}
    >
      <p className="center-align">
        {t("{{user}} whants to connect with you.", { user: activity.userId })}
      </p>
    </Panel>
  );
}
