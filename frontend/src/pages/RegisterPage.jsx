// frontend/src/pages/RegisterPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
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

const HERO_BG_URL =
  "https://images.unsplash.com/photo-1762241766558-c90eb6ba25ff?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzY2VuaWMlMjB0cmF2ZWwlMjBsYW5kc2NhcGUlMjBzdW5zZXQlMjBtb3VudGFpbnMlMjByb2FkfGVufDF8fHx8MTc3MjM5MDg4MXww&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";

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

      toast.success("Account created!");
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

  const generalError = fieldErrors?.general;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="min-h-screen grid grid-rows-2 lg:grid-cols-2 lg:grid-rows-1">
        <div
          className="relative min-h-[50vh] lg:min-h-screen"
          style={{
            backgroundImage: `url(${HERO_BG_URL})`,
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/30 to-slate-900/10" />

          <div className="relative h-full p-6 sm:p-10 pb-16 sm:pb-24 flex flex-col justify-end">
            <div className="max-w-md">
              <div className="inline-flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-6 w-6 text-white"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 21s7-4.5 7-11a7 7 0 10-14 0c0 6.5 7 11 7 11z" />
                    <path d="M12 10.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                  </svg>
                </div>

                <div className="text-white text-3xl sm:text-4xl font-semibold tracking-tight">
                  Travel Journal
                </div>
              </div>

              <p className="mt-3 sm:mt-4 text-white/90 text-base sm:text-lg leading-relaxed">
                Map your adventures, share your stories, and relive every moment of your journey around the world.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center px-4 py-6 lg:py-10">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6 sm:p-8">
              <div className="flex items-center justify-center">
                <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-6 w-6 text-emerald-600"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M12 3l7 7-7 11-7-11 7-7z" />
                    <path d="M12 8l3 3-3 5-3-5 3-3z" />
                  </svg>
                </div>
              </div>

              <h1 className="mt-5 text-center text-3xl font-semibold text-slate-900">
                Create Account
              </h1>
              <p className="mt-2 text-center text-slate-500">Start your journey with us today</p>

              {(generalError || errorMsg) && (
                <div
                  role="alert"
                  className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm"
                >
                  {generalError || errorMsg}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
                {/* Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <div className="mt-2 relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 6h16v12H4z" />
                        <path d="M4 7l8 6 8-6" />
                      </svg>
                    </span>

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
                      placeholder="your.email@example.com"
                      inputMode="email"
                      aria-invalid={Boolean(fieldErrors.email)}
                      aria-describedby={fieldErrors.email ? "email-error" : undefined}
                      className={[
                        "w-full rounded-xl bg-slate-50 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none border",
                        fieldErrors.email
                          ? "border-rose-300 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                          : "border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                      ].join(" ")}
                    />
                  </div>

                  {fieldErrors.email && (
                    <div id="email-error" className="mt-2 text-sm text-rose-600">
                      {fieldErrors.email}
                    </div>
                  )}
                </div>

                {/* Username */}
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-slate-700">
                    Username
                  </label>

                  <div className="mt-2 relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M20 21a8 8 0 10-16 0" />
                        <path d="M12 11a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                    </span>

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
                      placeholder="Choose a username"
                      maxLength={20}
                      aria-invalid={Boolean(fieldErrors.username)}
                      aria-describedby={
                        fieldErrors.username
                          ? "username-error"
                          : usernameHint
                            ? "username-hint"
                            : undefined
                      }
                      className={[
                        "w-full rounded-xl bg-slate-50 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none border",
                        fieldErrors.username
                          ? "border-rose-300 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                          : "border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                      ].join(" ")}
                    />
                  </div>

                  {fieldErrors.username && (
                    <div id="username-error" className="mt-2 text-sm text-rose-600">
                      {fieldErrors.username}
                    </div>
                  )}

                  {!fieldErrors.username &&
                    usernameTrimmed.length > 0 &&
                    !usernameOk &&
                    usernameHint && (
                      <div id="username-hint" className="mt-2 text-sm text-amber-600">
                        {usernameHint}
                      </div>
                    )}
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>

                  <div className="mt-2 relative">
                    <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-5 w-5"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M7 11V8a5 5 0 0110 0v3" />
                        <path d="M6 11h12v10H6z" />
                      </svg>
                    </span>

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
                      placeholder="Create a strong password"
                      aria-invalid={Boolean(fieldErrors.password)}
                      aria-describedby={
                        fieldErrors.password
                          ? "password-error"
                          : password.length > 0 && password.length < 6
                            ? "password-hint"
                            : undefined
                      }
                      className={[
                        "w-full rounded-xl bg-slate-50 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none border",
                        fieldErrors.password
                          ? "border-rose-300 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                          : "border-slate-200 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-200"
                      ].join(" ")}
                    />
                  </div>

                  {fieldErrors.password && (
                    <div id="password-error" className="mt-2 text-sm text-rose-600">
                      {fieldErrors.password}
                    </div>
                  )}

                  {!fieldErrors.password && password.length > 0 && password.length < 6 && (
                    <div id="password-hint" className="mt-2 text-sm text-amber-600">
                      Password must be at least 6 characters
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    "w-full rounded-xl py-3 font-semibold text-white transition",
                    canSubmit ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-300 cursor-not-allowed"
                  ].join(" ")}
                >
                  {isSubmitting ? "Creating account…" : "Register"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Already have an account?{" "}
                <Link className="font-semibold text-emerald-600 hover:text-emerald-700" to="/login">
                  Login
                </Link>
              </p>

              <p className="mt-6 text-center text-xs text-slate-400">
                By signing up, you agree to our{" "}
                <span className="underline underline-offset-2">Terms of Service</span> and{" "}
                <span className="underline underline-offset-2">Privacy Policy</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}