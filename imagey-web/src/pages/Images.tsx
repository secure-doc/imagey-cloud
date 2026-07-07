import { useActionIcons } from "../contexts/ActionBarContext";
import UploadButton from "../components/UploadButton";
import { useEffect, useState, useMemo } from "react";
import { documentService } from "../document/DocumentService";
import DocumentMetadata from "../document/DocumentMetadata";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import ImageList from "../components/ImageList";
import UploadPanel from "../activity/UploadPanel";

export default function Images() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair.publicKey;
  const privateMainKey = mainKeyPair.privateKey;
  const [documents, setDocuments] = useState<DocumentMetadata[]>();
  const actionIcons = useMemo(
    () => [
      <UploadButton
        key="add-image"
        aria-label="add-image"
        multiple
        onUploadComplete={(document) =>
          setDocuments((previousDocuments) =>
            previousDocuments ? [...previousDocuments, document] : [document],
          )
        }
      />,
    ],
    [setDocuments],
  );
  useActionIcons(actionIcons);
  useEffect(() => {
    if (user) {
      documentService
        .loadDocuments(user, publicMainKey, privateMainKey)
        .then((documents) => setDocuments(documents));
    }
  }, [publicMainKey, privateMainKey, user]);
  return (
    <main>
      <div className="column scroll">
        {!documents ? (
          t("Loading images")
        ) : documents.length === 0 ? (
          <UploadPanel
            onUploadComplete={(document) =>
              setDocuments((previousDocuments) =>
                previousDocuments
                  ? [...previousDocuments, document]
                  : [document],
              )
            }
          />
        ) : (
          <ImageList documents={documents} />
        )}
      </div>
    </main>
  );
}
