import { createContext, useContext, useEffect } from "react";

interface ActionIconsState {
  actionIcons: JSX.Element[];
  setActionIcons: (icons: JSX.Element[]) => void;
  backButtonVisible: boolean;
  setBackButtonVisible: (backButtonVisible: boolean) => void;
  title?: string;
  setTitle: (title?: string) => void;
  // undefined = no avatar, "" = initial letter of the title, else image URL
  titleAvatar?: string;
  setTitleAvatar: (titleAvatar?: string) => void;
}
export const ActionBarContext = createContext<ActionIconsState>({
  actionIcons: [],
  setActionIcons: () => {},
  backButtonVisible: false,
  setBackButtonVisible: () => {},
  title: undefined,
  setTitle: () => {},
  titleAvatar: undefined,
  setTitleAvatar: () => {},
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

export function useTitle(title?: string, titleAvatar?: string) {
  const { setTitle, setTitleAvatar } = useContext(ActionBarContext);
  useEffect(() => {
    setTitle(title);
    setTitleAvatar(titleAvatar);
    return () => {
      setTitle(undefined);
      setTitleAvatar(undefined);
    };
  }, [setTitle, setTitleAvatar, title, titleAvatar]);
}
