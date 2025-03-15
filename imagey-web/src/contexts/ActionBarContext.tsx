import { createContext, useContext, useEffect, useState } from "react";

interface ActionIconsState {
  actionIcons: JSX.Element[];
  setActionIcons: (icons: JSX.Element[]) => void;
}
export const ActionBarContext = createContext<ActionIconsState>({
  actionIcons: [],
  setActionIcons: () => {},
});

export function ActionBarContextProvider({
  children,
}: {
  children: JSX.Element;
}) {
  const [actionIcons, setActionIcons] = useState<JSX.Element[]>([]);
  return (
    <ActionBarContext.Provider value={{ actionIcons, setActionIcons }}>
      {children}
    </ActionBarContext.Provider>
  );
}

export function useActionIcons(icons: JSX.Element[]) {
  const { setActionIcons } = useContext(ActionBarContext);
  useEffect(() => setActionIcons(icons), [setActionIcons]);
}
