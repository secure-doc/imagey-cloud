import { createContext, useContext, useEffect, useState } from "react";

interface ActionIconsState {
  actionIcons: JSX.Element[];
  setActionIcons: (icons: JSX.Element[]) => void;
  backButtonVisible: boolean;
  setBackButtonVisible: (backButtonVisible: boolean) => void;
}
export const ActionBarContext = createContext<ActionIconsState>({
  actionIcons: [],
  setActionIcons: () => {},
  backButtonVisible: false,
  setBackButtonVisible: () => {},
});

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

export function useActionIcons(icons: JSX.Element[]) {
  const { setActionIcons } = useContext(ActionBarContext);
  useEffect(() => setActionIcons(icons), [setActionIcons]);
}

export function useBackButton() {
  const { setBackButtonVisible } = useContext(ActionBarContext);
  setBackButtonVisible(true);
}
