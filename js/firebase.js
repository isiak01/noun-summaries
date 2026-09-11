/**
 * Firebase initialization (modular SDK v10, ESM via CDN).
 * Exports: app, auth, db, analyticsReady
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { APP_CONFIG } from "./config.js";

export const app = initializeApp(APP_CONFIG.firebase);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Keep users logged in across sessions.
setPersistence(auth, browserLocalPersistence).catch((err) => {
  console.warn("Auth persistence could not be set:", err.message);
});

// Analytics is optional and must never break the app if unsupported (e.g. SSR, some browsers).
export let analytics = null;
(async () => {
  try {
    const { getAnalytics, isSupported } = await import(
      "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js"
    );
    if (await isSupported()) {
      analytics = getAnalytics(app);
    }
  } catch (err) {
    // Analytics is non-critical — fail silently.
    console.info("Firebase Analytics not initialized:", err?.message || err);
  }
})();
