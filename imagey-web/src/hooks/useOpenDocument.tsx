import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import OpenFileDialog from "../components/OpenFileDialog";
import { openDocument } from "../document/openDocument";

// Downloads/shares a document (openDocument) and owns the UI for the two
// cases that need it: the "needs a fresh user gesture" dialog and an error
// snackbar. Render `element` wherever `open` is called from.
export function useOpenDocument(): {
  open: (
    name: string,
    mimeType: string | undefined,
    load: () => Promise<ArrayBuffer | Blob>,
  ) => Promise<void>;
  element: ReactNode;
} {
  const { t } = useTranslation();
  const [pendingFile, setPendingFile] = useState<File>();
  const [failedName, setFailedName] = useState<string>();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const showFailure = useCallback((name: string) => {
    setFailedName(name);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => setFailedName(undefined), 4000);
  }, []);

  const open = useCallback(
    async (
      name: string,
      mimeType: string | undefined,
      load: () => Promise<ArrayBuffer | Blob>,
    ) => {
      try {
        const result = await openDocument(name, mimeType, load);
        if (result.result === "needsGesture") {
          setPendingFile(result.file);
        }
      } catch (e) {
        console.error(`Could not open ${name}`, e);
        showFailure(name);
      }
    },
    [showFailure],
  );

  const element = (
    <>
      {pendingFile && (
        <OpenFileDialog
          file={pendingFile}
          onClose={() => setPendingFile(undefined)}
          onError={() => {
            showFailure(pendingFile.name);
            setPendingFile(undefined);
          }}
        />
      )}
      <div className={`snackbar error ${failedName ? "active" : ""}`}>
        <i>error</i>
        <span>{t("Could not open {{name}}", { name: failedName })}</span>
      </div>
    </>
  );

  return { open, element };
}
