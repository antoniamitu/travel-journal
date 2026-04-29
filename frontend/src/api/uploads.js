// frontend/src/api/uploads.js
import axios from "axios";
import { api } from "./axios.js";

export async function requestUploadSignature(options = {}) {
  const res = await api.post("/uploads/sign", {}, options);
  return res?.data ?? null;
}

export async function cleanupDraftUploads(publicIds, options = {}) {
  const ids = Array.isArray(publicIds) ? publicIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return { deleted: [], failed: [] };
  }

  const res = await api.post("/uploads/cleanup", { publicIds: ids }, options);
  return {
    deleted: Array.isArray(res?.data?.deleted) ? res.data.deleted : [],
    failed: Array.isArray(res?.data?.failed) ? res.data.failed : []
  };
}

export async function uploadFileToCloudinary(file, signedPayload, { signal, onProgress } = {}) {
  if (!file) throw new Error("Missing file.");

  if (!signedPayload || typeof signedPayload !== "object") {
    throw new Error("Missing signed Cloudinary upload payload.");
  }

  const requiredSignedFields = ["uploadUrl", "apiKey", "timestamp", "signature"];
  const missingSignedFields = requiredSignedFields.filter((key) => {
    const value = signedPayload[key];
    return value === null || value === undefined || String(value).trim() === "";
  });

  if (missingSignedFields.length > 0) {
    throw new Error(
      `Invalid signed Cloudinary upload payload. Missing: ${missingSignedFields.join(", ")}.`
    );
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", String(signedPayload.apiKey));
  formData.append("timestamp", String(signedPayload.timestamp));
  formData.append("signature", String(signedPayload.signature));

  const enforced = signedPayload.enforcedParams || {};
  for (const [key, value] of Object.entries(enforced)) {
    if (value == null) continue;
    formData.append(key, String(value));
  }

  if (!enforced.folder && signedPayload.folder) {
    formData.append("folder", String(signedPayload.folder));
  }

  const res = await axios.post(signedPayload.uploadUrl, formData, {
    signal,
    onUploadProgress: (evt) => {
      if (!evt?.total || typeof onProgress !== "function") return;
      const percent = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
      onProgress(percent);
    }
  });

  const secureUrl = res?.data?.secure_url;
  const publicId = res?.data?.public_id;

  if (!secureUrl || !publicId) {
    throw new Error("Invalid Cloudinary response shape.");
  }

  return { secureUrl, publicId };
}