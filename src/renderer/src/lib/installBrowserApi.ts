/**
 * installBrowserApi.ts
 *
 * Synchronously installs the browser shim as window.api when the app is NOT
 * running inside Electron (i.e. window.api has not been set by the preload).
 *
 * Import this module at the top of main.tsx BEFORE any React rendering so
 * that window.api is available on the very first render.
 */

import { browserApi } from './browserApi'

// window.api is injected by the Electron contextBridge preload.
// When it is absent we are running as a plain web app.
if (typeof window !== 'undefined' && !(window as any).api) {
  ;(window as any).api = browserApi
}
