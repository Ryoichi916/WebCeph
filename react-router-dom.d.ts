// Minimal ambient types for react-router-dom@4.x. The installed version ships
// no bundled declarations and no @types is installed; this covers the small
// surface the app uses (Route, Link, HashRouter).
declare module 'react-router-dom' {
  import * as React from 'react';

  interface RouteProps {
    path?: string;
    exact?: boolean;
    strict?: boolean;
    component?: React.ComponentType<any>;
    render?: (props: any) => React.ReactNode;
    children?: ((props: any) => React.ReactNode) | React.ReactNode;
  }

  interface LinkProps {
    to: string | object;
    replace?: boolean;
    className?: string;
    children?: React.ReactNode;
  }

  export const Route: React.ComponentClass<RouteProps>;
  export const Link: React.ComponentClass<LinkProps>;
  export const NavLink: React.ComponentClass<LinkProps>;
  export const HashRouter: React.ComponentClass<{ children?: React.ReactNode }>;
  export const BrowserRouter: React.ComponentClass<{ children?: React.ReactNode }>;
  export const Switch: React.ComponentClass<{ children?: React.ReactNode }>;
  export const Redirect: React.ComponentClass<{ to: string | object }>;
}
