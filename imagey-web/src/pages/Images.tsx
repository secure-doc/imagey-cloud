import { useActionIcons } from "../contexts/ActionBarContext";
import UploadButton from "../components/UploadButton";
import { useEffect, useState, useMemo } from "react";
import { documentService } from "../document/DocumentService";
import Document from "../document/Document";
import { useTranslation } from "react-i18next";
import { useAuthentication } from "../contexts/AuthenticationContext";
import ImageComponent from "../components/ImageComponent";

export default function Images() {
  const { t } = useTranslation();
  const authentication = useAuthentication();
  const user = authentication.user;
  const mainKeyPair = authentication.keyPairs.mainKeyPair;
  const publicMainKey = mainKeyPair.publicKey;
  const privateMainKey = mainKeyPair.privateKey;
  const [documents, setDocuments] = useState<Document[]>();
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
        {!documents
          ? t("Loading images")
          : documents.length === 0
            ? t("No images found")
            : documents.map((document) => <ImageComponent image={document} />)}
      </div>
    </main>
  );
}
