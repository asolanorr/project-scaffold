/**
 * React Aria's client-side routing hook-up, re-exported so the app has one
 * place to get primitives from.
 *
 * Every `href` in this package — `Button`, and any link component added later —
 * renders a real `<a>` and, when a `RouterProvider` is mounted above it, calls
 * its `navigate` on click instead of reloading the page. The provider belongs
 * in the app: it is where the framework router and the locale live. See
 * apps/web/src/app/[locale]/providers.tsx.
 */

export { RouterProvider } from "react-aria-components";
