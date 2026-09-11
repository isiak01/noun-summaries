/**
 * Payments and entitlement helpers (manual bank transfer only).
 *
 * Client-side code never grants Premium/course access. All privileged payment
 * actions are performed by the server (Firebase Admin SDK) after authentication
 * and server-side validation of the stored payment document.
 */
import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { APP_CONFIG } from "./config.js";

const PAYMENTS_COLLECTION = "payments";
const SETTINGS_COLLECTION = "settings";
const BANK_SETTINGS_DOC = "bank";

export function grantCourseAccess() {
  throw new Error("Entitlements are server-managed and cannot be granted from the browser.");
}

export function grantPremiumAccess() {
  throw new Error("Entitlements are server-managed and cannot be granted from the browser.");
}

export function userCanAccessCourse(profile, course) {
  if (!course) return false;
  if (course.isFree) {
    if (!profile) return false;
    if (profile.freeCourseCode) return profile.freeCourseCode === course.code.toUpperCase();
    return Number(profile.freeCoursesUsed || 0) < 1;
  }
  if (!profile) return false;
  if (profile.isPremium) return true;
  return Array.isArray(profile.paid_courses) && profile.paid_courses.includes(course.code.toUpperCase());
}

/* ---------------- Admin-configured bank details ---------------- */

export async function fetchBankDetails() {
  try {
    const snap = await getDoc(doc(db, SETTINGS_COLLECTION, BANK_SETTINGS_DOC));
    if (snap.exists()) {
      const data = snap.data() || {};
      return {
        bankName: data.bankName || APP_CONFIG.bank.bankName,
        accountName: data.accountName || APP_CONFIG.bank.accountName,
        accountNumber: data.accountNumber || APP_CONFIG.bank.accountNumber
      };
    }
  } catch (err) {
    console.warn("Could not load bank settings", err);
  }
  return { ...APP_CONFIG.bank };
}

export async function saveBankDetails({ bankName, accountName, accountNumber }) {
  if (!auth.currentUser) throw new Error("Please sign in again.");
  await setDoc(
    doc(db, SETTINGS_COLLECTION, BANK_SETTINGS_DOC),
    {
      bankName: String(bankName || "").trim(),
      accountName: String(accountName || "").trim(),
      accountNumber: String(accountNumber || "").trim(),
      updatedAt: serverTimestamp(),
      updatedBy: auth.currentUser.uid
    },
    { merge: true }
  );
}

/* ---------------- Manual transfer payment requests ---------------- */

export async function createTransferPaymentRequest({ userId, email, paymentType, courseCode, proofURL, reference }) {
  if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error("Please sign in again.");
  if (paymentType !== "course" && paymentType !== "premium") throw new Error("Invalid payment type.");
  const amount = paymentType === "premium" ? APP_CONFIG.pricing.premium : APP_CONFIG.pricing.course;
  const payload = {
    userId,
    email,
    amount,
    currency: APP_CONFIG.pricing.currency,
    method: "transfer",
    paymentType,
    proofURL: proofURL || "",
    status: "pending",
    createdAt: serverTimestamp()
  };
  if (reference) payload.reference = String(reference).slice(0, 120);
  if (paymentType === "course") {
    if (!courseCode) throw new Error("Course code is required.");
    payload.courseCode = courseCode.toUpperCase();
  }
  const ref = await addDoc(collection(db, PAYMENTS_COLLECTION), payload);
  return ref.id;
}

export async function fetchUserPayments(userId) {
  const q = query(collection(db, PAYMENTS_COLLECTION), where("userId", "==", userId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAllPayments() {
  const q = query(collection(db, PAYMENTS_COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function callBackend(url, body) {
  if (!url || url.startsWith("PASTE_")) throw new Error("Backend payment service is not configured yet.");
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be logged in.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.message || "Server request failed.");
  return data;
}

export async function approvePayment(paymentId) {
  return callBackend(APP_CONFIG.backend.approveManualPaymentUrl, { paymentId });
}

export async function rejectPayment(paymentId) {
  return callBackend(APP_CONFIG.backend.rejectManualPaymentUrl, { paymentId });
}

export async function getAuthorizedCoursePdfUrl(courseCode) {
  return callBackend(APP_CONFIG.backend.getCoursePdfUrl, { courseCode: courseCode.toUpperCase() });
}

/**
 * Downloads the course PDF through our own server (never Cloudinary directly).
 * Returns a Blob containing the exact PDF uploaded by the administrator.
 */
export async function fetchAuthorizedCoursePdfBlob(courseCode) {
  const url = APP_CONFIG.backend.downloadCoursePdfUrl;
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("You must be logged in.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify({ courseCode: String(courseCode).toUpperCase() })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Could not download the course PDF.");
  }
  return res.blob();
}
