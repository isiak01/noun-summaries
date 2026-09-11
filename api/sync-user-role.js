const { admin, db, jsonError, requireUser, setCors, handleOptions } = require("./_lib/firebase");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const decoded = await requireUser(req);
    const uid = decoded.uid;

    const userSnap = await db.collection("users").doc(uid).get();
    const desiredRole = userSnap.exists && userSnap.data()?.role === "admin" ? "admin" : "user";

    const user = await admin.auth().getUser(uid);
    const currentRole = user.customClaims?.role === "admin" ? "admin" : "user";

    if (currentRole !== desiredRole) {
      await admin.auth().setCustomUserClaims(uid, {
        ...(user.customClaims || {}),
        role: desiredRole
      });
    }

    return res.status(200).json({
      success: true,
      role: desiredRole,
      changed: currentRole !== desiredRole
    });
  } catch (err) {
    console.error("syncUserRoleClaim error", err);
    return jsonError(res, err.status || 500, err.message || "Could not sync user role.");
  }
};
