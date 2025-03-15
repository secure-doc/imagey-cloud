import { useActionIcons } from "../contexts/ActionBarContext";
import FileChooser from "../components/FileChooser";
import { useEffect, useState } from "react";

interface ImagesProperties {
  privateKey?: JsonWebKey;
}

export default function Images({ privateKey }: ImagesProperties) {
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>(
    undefined,
  );
  const [selectedFileNames, setSelectedFileNames] = useState<string>(
    "Keine Bilder vorhanden",
  );
  const actionIcons = [
    <FileChooser
      key="add-image"
      multiple
      onFilesSelected={(files) => setSelectedFiles(files)}
    />,
  ];
  useActionIcons(actionIcons);
  useEffect(() => {
    if (selectedFiles) {
      let selectedFileNames = "";
      for (const file of selectedFiles) {
        selectedFileNames =
          selectedFileNames +
          (selectedFileNames.length > 0 ? ", " : "") +
          file.name;
      }
      setSelectedFileNames(selectedFileNames);
    } else {
      setSelectedFileNames("Keine Bilder vorhanden");
    }
  }, [selectedFiles]);
  return (
    <main>
      <p>{privateKey ? selectedFileNames : "Bilder werden geladen"}</p>
    </main>
  );
}
