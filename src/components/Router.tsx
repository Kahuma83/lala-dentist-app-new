import React, { useState, useEffect, createContext, useContext } from "react";
import { isLocalPatientDemoEnabled } from "../utils/localPatientDemo";

interface RouterContextType {
  path: string;
  navigationVersion: number;
  navigate: (newPath: string) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

function getApplicationPath(pathname: string): string {
  if (isLocalPatientDemoEnabled && pathname.startsWith("/demo/")) {
    return pathname.slice("/demo".length) || "/login";
  }
  if (isLocalPatientDemoEnabled && pathname === "/demo") return "/login";
  return pathname === "/" || !pathname ? "/login" : pathname;
}

export const RouterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Read current pathname, default to /login if empty or root
  const [path, setPath] = useState<string>(() => {
    return getApplicationPath(window.location.pathname);
  });
  const [navigationVersion, setNavigationVersion] = useState(0);

  useEffect(() => {
    const handlePopState = () => {
      setPath(getApplicationPath(window.location.pathname));
      setNavigationVersion((version) => version + 1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (newPath: string) => {
    const destination = new URL(newPath, window.location.origin);
    const applicationPath = getApplicationPath(destination.pathname);
    const alreadyHasDemoPrefix = destination.pathname === "/demo" || destination.pathname.startsWith("/demo/");
    const destinationPath = isLocalPatientDemoEnabled && !alreadyHasDemoPrefix
      ? `/demo${destination.pathname === "/" ? "/login" : destination.pathname}${destination.search}${destination.hash}`
      : `${destination.pathname}${destination.search}${destination.hash}`;
    window.history.pushState({}, "", destinationPath);
    setPath(applicationPath);
    setNavigationVersion((version) => version + 1);
  };

  return (
    <RouterContext.Provider value={{ path, navigationVersion, navigate }}>
      {children}
    </RouterContext.Provider>
  );
};

export const useRouter = () => {
  const context = useContext(RouterContext);
  if (!context) {
    throw new Error("useRouter must be used within a RouterProvider");
  }
  return context;
};

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: React.ReactNode;
}

export const Link: React.FC<LinkProps> = ({ to, children, className, onClick, ...props }) => {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (onClick) {
      onClick(e);
    }
    navigate(to);
  };

  return (
    <a href={to} onClick={handleClick} className={className} {...props}>
      {children}
    </a>
  );
};
