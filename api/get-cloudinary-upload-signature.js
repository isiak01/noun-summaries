const {
  jsonError, requireAdmin, configureCloudinary, setCors, handleOptions
} = require("./_lib/firebase");

module.exports = async function handler(req, res) {
  setCors(req, res);
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") return jsonError(res, 405, "Method not allowed.");

  try {
    await requireAdmin(req);
    const { cloudName, apiKey, apiSecret } = configureCloudinary();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = "noun-exam-summary-hub/courses";

    const signature = require("./_lib/firebase").cloudinary.utils.api_sign_request(
      // Public (normal) delivery: raw/upload. Never sign course PDFs as
      // "authenticated" — students must be able to fetch the file directly
      // once our API has confirmed their entitlement.
      { folder, timestamp },
      apiSecret
    );

    return res.status(200).json({
      success: true,
      signature,
      timestamp,
      folder,
      apiKey,
      cloudName
    });
  } catch (err) {
    console.error("getCloudinaryUploadSignature error", err);
    return jsonError(
      res,
      err.status || 500,
      err.message || "Could not authorize Cloudinary upload."
    );
  }
};
