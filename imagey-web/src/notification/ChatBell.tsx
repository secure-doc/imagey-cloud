import { useTranslation } from "react-i18next";
import { usePushEnabled } from "./usePushEnabled";

// The notification bell of a chat (ADR 0013 A8). Only shown if push is active on this device.
// A chat on another server (`chatOrigin`) cannot push here - the server of the chat does not
// know our devices - so its bell is struck through.
export function ChatBell({ chatOrigin }: { chatOrigin?: string }) {
  const { t } = useTranslation();
  const enabled = usePushEnabled();
  if (!enabled) {
    return null;
  }
  if (chatOrigin) {
    const label = t("No notifications for chats on {{host}}", {
      host: new URL(chatOrigin).host,
    });
    return (
      <i title={label} aria-label={label} role="img">
        notifications_off
      </i>
    );
  }
  return <i aria-hidden="true">notifications</i>;
}
