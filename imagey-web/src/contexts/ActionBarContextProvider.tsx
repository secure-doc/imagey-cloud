import { useState } from "react";
import { ActionBarContext } from "./ActionBarContext";

export function ActionBarContextProvider({
  children,
}: {
  children: JSX.Element;
}) {
  const [actionIcons, setActionIcons] = useState<JSX.Element[]>([]);
  const [backButtonVisible, setBackButtonVisible] = useState<boolean>(false);
  const [title, setTitle] = useState<string | undefined>();
  return (
    <ActionBarContext.Provider
      value={{
        actionIcons,
        setActionIcons,
        backButtonVisible,
        setBackButtonVisible,
        title,
        setTitle,
      }}
    >
      {children}
    </ActionBarContext.Provider>
  );
}
