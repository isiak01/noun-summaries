/**
 * Course data access: read courses from Firestore, and admin course management
 * (create / update / delete / upload PDF to Cloudinary).
 */
import { db } from "./firebase.js";
import { uploadCoursePdfToCloudinary } from "./cloudinary.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COURSES_COLLECTION = "courses";

export async function fetchAllCourses() {
  const q = query(collection(db, COURSES_COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchCourseByCode(code) {
  const courses = await fetchAllCourses();
  return courses.find((c) => c.code.toUpperCase() === code.toUpperCase()) || null;
}

export async function fetchCourseById(id) {
  const snap = await getDoc(doc(db, COURSES_COLLECTION, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function filterCourses(courses, term) {
  if (!term) return courses;
  const t = term.trim().toLowerCase();
  return courses.filter(
    (c) => c.code.toLowerCase().includes(t) || c.name.toLowerCase().includes(t)
  );
}

/* ---------------- Admin: Add / manage courses ---------------- */

/**
 * Uploads a course PDF to Cloudinary and creates the Firestore course metadata.
 * The Admin Dashboard is only visible to users with the Firebase Auth admin claim.
 */
export async function adminAddCourse({ code, name, isFree, file }, onProgress) {
  const cleanCode = code.trim().toUpperCase();
  const uploaded = await uploadCoursePdfToCloudinary(file, onProgress);

  const docRef = await addDoc(collection(db, COURSES_COLLECTION), {
    code: cleanCode,
    name: name.trim(),
    isFree: !!isFree,
    pdfURL: uploaded.secureUrl,
    pdfPublicId: uploaded.publicId,
    pdfVersion: uploaded.version,
    pdfResourceType: uploaded.resourceType,
    createdAt: serverTimestamp()
  });

  return docRef.id;
}

export async function adminUpdateCourse(courseId, updates) {
  await updateDoc(doc(db, COURSES_COLLECTION, courseId), updates);
}

export async function adminDeleteCourse(course) {
  // Cloudinary deletion is intentionally server-side only because it requires
  // the Cloudinary API secret. Delete the Firestore metadata here; the asset
  // can be removed from Cloudinary using its authenticated admin API later.
  await deleteDoc(doc(db, COURSES_COLLECTION, course.id));
}
