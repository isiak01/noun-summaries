/**
 * Authentication helpers: signup, login, logout, profile creation.
 */
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { APP_CONFIG } from "./config.js";

export async function signUp(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await setDoc(doc(db, "users", cred.user.uid), {
    email: cred.user.email,
    role: "user",
    paid_courses: [],
    isPremium: false,
    freeCoursesUsed: 0,
    createdAt: serverTimestamp()
  });
  await syncUserRoleClaim();
  return cred.user;
}

export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await syncUserRoleClaim();
  return cred.user;
}

export async function syncUserRoleClaim() {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be logged in.");
  const idToken = await user.getIdToken();

  const response = await fetch(APP_CONFIG.backend.syncUserRoleUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.message || "Could not synchronize your account role.");
  }

  // Custom claims are included in the ID token. Force-refresh it after the
  // server updates the claim so the current session immediately sees `role`.
  await user.getIdToken(true);
  return data;
}

export async function logOut() {
  await fbSignOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

/** Resolves once with the current user (or null) — useful for page guards. */
export function waitForAuth() {
  return new Promise((resolve) => {
    document.addEventListener(
      "authready",
      (e) => resolve(e.detail),
      { once: true }
    );
  });
}
