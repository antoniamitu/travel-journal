// frontend/src/api/axios.js
import axios from "axios";
import { LS_TOKEN_KEY } from "../constants/storage.js";

/**
 * Central axios instance for the app.
 * Goals:
 * - Never silently call the frontend origin by mistake (baseURL undefined)
 * - Provide a controlled fallback in dev for localhost
 * - Keep timeouts reasonable + consistent defaults
 */

function resolveApiBaseUrl() {
  const raw = import.meta.env?.VITE_API_BASE_URL;

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim().replace(/\/+$/, ""); // remove trailing slashes
  }

  // Controlled dev fallback (helps avoid confusing "it calls Vite" bugs)
  if (typeof window !== "undefined" && window.location?.hostname === "localhost") {
    // eslint-disable-next-line no-console
    console.warn(
      "[axios] VITE_API_BASE_URL is missing. Falling back to http://localhost:3000/api (dev only)."
    );
    return "http://localhost:3000/api";
  }

  // In non-localhost, missing base URL is a real misconfig — fail fast.
  throw new Error(
    "[axios] Missing VITE_API_BASE_URL. Set it in frontend/.env(.development/.production)."
  );
}

export const API_BASE_URL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json"
  }
});

/**
 * Auth header helper
 * Read token from localStorage at request time to avoid reconfiguring interceptors on token changes.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);