import { createContext, useContext, useEffect } from "react";

interface ActionIconsState {
  actionIcons: JSX.Element[];
  setActionIcons: (icons: JSX.Element[]) => void;
  backButtonVisible: boolean;
  setBackButtonVisible: (backButtonVisible: boolean) => void;
  title?: string;
  setTitle: (title?: string) => void;
}
export const ActionBarContext = createContext<ActionIconsState>({
  actionIcons: [],
  setActionIcons: () => {},
  backButtonVisible: false,
  setBackButtonVisible: () => {},
  title: undefined,
  setTitle: () => {},
});

export function useActionIcons(icons: JSX.Element[]) {
  const { setActionIcons } = useContext(ActionBarContext);
  useEffect(() => setActionIcons(icons), [setActionIcons, icons]);
}

export function useBackButton() {
  const { setBackButtonVisible } = useContext(ActionBarContext);
  useEffect(() => {
    setBackButtonVisible(true);
    return () => setBackButtonVisible(false);
  }, [setBackButtonVisible]);
}

export function useTitle(title?: string) {
  const { setTitle } = useContext(ActionBarContext);
  useEffect(() => {
    setTitle(title);
    return () => setTitle(undefined);
  }, [setTitle, title]);
}
