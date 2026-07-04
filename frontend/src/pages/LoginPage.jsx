// frontend/src/pages/LoginPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
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

const HERO_BG_URL =
  "https://images.unsplash.com/photo-1762118817730-955d832b2cb7?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxhZXJpYWwlMjBiZWFjaCUyMHRyb3BpY2FsJTIwaXNsYW5kJTIwdHVycXVvaXNlJTIwd2F0ZXJ8ZW58MXx8fHwxNzcyMzgwNDg0fDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral";


function LoginLocationIcon({ className = "h-8 w-8" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 21s6.8-4.6 6.8-10.8a6.8 6.8 0 1 0-13.6 0C5.2 16.4 12 21 12 21Z" />
      <circle cx="12" cy="10.2" r="2.35" />
    </svg>
  );
}

function getInputClass(hasError = false) {
  return [
    "w-full rounded-full border bg-white px-12 py-2.5 pr-12 text-sm text-slate-900 shadow-[0_12px_32px_rgba(15,23,42,0.07)] outline-none transition-all duration-300 placeholder:text-slate-400 focus:ring-0 sm:px-14 sm:py-2.5 sm:text-base",
    hasError
      ? "border-rose-300 hover:border-rose-300 focus:border-rose-300 focus:bg-rose-50 focus:shadow-[0_18px_42px_rgba(225,29,72,0.18)]"
      : "border-slate-200 hover:border-slate-300 hover:shadow-[0_16px_36px_rgba(15,118,110,0.22)] focus:border-slate-400 focus:bg-[#eff7f6] focus:shadow-[0_22px_52px_rgba(15,118,110,0.44)]"
  ].join(" ");
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

  const redirectTo = useMemo(() => {
    const from = location.state?.from;
    return from?.pathname ? `${from.pathname}${from.search || ""}${from.hash || ""}` : "/profile";
  }, [location.state]);

  const emailNormalized = useMemo(() => normalizeEmailForApi(email), [email]);
  const emailOk = useMemo(() => isValidEmail(emailNormalized), [emailNormalized]);
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
    let didNavigate = false;

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      await login({ email: emailNormalized, password }, { signal: abortRef.current.signal });
      toast.success("Welcome back!");

      didNavigate = true;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;

      const status = err?.response?.status;
      const data = err?.response?.data;

      if (status === 429) {
        setErrorMsg(data?.message || "Too many attempts. Please try again in a minute.");
      } else if (data?.message) {
        setErrorMsg(data.message);
      } else {
        setErrorMsg("Network error. Please check your connection and try again.");
      }
    } finally {
      if (!didNavigate) {
        setIsSubmitting(false);
      }
    }
  }

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

        <div className="flex items-center justify-center bg-[#eff7f6] px-4 py-4 lg:py-6 xl:py-8">
          <div className="w-full max-w-md">
            <div className="rounded-[30px] border border-cyan-100/80 bg-white p-5 shadow-[0_18px_42px_rgba(8,145,178,0.12),0_0_34px_rgba(16,185,129,0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_22px_52px_rgba(8,145,178,0.18),0_0_46px_rgba(16,185,129,0.16)] focus-within:-translate-y-0.5 focus-within:border-cyan-200 focus-within:ring-4 focus-within:ring-cyan-200/55 focus-within:shadow-[0_22px_52px_rgba(15,118,110,0.30),0_0_42px_rgba(16,185,129,0.22)] sm:p-6">
              <div className="flex items-center justify-center">
                <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[20px] bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-[0_18px_42px_rgba(8,145,178,0.28),0_0_34px_rgba(16,185,129,0.20)] ring-4 ring-cyan-50">
                  <LoginLocationIcon className="h-7 w-7" />
                </div>
              </div>

              <h1 className="mt-4 text-center text-3xl font-extrabold leading-[1.02] tracking-[-0.035em] text-slate-950 sm:text-4xl">
                Welcome Back
              </h1>
              <p className="mt-2 text-center text-sm font-semibold leading-6 text-slate-500">
                Sign in to continue your adventure
              </p>

              {errorMsg && (
                <div
                  role="alert"
                  className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-rose-800 text-sm"
                >
                  {errorMsg}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="mt-5 space-y-3">
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                    Email
                  </label>

                  <div className="group mt-2 relative">
                  <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-slate-400 transition-colors duration-300 group-focus-within:text-cyan-600">
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
                        clearError();
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="your.email@example.com"
                      inputMode="email"
                      className={getInputClass(false)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>

                  <div className="group mt-2 relative">
                  <span className="pointer-events-none absolute inset-y-0 left-5 flex items-center text-slate-400 transition-colors duration-300 group-focus-within:text-cyan-600">
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
                        clearError();
                      }}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className={getInputClass(false)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    "inline-flex min-h-[56px] w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold text-white transition-all duration-300 focus:outline-none active:translate-y-0 sm:text-base",
                    canSubmit
                      ? "bg-gradient-to-r from-cyan-700 via-teal-600 to-emerald-600 shadow-[0_18px_46px_rgba(8,145,178,0.34),0_0_34px_rgba(16,185,129,0.26)] hover:-translate-y-0.5 hover:shadow-[0_24px_60px_rgba(8,145,178,0.48),0_0_46px_rgba(16,185,129,0.40)] focus:-translate-y-0.5 focus:ring-4 focus:ring-teal-300/55 focus:shadow-[0_0_0_7px_rgba(45,212,191,0.24),0_26px_68px_rgba(8,145,178,0.52),0_0_52px_rgba(16,185,129,0.45)]"
                      : "cursor-not-allowed bg-slate-300 shadow-none"
                  ].join(" ")}
                >
                  {isSubmitting ? "Logging in…" : "Login"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-slate-600">
                Don&apos;t have an account?{" "}
                <Link className="font-extrabold text-teal-700 transition hover:text-teal-800" to="/register">
                  Register
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}