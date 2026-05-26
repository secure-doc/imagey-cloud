import { useState } from "react";
import { ActionBarContext } from "./ActionBarContext";

export function ActionBarContextProvider({
  children,
}: {
  children: JSX.Element;
}) {
  const [actionIcons, setActionIcons] = useState<JSX.Element[]>([]);
  const [backButtonVisible, setBackButtonVisible] = useState<boolean>(false);
  return (
    <ActionBarContext.Provider
      value={{
        actionIcons,
        setActionIcons,
        backButtonVisible,
        setBackButtonVisible,
      }}
    >
      {children}
    </ActionBarContext.Provider>
  );
}
