import { createContext, useContext, useEffect } from "react";

interface ActionIconsState {
  actionIcons: JSX.Element[];
  setActionIcons: (icons: JSX.Element[]) => void;
  backButtonVisible: boolean;
  setBackButtonVisible: (backButtonVisible: boolean) => void;
  // Overrides the default "parent path" target of the back button.
  backPath?: string;
  setBackPath: (backPath?: string) => void;
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
  backPath: undefined,
  setBackPath: () => {},
  title: undefined,
  setTitle: () => {},
  titleAvatar: undefined,
  setTitleAvatar: () => {},
});

export function useActionIcons(icons: JSX.Element[]) {
  const { setActionIcons } = useContext(ActionBarContext);
  // Cleared on unmount so a page's icons (e.g. a folder's upload menu and back
  // button) don't linger on the next page.
  useEffect(() => {
    setActionIcons(icons);
    return () => setActionIcons([]);
  }, [setActionIcons, icons]);
}

export function useBackButton(backPath?: string) {
  const { setBackButtonVisible, setBackPath } = useContext(ActionBarContext);
  useEffect(() => {
    setBackButtonVisible(true);
    setBackPath(backPath);
    return () => {
      setBackButtonVisible(false);
      setBackPath(undefined);
    };
  }, [setBackButtonVisible, setBackPath, backPath]);
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
