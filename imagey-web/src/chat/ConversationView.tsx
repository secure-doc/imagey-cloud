import { ReactNode, useEffect, useRef } from "react";
import { Message } from "./Message";
import { SendMessageForm } from "./SendMessageForm";
import { SharedDocumentMessage } from "./SharedDocumentMessage";
import { parseMessageContent } from "./parseMessageContent";
import DocumentMetadata from "../document/DocumentMetadata";

export interface ConversationViewProps {
  userId: string;
  ownerId: string;
  chatId: string;
  sharedKey: JsonWebKey;
  messages: Message[];
  onMessageSent: (message: Message) => void;
  share: (document: DocumentMetadata) => Promise<void>;
  // The 1:1 chat's counterpart - passed through to SharedDocumentMessage so
  // it can open the image detail view. Omitted for a group conversation.
  contactUserId?: string;
  // Group context (ADR 0019 decision 4), passed through to
  // SharedDocumentMessage for its Access-Path resolution - omitted for a 1:1
  // chat.
  group?: { groupId: string; groupOwnerId: string; groupKey: JsonWebKey };
  // Renders a "group-invitation" message - only ever posted into a 1:1 chat,
  // so omitted by a group's own conversation. A message that parses as an
  // invitation but has no renderer (should not happen) falls back to plain
  // text.
  renderInvitation?: (invitation: {
    groupId: string;
    owner: string;
    name: string;
  }) => ReactNode;
  // Renders a sender label (name/avatar) above someone else's message - only
  // used in a group conversation (see useGroupMemberProfiles); a 1:1 chat has
  // exactly one counterpart and needs no per-message label.
  renderSender?: (senderId: string) => ReactNode;
}

// The message list + composer shared by the 1:1 chat view (Chat.tsx) and a
// group's own conversation (GroupChat.tsx, ADR 0019): both are "history of
// messages under (ownerId, chatId), encrypted with sharedKey" - what differs
// is how a shared image is reached (a 1:1 direct grant vs. a group Access-
// Path) and, in a group, who sent a given message.
export function ConversationView({
  userId,
  ownerId,
  chatId,
  sharedKey,
  messages,
  onMessageSent,
  share,
  contactUserId,
  group,
  renderInvitation,
  renderSender,
}: ConversationViewProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <>
      <div
        className="scroll padding vertical"
        style={{
          flexGrow: 1,
          gap: "0.5rem",
        }}
      >
        {messages.map((m) => {
          const isMine = m.sender === userId;
          const parsed = parseMessageContent(m.content);
          return (
            <div
              key={m.id}
              className={`padding elevate ${
                isMine
                  ? "primary top-round left-round"
                  : "surface-container top-round right-round"
              }`}
              style={{
                alignSelf: isMine ? "flex-end" : "flex-start",
                maxWidth: "80%",
                wordWrap: "break-word",
              }}
            >
              {!isMine && renderSender?.(m.sender)}
              {parsed.type === "shared-document" ? (
                <SharedDocumentMessage
                  documentId={parsed.documentId}
                  owner={parsed.owner}
                  chatKey={group ? undefined : sharedKey}
                  contactUserId={contactUserId}
                  group={group}
                />
              ) : parsed.type === "group-invitation" && renderInvitation ? (
                renderInvitation(parsed)
              ) : parsed.type === "text" ? (
                parsed.content
              ) : (
                m.content
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      <hr className="divider" />
      <SendMessageForm
        userId={userId}
        ownerId={ownerId}
        chatId={chatId}
        sharedKey={sharedKey}
        onMessageSent={onMessageSent}
        share={share}
      />
    </>
  );
}
