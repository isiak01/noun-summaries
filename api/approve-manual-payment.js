const {
  jsonError, requireAdmin, processManualPayment, setCors, handleOptions
} = require("./_lib/firebase");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    const adminUser = await requireAdmin(req);
    const paymentId = req.body?.paymentId;
    if (!paymentId) return jsonError(res, 400, "paymentId is required.");

    const result = await processManualPayment(paymentId, "approve", adminUser);
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    console.error("approveManualPayment error", err);
    return jsonError(res, err.status || 500, err.message || "Could not approve payment.");
  }
};
