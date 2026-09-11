const {
  admin, db, jsonError, requireUser, configureCloudinary, setCors, handleOptions
} = require("./_lib/firebase");

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
    const userSnap = await db.collection("users").doc(decoded.uid).get();
    const profile = userSnap.exists ? userSnap.data() : null;

    let allowed =
      profile?.isPremium === true ||
      (Array.isArray(profile?.paid_courses) && profile.paid_courses.includes(courseCode));

    // A user's first free course is atomically claimed here so two simultaneous
    // requests cannot consume the same one-course allowance incorrectly.
    if (course.isFree === true && !allowed) {
      const claimRef = db.collection("users").doc(decoded.uid);
      const claimed = await db.runTransaction(async (t) => {
        const snap = await t.get(claimRef);
        if (!snap.exists) return false;

        const current = snap.data();
        if (current.freeCourseCode) return current.freeCourseCode === courseCode;
        if (Number(current.freeCoursesUsed || 0) >= 1) return false;

        t.update(claimRef, { freeCoursesUsed: 1, freeCourseCode: courseCode });
        return true;
      });
      allowed = claimed;
    }

    if (!allowed) return jsonError(res, 403, "You do not have access to this course.");

    const isPublicUrl = (u) => typeof u === "string" && u.includes("/upload/") && !u.includes("/authenticated/");

    if (!course.pdfPublicId) {
      // Legacy records that only stored a delivery URL.
      if (isPublicUrl(course.pdfURL)) {
        return res.status(200).json({ success: true, url: course.pdfURL });
      }
      if (course.pdfURL) {
        return jsonError(res, 409, "This course PDF must be re-uploaded by the administrator.");
      }
      return jsonError(res, 404, "Course PDF is not configured.");
    }

    configureCloudinary();
    const publicId = String(course.pdfPublicId);
    const alreadyHasPdfExtension = /\.pdf$/i.test(publicId);

    // Public (normal) delivery: https://res.cloudinary.com/<cloud>/raw/upload/<public_id>
    const url = require("./_lib/firebase").cloudinary.url(publicId, {
      resource_type: course.pdfResourceType || "raw",
      type: "upload",
      secure: true,
      version: course.pdfVersion || undefined,
      ...(alreadyHasPdfExtension ? {} : { format: "pdf" })
    });

    if (!url) {
      // Fall back to a stored public URL if we somehow could not build one.
      if (isPublicUrl(course.pdfURL)) {
        return res.status(200).json({ success: true, url: course.pdfURL });
      }
      return jsonError(res, 500, "Could not prepare the course PDF.");
    }

    return res.status(200).json({ success: true, url });
  } catch (err) {
    console.error("getCoursePdfUrl error", err);
    return jsonError(res, err.status || 500, "Could not prepare the course PDF.");
  }
};
