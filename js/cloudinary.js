/**
 * Cloudinary unsigned upload helpers. Firebase Storage is NOT used by this project.
 * Payment proofs use the image endpoint; course PDFs use the raw endpoint.
 */
import { APP_CONFIG } from "./config.js";
import { auth } from "./firebase.js";

function uploadTo(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", APP_CONFIG.cloudinary.uploadPreset);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) resolve(data);
        else reject(new Error(data.error?.message || "Upload failed. Please try again."));
      } catch { reject(new Error("Upload failed. Please try again.")); }
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(formData);
  });
}

export async function uploadToCloudinary(file, onProgress) {
  const data = await uploadTo(APP_CONFIG.cloudinary.proofUploadUrl, file, onProgress);
  return data.secure_url;
}

export async function uploadCoursePdfToCloudinary(file, onProgress) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in as an administrator before uploading a course PDF.");
  const token = await user.getIdToken();
  const signatureResponse = await fetch(APP_CONFIG.backend.getCloudinaryUploadSignatureUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ resourceType: "raw" })
  });
  const signature = await signatureResponse.json().catch(() => ({}));
  if (!signatureResponse.ok || !signature.success) {
    throw new Error(signature.message || "Could not authorize the PDF upload.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", signature.apiKey);
  formData.append("timestamp", String(signature.timestamp));
  // No "type" param: Cloudinary defaults to public "upload" delivery, which is
  // what the signature from the server covers. Never use authenticated here.
  formData.append("folder", signature.folder);
  formData.append("signature", signature.signature);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `https://api.cloudinary.com/v1_1/${APP_CONFIG.cloudinary.cloudName}/raw/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
          resolve({
            secureUrl: data.secure_url,
            publicId: data.public_id,
            version: data.version || null,
            resourceType: data.resource_type || "raw"
          });
        } else reject(new Error(data.error?.message || "Course PDF upload failed."));
      } catch { reject(new Error("Course PDF upload failed.")); }
    };
    xhr.onerror = () => reject(new Error("Network error during course PDF upload."));
    xhr.send(formData);
  });
}
