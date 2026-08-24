import { useMemo, useState } from "react";
import { ActionBarContext } from "./ActionBarContext";

export function ActionBarContextProvider({
  children,
}: {
  children: JSX.Element;
}) {
  const [actionIcons, setActionIcons] = useState<JSX.Element[]>([]);
  const [backButtonVisible, setBackButtonVisible] = useState<boolean>(false);
  const [title, setTitle] = useState<string | undefined>();

  // Memoized so that a re-render of App (e.g. from an unrelated FolderContext
  // update) doesn't hand every ActionBarContext consumer a brand-new value
  // object and force them all to re-render too.
  const value = useMemo(
    () => ({
      actionIcons,
      setActionIcons,
      backButtonVisible,
      setBackButtonVisible,
      title,
      setTitle,
    }),
    [actionIcons, backButtonVisible, title],
  );

  return (
    <ActionBarContext.Provider value={value}>
      {children}
    </ActionBarContext.Provider>
  );
}
