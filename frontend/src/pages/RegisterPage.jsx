// frontend/src/pages/RegisterPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import FullscreenLoader from "../components/ui/FullscreenLoader.jsx";
import { useAuth } from "../hooks/useAuth.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernameAllowedRegex = /^[a-zA-Z0-9._-]+$/;

function isValidEmail(v) {
  return typeof v === "string" && emailRegex.test(v);
}

function isValidUsername(v) {
  if (typeof v !== "string") return false;
  if (v.length < 3 || v.length > 20) return false;
  if (!/^[a-zA-Z0-9]/.test(v)) return false;
  if (!/[a-zA-Z0-9]$/.test(v)) return false;
  if (v.includes("..")) return false;
  if (!usernameAllowedRegex.test(v)) return false;
  return true;
}

function getUsernameHint(v) {
  const s = String(v || "");
  if (!s) return "";
  if (s.length < 3 || s.length > 20) return "Username must be 3-20 characters";
  if (!/^[a-zA-Z0-9]/.test(s)) return "Username must start with a letter or number";
  if (!/[a-zA-Z0-9]$/.test(s)) return "Username must end with a letter or number";
  if (s.includes("..")) return "Username cannot contain consecutive dots";
  if (!usernameAllowedRegex.test(s)) {
    return "Username can only contain letters, numbers, dot, underscore and hyphen";
  }
  return "";
}

function normalizeEmailForApi(input) {
  return String(input || "").trim().toLowerCase();
}

export default function RegisterPage() {
  const { register, isAuthenticated, isInitializing } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const abortRef = useRef(null);
  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const emailNormalized = useMemo(() => normalizeEmailForApi(email), [email]);
  const usernameTrimmed = useMemo(() => username.trim(), [username]);

  const emailOk = useMemo(() => isValidEmail(emailNormalized), [emailNormalized]);
  const usernameOk = useMemo(() => isValidUsername(usernameTrimmed), [usernameTrimmed]);
  const passwordOk = useMemo(() => password.length >= 6, [password]);

  const canSubmit = emailOk && usernameOk && passwordOk && !isSubmitting;
  const usernameHint = useMemo(() => getUsernameHint(usernameTrimmed), [usernameTrimmed]);

  if (isInitializing) return <FullscreenLoader width={380} />;
  if (isAuthenticated) return <Navigate to="/feed" replace />;

  function clearFieldError(key) {
    setFieldErrors((prev) => {
      if (!prev || typeof prev !== "object") return {};
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function clearGeneralErrors() {
    setErrorMsg("");
    clearFieldError("general");
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorMsg("");
    setFieldErrors({});
    setIsSubmitting(true);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      await register(
        { email: emailNormalized, username: usernameTrimmed, password },
        { signal: abortRef.current.signal }
      );

      navigate("/feed", { replace: true });
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;

      const status = err?.response?.status;
      const data = err?.response?.data;

      if (data?.errors && typeof data.errors === "object") {
        setFieldErrors(data.errors);
        setErrorMsg(data.message || "Validation failed");
        return;
      }

      if (status === 429) {
        setErrorMsg(data?.message || "Too many attempts. Please try again in a minute.");
        return;
      }

      if (data?.message) {
        setErrorMsg(data.message);
        return;
      }

      setErrorMsg("Network error. Please check your connection and try again.");
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

  const errorInputStyle = {
    ...baseInputStyle,
    border: "1px solid #7f1d1d"
  };

  const labelStyle = { display: "block", marginBottom: 6, color: "#cbd5e1" };
  const fieldErrorStyle = { color: "#f87171", fontSize: 13, marginTop: 4 };
  const hintStyle = { color: "#fbbf24", fontSize: 13, marginTop: 4 };

  const generalError = fieldErrors?.general;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div style={{ width: 380, background: "#111827", padding: 20, borderRadius: 12, border: "1px solid #334155" }}>
        <h1 style={{ marginTop: 0, color: "white" }}>Register</h1>

        {(generalError || errorMsg) && (
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
            {generalError || errorMsg}
          </div>
        )}

        <form onSubmit={onSubmit} noValidate>
          <label style={labelStyle} htmlFor="email">Email</label>
          <input
            id="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearGeneralErrors();
              clearFieldError("email");
            }}
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            inputMode="email"
            aria-invalid={Boolean(fieldErrors.email)}
            aria-describedby={fieldErrors.email ? "email-error" : undefined}
            style={fieldErrors.email ? errorInputStyle : baseInputStyle}
          />
          {fieldErrors.email && <div id="email-error" style={fieldErrorStyle}>{fieldErrors.email}</div>}

          <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              clearGeneralErrors();
              clearFieldError("username");
            }}
            type="text"
            autoComplete="username"
            placeholder="john.doe"
            maxLength={20}
            aria-invalid={Boolean(fieldErrors.username)}
            aria-describedby={fieldErrors.username ? "username-error" : usernameHint ? "username-hint" : undefined}
            style={fieldErrors.username ? errorInputStyle : baseInputStyle}
          />
          {fieldErrors.username && <div id="username-error" style={fieldErrorStyle}>{fieldErrors.username}</div>}
          {!fieldErrors.username && usernameTrimmed.length > 0 && !usernameOk && usernameHint && (
            <div id="username-hint" style={hintStyle}>{usernameHint}</div>
          )}

          <label style={{ ...labelStyle, marginTop: 12 }} htmlFor="password">Password</label>
          <input
            id="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearGeneralErrors();
              clearFieldError("password");
            }}
            type="password"
            autoComplete="new-password"
            placeholder="••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            aria-describedby={
              fieldErrors.password
                ? "password-error"
                : password.length > 0 && password.length < 6
                  ? "password-hint"
                  : undefined
            }
            style={fieldErrors.password ? errorInputStyle : baseInputStyle}
          />
          {fieldErrors.password && <div id="password-error" style={fieldErrorStyle}>{fieldErrors.password}</div>}
          {!fieldErrors.password && password.length > 0 && password.length < 6 && (
            <div id="password-hint" style={hintStyle}>Password must be at least 6 characters</div>
          )}

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
            {isSubmitting ? "Creating account…" : "Register"}
          </button>
        </form>

        <p style={{ marginTop: 14, opacity: 0.9, color: "#cbd5e1" }}>
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}