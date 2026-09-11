/**
 * Secure server-side course PDF download.
 *
 * The browser never touches Cloudinary: this endpoint verifies the caller's
 * entitlement (same rules as get-course-pdf-url), retrieves the exact
 * Cloudinary asset server-side, and streams it back as an attachment named
 * after the course code.
 */
const {
  db, jsonError, requireUser, configureCloudinary, setCors, handleOptions, cloudinary
} = require("./_lib/firebase");

async function userIsEntitled(uid, courseCode, course) {
  const userSnap = await db.collection("users").doc(uid).get();
  const profile = userSnap.exists ? userSnap.data() : null;

  const allowed =
    profile?.isPremium === true ||
    (Array.isArray(profile?.paid_courses) && profile.paid_courses.includes(courseCode));
  if (allowed) return true;

  if (course.isFree === true) {
    const claimRef = db.collection("users").doc(uid);
    return db.runTransaction(async (t) => {
      const snap = await t.get(claimRef);
      if (!snap.exists) return false;
      const current = snap.data();
      if (current.freeCourseCode) return current.freeCourseCode === courseCode;
      if (Number(current.freeCoursesUsed || 0) >= 1) return false;
      t.update(claimRef, { freeCoursesUsed: 1, freeCourseCode: courseCode });
      return true;
    });
  }
  return false;
}

function candidateUrls(course) {
  const urls = [];
  const resourceType = course.pdfResourceType || "raw";
  const publicId = course.pdfPublicId ? String(course.pdfPublicId) : null;

  if (publicId) {
    const hasExt = /\.pdf$/i.test(publicId);
    const base = hasExt ? publicId.replace(/\.pdf$/i, "") : publicId;

    // Signed, time-limited download URL generated server-side. Works for
    // upload / authenticated / private delivery types.
    for (const type of ["upload", "authenticated", "private"]) {
      try {
        urls.push(cloudinary.utils.private_download_url(base, "pdf", {
          resource_type: resourceType,
          type,
          expires_at: Math.floor(Date.now() / 1000) + 300
        }));
      } catch (_) { /* ignore unsupported combination */ }
    }

    // Signed delivery URLs.
    for (const type of ["upload", "authenticated"]) {
      try {
        urls.push(cloudinary.url(publicId, {
          resource_type: resourceType,
          type,
          secure: true,
          sign_url: true,
          version: course.pdfVersion || undefined,
          ...(hasExt ? {} : { format: "pdf" })
        }));
      } catch (_) { /* ignore */ }
    }

    // Plain delivery URL.
    try {
      urls.push(cloudinary.url(publicId, {
        resource_type: resourceType,
        type: "upload",
        secure: true,
        version: course.pdfVersion || undefined,
        ...(hasExt ? {} : { format: "pdf" })
      }));
    } catch (_) { /* ignore */ }
  }

  if (typeof course.pdfURL === "string" && course.pdfURL.startsWith("http")) {
    urls.push(course.pdfURL);
  }

  return [...new Set(urls.filter(Boolean))];
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const decoded = await requireUser(req);
    const courseCode = String(req.body?.courseCode || "").trim().toUpperCase();
    if (!courseCode) return jsonError(res, 400, "courseCode is required.");

    const courseSnap = await db.collection("courses")
      .where("code", "==", courseCode)
      .limit(1)
      .get();
    if (courseSnap.empty) return jsonError(res, 404, "Course not found.");

    const course = courseSnap.docs[0].data();

    const entitled = await userIsEntitled(decoded.uid, courseCode, course);
    if (!entitled) return jsonError(res, 403, "You do not have access to this course.");

    configureCloudinary();
    const urls = candidateUrls(course);
    if (!urls.length) return jsonError(res, 404, "Course PDF is not configured.");

    let upstream = null;
    for (const url of urls) {
      try {
        const r = await fetch(url);
        if (r.ok) { upstream = r; break; }
      } catch (_) { /* try the next candidate */ }
    }

    if (!upstream) return jsonError(res, 502, "Could not retrieve the course PDF from storage.");

    const buffer = Buffer.from(await upstream.arrayBuffer());

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", String(buffer.length));
    res.setHeader("Content-Disposition", `attachment; filename="${courseCode}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(buffer);
  } catch (err) {
    console.error("downloadCoursePdf error", err);
    return jsonError(res, err.status || 500, "Could not prepare the course PDF.");
  }
};
