import { createContext, useContext, useEffect } from "react";

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

export function useActionIcons(icons: JSX.Element[]) {
  const { setActionIcons } = useContext(ActionBarContext);
  useEffect(() => setActionIcons(icons), [setActionIcons, icons]);
}

export function useBackButton() {
  const { setBackButtonVisible } = useContext(ActionBarContext);
  useEffect(() => setBackButtonVisible(true), [setBackButtonVisible]);
}
