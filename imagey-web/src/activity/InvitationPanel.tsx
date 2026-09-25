import { useTranslation } from "react-i18next";
import Panel from "../components/Panel";
import { InvitationActivity } from "./Activity";
import Person from "../components/Person";
import AcceptInvitationButton from "../invitation/AcceptInvitationButton";
import DeclineInvitationButton from "../invitation/DeclineInvitationButton";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { contactDisplayName } from "../contact/contactDisplayName";
import { useInvitationInfo } from "../hooks/useInvitationInfo";

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
  const { request } = activity;
  const inviterInfo = useInvitationInfo(request);
  const inviterName = contactDisplayName(
    request.inviter,
    inviterInfo,
    t("Unknown contact"),
  );
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
          invitation={request}
          onAccepted={() => onActivityHandled()}
        />,
        <DeclineInvitationButton
          key="decline"
          user={user}
          contact={request.inviter}
          onDeclined={() => onActivityHandled()}
        />,
      ]}
    >
      <p className="center-align">
        {t("{{user}} whants to connect with you.", { user: inviterName })}
      </p>
      {inviterInfo.email && inviterInfo.email !== inviterName && (
        <p className="center-align small-text">{inviterInfo.email}</p>
      )}
    </Panel>
  );
}
