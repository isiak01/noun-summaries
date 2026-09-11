/**
 * PUBLIC FRONTEND CONFIGURATION ONLY.
 * Never put Firebase Admin credentials, Cloudinary secrets, or other
 * private keys in this file.
 */
export const APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCHju_9WTv5bKY2y5Ipx2_pdaJCIIKeiAI",
    authDomain: "nounsummaries-4cd16.firebaseapp.com",
    projectId: "nounsummaries-4cd16",
    storageBucket: "nounsummaries-4cd16.firebasestorage.app",
    messagingSenderId: "923898802435",
    appId: "1:923898802435:web:26bc403fc0605b6441b936",
    measurementId: "G-884Y8DPRQE"
  },

  cloudinary: {
    cloudName: "wbxzjp9g",
    uploadPreset: "ml_default",
    proofUploadUrl: "https://api.cloudinary.com/v1_1/wbxzjp9g/image/upload",
    pdfUploadUrl: "https://api.cloudinary.com/v1_1/wbxzjp9g/raw/upload"
  },

  backend: {
    // Vercel Serverless Functions. Relative paths keep the frontend and API
    // on the same deployment/domain.
    syncUserRoleUrl: "/api/sync-user-role",
    approveManualPaymentUrl: "/api/approve-manual-payment",
    rejectManualPaymentUrl: "/api/reject-manual-payment",
    getCoursePdfUrl: "/api/get-course-pdf-url",
    downloadCoursePdfUrl: "/api/download-course-pdf",
    getCloudinaryUploadSignatureUrl: "/api/get-cloudinary-upload-signature"
  },


  pricing: {
    course: 500,
    premium: 5000,
    currency: "NGN"
  },

  bank: {
    bankName: "[ADMIN WILL ADD BANK]",
    accountName: "[ADMIN WILL ADD ACCOUNT NAME]",
    accountNumber: "[ADMIN WILL ADD ACCOUNT NUMBER]"
  },

  brandImage: "img/picture.png"
};
