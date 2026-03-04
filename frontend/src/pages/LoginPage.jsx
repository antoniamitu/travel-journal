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
    return from?.pathname ? `${from.pathname}${from.search || ""}${from.hash || ""}` : "/feed";
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

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      await login({ email: emailNormalized, password }, { signal: abortRef.current.signal });
      toast.success("Welcome back!");
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
      setIsSubmitting(false);
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

              <h1 className="mt-5 text-center text-3xl font-semibold text-slate-900">Welcome Back</h1>
              <p className="mt-2 text-center text-slate-500">Sign in to continue your adventure</p>

              {errorMsg && (
                <div
                  role="alert"
                  className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-800 text-sm"
                >
                  {errorMsg}
                </div>
              )}

              <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
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
                        clearError();
                      }}
                      type="email"
                      autoComplete="email"
                      placeholder="your.email@example.com"
                      inputMode="email"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                    />
                  </div>
                </div>

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
                        clearError();
                      }}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-10 py-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={[
                    "w-full rounded-xl py-3 font-semibold text-white transition",
                    canSubmit
                      ? "bg-gradient-to-r from-[oklch(43.7%_0.078_188.216)] to-[oklch(39.8%_0.07_227.392)] hover:opacity-90 hover:shadow-md"
                      : "bg-slate-300 cursor-not-allowed"
                  ].join(" ")}
                >
                  {isSubmitting ? "Logging in…" : "Login"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-slate-600">
                Don&apos;t have an account?{" "}
                <Link className="font-semibold text-emerald-600 hover:text-emerald-700" to="/register">
                  Register
                </Link>
              </p>

              <p className="mt-6 text-center text-xs text-slate-400">
                By signing in, you agree to our{" "}
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