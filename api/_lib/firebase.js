const admin = require("firebase-admin");
const cloudinary = require("cloudinary").v2;

if (!admin.apps.length) {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  let privateKey = String(process.env.FIREBASE_PRIVATE_KEY || "").trim();

  // Vercel may store the key with literal "\\n" sequences or with real
  // line breaks. Normalize both forms and remove accidental outer quotes.
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in Vercel."
    );
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY is not formatted correctly. Paste the complete service-account private key."
    );
  }

  // A common Vercel mistake is putting FIREBASE_CLIENT_EMAIL into
  // FIREBASE_PROJECT_ID. Fail with a useful message instead of a cryptic
  // Firebase audience/credential error.
  if (projectId.includes("@") || projectId.includes(".iam.gserviceaccount.com")) {
    throw new Error(
      "FIREBASE_PROJECT_ID is incorrect. Use the Firebase project ID (for example, nounsummaries-4cd16), not the service-account email."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

const db = admin.firestore();

const PRICES_NAIRA = { course: 500, premium: 5000 };
const CURRENCY = "NGN";

function jsonError(res, status, message) {
  return res.status(status).json({ success: false, message });
}

function getBearer(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

async function requireUser(req) {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("Missing authentication token."), { status: 401 });
  return admin.auth().verifyIdToken(token);
}

async function requireAdmin(req) {
  const decoded = await requireUser(req);
  if (decoded.role !== "admin") {
    throw Object.assign(new Error("Administrator access required."), { status: 403 });
  }
  return decoded;
}

function expectedAmount(paymentType) {
  if (!PRICES_NAIRA[paymentType]) throw new Error("Invalid payment type.");
  return PRICES_NAIRA[paymentType];
}

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in Vercel."
    );
  }
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true
  });
  return { cloudName, apiKey, apiSecret };
}

function setCors(req, res) {
  const origin = req.headers.origin;
  // Same-origin Vercel requests need no CORS header. For local development and
  // explicitly allowed origins, echo the request origin.
  const allowed = process.env.FRONTEND_ORIGIN;
  if (origin && (!allowed || origin === allowed)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function handleOptions(req, res) {
  if (req.method !== "OPTIONS") return false;
  setCors(req, res);
  res.status(204).end();
  return true;
}

async function processManualPayment(paymentId, action, adminUser) {
  const paymentRef = db.collection("payments").doc(paymentId);

  return db.runTransaction(async (t) => {
    const paymentSnap = await t.get(paymentRef);
    if (!paymentSnap.exists) {
      throw Object.assign(new Error("Payment not found."), { status: 404 });
    }

    const payment = paymentSnap.data();
    if (payment.method !== "transfer") {
      throw Object.assign(new Error("Only manual transfer payments can be processed here."), { status: 400 });
    }
    if (payment.status !== "pending") {
      // Idempotency guard: a payment can only be approved or rejected once.
      throw Object.assign(
        new Error(`This payment has already been ${payment.status}.`),
        { status: 409 }
      );
    }
    if (!Number.isFinite(Number(payment.amount))) {
      throw Object.assign(new Error("Invalid payment amount."), { status: 400 });
    }

    const expected = expectedAmount(payment.paymentType);
    if (Number(payment.amount) !== expected) {
      throw Object.assign(new Error("Payment amount does not match the configured price."), { status: 400 });
    }
    if (payment.paymentType === "course" && !payment.courseCode) {
      throw Object.assign(new Error("Course payment is missing course code."), { status: 400 });
    }

    const userRef = db.collection("users").doc(payment.userId);
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) {
      throw Object.assign(new Error("User account not found."), { status: 404 });
    }

    if (action === "approve") {
      if (payment.paymentType === "premium") {
        t.update(userRef, { isPremium: true });
      } else {
        t.update(userRef, {
          paid_courses: admin.firestore.FieldValue.arrayUnion(String(payment.courseCode).toUpperCase())
        });
      }
      t.update(paymentRef, {
        status: "approved",
        approvedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvedBy: adminUser.uid
      });
      return { alreadyProcessed: false, status: "approved" };
    }

    t.update(paymentRef, {
      status: "rejected",
      rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
      rejectedBy: adminUser.uid
    });
    return { alreadyProcessed: false, status: "rejected" };
  });
}

module.exports = {
  admin,
  db,
  cloudinary,
  PRICES_NAIRA,
  CURRENCY,
  jsonError,
  requireUser,
  requireAdmin,
  expectedAmount,
  configureCloudinary,
  setCors,
  handleOptions,
  processManualPayment
};
