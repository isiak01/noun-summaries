/**
 * Shared UI utilities: header/nav rendering, mobile menu, toasts,
 * auth-state-driven navigation, and service worker registration.
 */
import { auth, db } from "./firebase.js";
import { syncUserRoleClaim } from "./auth.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { APP_CONFIG } from "./config.js";

/* ---------------- Toast notifications ---------------- */
export function toast(message, type = "info", duration = 3800) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--show"));
  setTimeout(() => {
    el.classList.remove("toast--show");
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ---------------- Friendly error mapping ---------------- */
export function friendlyError(err) {
  const code = err?.code || "";
  const map = {
    "auth/invalid-email": "That email address doesn't look right.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists with that email.",
    "auth/weak-password": "Please choose a stronger password (6+ characters).",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again."
  };
  return map[code] || "Something went wrong. Please try again.";
}

/* ---------------- Loading button helper ---------------- */
export function setButtonLoading(btn, isLoading, loadingText = "Please wait...") {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalText = btn.dataset.originalText || btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${loadingText}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
  }
}

/* ---------------- Header / Nav ---------------- */
const NAV_HTML = `
<header class="site-header">
  <div class="container header__inner">
    <a class="brand" href="index.html">
      <img src="${APP_CONFIG.brandImage}" alt="NOUN Exam Summary Hub logo" class="brand__logo" width="36" height="36" />
      <span class="brand__text">NOUN Exam Summary Hub</span>
    </a>

    <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="primaryNav">
      <span></span><span></span><span></span>
    </button>

    <nav class="primary-nav" id="primaryNav" aria-label="Primary">
      <a href="index.html" class="nav-link">Home</a>
      <a href="index.html#courses" class="nav-link">Courses</a>
      <a href="https://dans-cbt.vercel.app/" class="nav-link" target="_blank" rel="noopener">CBT APP</a>
      <a href="my-courses.html" class="nav-link" data-requires-auth>My Courses</a>
      <a href="admin.html" class="nav-link nav-link--admin" data-admin-only hidden>Admin Dashboard</a>
      <a href="login.html" class="nav-link" data-guest-only>Login</a>
      <a href="signup.html" class="btn btn--primary btn--small" data-guest-only>Sign Up</a>
      <button class="btn btn--outline btn--small" id="logoutBtn" data-auth-only hidden>Logout</button>
    </nav>
  </div>
</header>
`;

const FOOTER_HTML = `
<footer class="site-footer">
  <div class="container footer__inner">
    <div class="footer__brand">
      <img src="${APP_CONFIG.brandImage}" alt="" class="brand__logo brand__logo--small" width="28" height="28" />
      <span>NOUN Exam Summary Hub</span>
    </div>
    <p class="footer__tagline">Study Smarter. Prepare Better.</p>
    <p class="footer__disclaimer">For Educational Summary Purposes Only. Not Affiliated with NOUN.</p>
    <p class="footer__copy">&copy; ${new Date().getFullYear()} NOUN Exam Summary Hub</p>
  </div>
</footer>
`;

export function mountLayout() {
  const headerMount = document.getElementById("header-mount");
  const footerMount = document.getElementById("footer-mount");
  if (headerMount) headerMount.innerHTML = NAV_HTML;
  if (footerMount) footerMount.innerHTML = FOOTER_HTML;

  const toggle = document.getElementById("navToggle");
  const nav = document.getElementById("primaryNav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("primary-nav--open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
    nav.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => {
        nav.classList.remove("primary-nav--open");
        toggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await signOut(auth);
      toast("You have been logged out.", "success");
      setTimeout(() => (window.location.href = "index.html"), 700);
    });
  }

  bindAuthState();
}

function applyAuthUI(isLoggedIn, isAdmin) {
  document.querySelectorAll("[data-guest-only]").forEach((el) => (el.hidden = isLoggedIn));
  document.querySelectorAll("[data-auth-only]").forEach((el) => (el.hidden = !isLoggedIn));
  document.querySelectorAll("[data-admin-only]").forEach((el) => (el.hidden = !isAdmin));
  document.querySelectorAll("[data-requires-auth]").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (!isLoggedIn) {
        e.preventDefault();
        window.location.href = "login.html";
      }
    });
  });
}

let currentUserProfile = null;
export function getCachedProfile() {
  return currentUserProfile;
}

function bindAuthState() {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUserProfile = null;
      applyAuthUI(false, false);
      document.dispatchEvent(new CustomEvent("authready", { detail: { user: null, profile: null, isAdmin: false } }));
      return;
    }
    try {
      await syncUserRoleClaim();
    } catch (e) {
      console.warn("Could not synchronize user role claim:", e.message);
    }

    let profile = null;
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) profile = snap.data();
    } catch (e) {
      console.warn("Could not load user profile:", e.message);
    }
    // The API synchronizes the Auth custom claim from the Firestore `role`
    // field. The profile is still used here for immediate UI state.
    const isAdmin = profile?.role === "admin";
    currentUserProfile = profile;
    applyAuthUI(true, isAdmin);
    document.dispatchEvent(
      new CustomEvent("authready", { detail: { user, profile, isAdmin } })
    );
  });
}

/* Auto-run on every page */
document.addEventListener("DOMContentLoaded", () => {
  mountLayout();
});
