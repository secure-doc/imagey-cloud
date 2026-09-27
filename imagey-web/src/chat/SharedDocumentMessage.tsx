import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useContext } from "react";
import { useNavigate } from "react-router";
import { DetailContext } from "../contexts/DetailContext";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import ImageComponent from "../components/ImageComponent";
import FileComponent from "../components/FileComponent";
import { useOpenDocument } from "../hooks/useOpenDocument";
import { useAuthentication } from "../contexts/AuthenticationContext";
import { useDocumentsId } from "../contexts/SettingsContext";
import {
  buildGroupAccessPath,
  useAccessPath,
  useKey,
} from "../contexts/FolderContext";
import { isPlayableMedia } from "../document/mediaTypes";

interface SharedDocumentMessageProps {
  documentId: string;
  owner: string;
  // The 1:1 chat's key - required unless `group` is given.
  chatKey?: JsonWebKey;
  // The 1:1 chat's counterpart - enables opening the image detail view
  // (back-navigates to this chat). Omitted in a group's own conversation
  // (ADR 0019) - group messages don't support the detail view yet.
  contactUserId?: string;
  // Group context (ADR 0019 decision 4): present when this message was
  // received in a group's own conversation rather than a 1:1 chat. A non-
  // owner reader then reaches the document through a two-hop Access-Path
  // (FolderContext.buildGroupAccessPath) instead of the chat's direct grant.
  group?: { groupId: string; groupOwnerId: string; groupKey: JsonWebKey };
}

export function SharedDocumentMessage({
  documentId,
  owner,
  chatKey,
  contactUserId,
  group,
}: SharedDocumentMessageProps) {
  const { registerDetail } = useContext(DetailContext);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;

  // Loading a shared document is just loading a document whose key is
  // wrapped by a different "parent" than usual:
  // - the owner viewing their own share already has it in their own root
  //   folder, so the normal root-folder key unlocks it, exactly like any
  //   other document in that folder - true whether this message is in a 1:1
  //   chat or a group (the group's OWNER reading a MEMBER's shared image is
  //   NOT this branch - see below).
  // - in a 1:1 chat, anyone else only has the key entry that was written for
  //   them specifically when the document was shared (keys/{their own
  //   userId}), wrapped with the chat's shared symmetric key.
  // - in a group, anyone else (including the group's owner reading a
  //   member's share) reaches the single `{issuer: groupOwner, kid: groupId}`
  //   key entry via a two-hop Access-Path instead - there is no per-reader
  //   entry to unwrap directly.
  // All hooks are called unconditionally (rules of hooks) and we simply pick
  // which result to use.
  const documentsId = useDocumentsId();
  const rootFolderKey = useKey(documentsId);
  const isOwner = user === owner;
  // A 1:1 chat share is a direct grant (issuer == kid == viewer), so this
  // resolves to undefined and no header is sent; kept so a future folder-
  // share view goes through one code path.
  const chatAccessPath = useAccessPath(documentId, owner);

  const parentId = isOwner ? documentsId : group ? group.groupId : user;
  const parentKey = isOwner ? rootFolderKey : group ? group.groupKey : chatKey;
  const accessPath = isOwner
    ? chatAccessPath
    : group
      ? buildGroupAccessPath(
          user,
          documentId,
          owner,
          group.groupId,
          group.groupOwnerId,
        )
      : chatAccessPath;

  const [document, setDocument] = useState<Document>();
  const [error, setError] = useState(false);
  const { open: openFile, element: openFileElement } = useOpenDocument();

  useEffect(() => {
    if (user && parentId && parentKey) {
      documentService
        .loadDocument(
          owner,
          documentId,
          parentId,
          parentKey,
          undefined,
          accessPath,
        )
        .then((doc) => setDocument(doc))
        .catch(() => setError(true));
    }
  }, [user, owner, documentId, parentId, parentKey, accessPath]);

  if (error) {
    return <div className="error">{t("Error loading shared document")}</div>;
  }

  if (!document) {
    return <progress className="circle" />;
  }

  const openImage =
    document.type === "image" && contactUserId
      ? () => {
          registerDetail({
            kind: "image",
            documentId: document.documentId,
            name: document.name,
            owner: document.owner,
            documentKey: document.key,
            mediumImageId: document.mediumImageId,
            smallImageId: document.smallImageId,
            mimeType: document.mimeType,
            contentId: document.contentId,
            accessPath,
          });
          navigate(
            `/images/${document.documentId}?chat=${encodeURIComponent(
              contactUserId,
            )}&owner=${encodeURIComponent(document.owner)}`,
          );
        }
      : undefined;

  if (document.type === "file") {
    const doc = document;
    // Audio/video in a 1:1 chat gets the in-app detail page, like images -
    // a group's own conversation doesn't support detail pages yet (ADR
    // 0019), so it falls through to download/share like any other file.
    const openMedia =
      isPlayableMedia(doc.mimeType) && contactUserId
        ? () => {
            registerDetail({
              kind: "media",
              documentId: doc.documentId,
              name: doc.name,
              owner: doc.owner,
              documentKey: doc.key,
              mimeType: doc.mimeType,
              contentId: doc.contentId,
              size: doc.size,
              accessPath,
            });
            navigate(
              `/media/${doc.documentId}?chat=${encodeURIComponent(
                contactUserId,
              )}&owner=${encodeURIComponent(doc.owner)}`,
            );
          }
        : undefined;
    return (
      <div className="shared-document">
        <FileComponent
          name={doc.name}
          mimeType={doc.mimeType}
          onClick={
            openMedia ??
            (() =>
              openFile(doc.name, doc.mimeType, () =>
                documentService.loadContent(doc, doc.contentId, accessPath),
              ))
          }
        />
        {openFileElement}
      </div>
    );
  }

  return (
    <div className="shared-document">
      <ImageComponent
        image={document}
        contentId={
          document.type === "image" ? document.smallImageId : undefined
        }
        accessPath={accessPath}
        className="responsive max"
        onClick={openImage}
      />
    </div>
  );
}
