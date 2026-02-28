// frontend/src/pages/LoginPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import FullscreenLoader from "../components/ui/FullscreenLoader.jsx";

// Keep it consistent with Register (and backend validator style)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normalizeEmailForApi(input) {
  return String(input || "").trim().toLowerCase();
}
function isValidEmail(v) {
  return typeof v === "string" && emailRegex.test(v);
}

export default function LoginPage() {
  const { login, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Abort on unmount / route change to avoid state updates after navigation
  const abortRef = useRef(null);
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ✅ Hooks BEFORE early returns
  const redirectTo = useMemo(() => {
    const from = location.state?.from;
    return from?.pathname ? `${from.pathname}${from.search || ""}${from.hash || ""}` : "/feed";
  }, [location.state]);

  const emailNormalized = useMemo(() => normalizeEmailForApi(email), [email]);
  const emailOk = useMemo(() => isValidEmail(emailNormalized), [emailNormalized]);

  // PRD: at login only "required" (backend)
  const passwordOk = useMemo(() => password.length >= 1, [password]);

  const canSubmit = emailOk && passwordOk && !isSubmitting;

  if (isInitializing) return <FullscreenLoader width={380} />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  function clearError() {
    setErrorMsg("");
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    clearError();
    setIsSubmitting(true);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      await login({ email: emailNormalized, password }, { signal: abortRef.current.signal });
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // Abort => ignore
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;

      const status = err?.response?.status;
      const data = err?.response?.data;

      if (status === 429) {
        setErrorMsg(data?.message || "Too many attempts. Please try again in a minute.");
      } else if (data?.message) {
        setErrorMsg(data.message); // includes 401 invalid credentials
      } else {
        setErrorMsg("Network error. Please check your connection and try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const baseInputStyle = {
    width: "100%",
    padding: 10,
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#0b1220",
    color: "white"
  };

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: 380, background: "#111827", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
        <h1 style={{ marginTop: 0, color: "white" }}>Login</h1>

        {errorMsg && (
          <div
            role="alert"
            style={{
              background: "#3b0a0a",
              border: "1px solid #7f1d1d",
              padding: 12,
              borderRadius: 10,
              marginBottom: 12,
              color: "white"
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <label style={{ display: "block", marginBottom: 6, color: "#cbd5e1" }} htmlFor="email">
            Email
          </label>
          <input
            id="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearError();
            }}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            inputMode="email"
            style={baseInputStyle}
          />

          <label
            style={{ display: "block", marginTop: 12, marginBottom: 6, color: "#cbd5e1" }}
            htmlFor="password"
          >
            Password
          </label>
          <input
            id="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            type="password"
            autoComplete="current-password"
            placeholder="••••••"
            style={baseInputStyle}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: "100%",
              marginTop: 14,
              padding: 10,
              borderRadius: 10,
              border: "none",
              background: canSubmit ? "#2563eb" : "#334155",
              color: "white",
              cursor: canSubmit ? "pointer" : "not-allowed"
            }}
          >
            {isSubmitting ? "Logging in…" : "Login"}
          </button>
        </form>

        <p style={{ marginTop: 14, opacity: 0.9, color: "#cbd5e1" }}>
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}