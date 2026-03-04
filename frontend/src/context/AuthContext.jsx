// frontend/src/context/AuthContext.jsx
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api/axios.js";
import { LS_TOKEN_KEY, LS_USER_KEY } from "../constants/storage.js";

/**
 * NOTE (intentional):
 * - axios.js has a request interceptor that attaches Authorization: Bearer <token>.
 * - We DO NOT duplicate that interceptor here in AuthContext.
 */

export const AuthContext = createContext(null);

function safeParseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(LS_TOKEN_KEY) || "");
  const [user, setUser] = useState(() => safeParseJson(localStorage.getItem(LS_USER_KEY)));
  const [isInitializing, setIsInitializing] = useState(true);

  const isLoggingOutRef = useRef(false);
  const lastSessionToastAtRef = useRef(0);

  const isAuthenticated = useMemo(() => {
    return Boolean(token) && Boolean(user?.id || user?.email);
  }, [token, user]);

  const persistAuth = useCallback((nextToken, nextUser) => {
    if (nextToken) localStorage.setItem(LS_TOKEN_KEY, nextToken);
    else localStorage.removeItem(LS_TOKEN_KEY);

    if (nextUser) localStorage.setItem(LS_USER_KEY, JSON.stringify(nextUser));
    else localStorage.removeItem(LS_USER_KEY);
  }, []);

  const logout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      setToken("");
      setUser(null);
      persistAuth("", null);
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 0);
    }
  }, [persistAuth]);

  const login = useCallback(
    async ({ email, password }, options = {}) => {
      const payload = { email: String(email || "").trim(), password: String(password || "") };

      const res = await api.post("/auth/login", payload, { timeout: 15000, ...options });

      const nextToken = res?.data?.token;
      const nextUser = res?.data?.user;

      if (!nextToken || !nextUser) {
        throw new Error("Invalid login response shape: missing user/token.");
      }

      setToken(nextToken);
      setUser(nextUser);
      persistAuth(nextToken, nextUser);

      return { user: nextUser, token: nextToken };
    },
    [persistAuth]
  );

  const register = useCallback(
    async ({ email, username, password }, options = {}) => {
      const payload = {
        email: String(email || "").trim(),
        username: String(username || "").trim(),
        password: String(password || "")
      };

      const res = await api.post("/auth/register", payload, { timeout: 15000, ...options });

      const nextToken = res?.data?.token;
      const nextUser = res?.data?.user;

      if (!nextToken || !nextUser) {
        throw new Error("Invalid register response shape: missing user/token.");
      }

      setToken(nextToken);
      setUser(nextUser);
      persistAuth(nextToken, nextUser);

      return { user: nextUser, token: nextToken };
    },
    [persistAuth]
  );

  /**
   * Bootstrap session:
   * - If no token: done.
   * - If token: hydrate from localStorage, then verify via /auth/me.
   * - If /auth/me returns 401/403: clear auth.
   * - If /auth/me fails (network/unknown): if no cached user, clear auth to avoid loops.
   */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const existingToken = localStorage.getItem(LS_TOKEN_KEY) || "";
        const cachedUser = safeParseJson(localStorage.getItem(LS_USER_KEY));

        if (!existingToken) {
          if (!cancelled) {
            setToken("");
            setUser(null);
          }
          return;
        }

        if (!cancelled) {
          setToken(existingToken);
          if (cachedUser) setUser(cachedUser);
        }

        try {
          const res = await api.get("/auth/me", { timeout: 15000 });

          const me = res?.data?.user;
          if (!me) throw new Error("Invalid /auth/me response shape: missing user.");

          if (!cancelled) {
            setUser(me);
            persistAuth(existingToken, me);
          }
        } catch (err) {
          const status = err?.response?.status;

          if (status === 401 || status === 403) {
            if (!cancelled) {
              setToken("");
              setUser(null);
              persistAuth("", null);
            }
          } else {
            if (!cachedUser && !cancelled) {
              setToken("");
              setUser(null);
              persistAuth("", null);
            }
          }
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [persistAuth]);

  /**
   * Multi-tab sync:
   * If auth changes in another tab (login/logout), update this tab's state immediately.
   */
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== LS_TOKEN_KEY && e.key !== LS_USER_KEY) return;

      const nextToken = localStorage.getItem(LS_TOKEN_KEY) || "";
      const nextUser = safeParseJson(localStorage.getItem(LS_USER_KEY));

      setToken(nextToken);
      setUser(nextUser);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /**
   * Global 401/403 handling:
   * Only auto-logout if a token exists, to avoid impacting bad login attempts.
   * Show a single toast with cooldown to avoid spam.
   */
  useEffect(() => {
    const id = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const status = error?.response?.status;
        const currentToken = localStorage.getItem(LS_TOKEN_KEY);

        if ((status === 401 || status === 403) && currentToken && !isLoggingOutRef.current) {
          const now = Date.now();
          if (now - lastSessionToastAtRef.current > 3000) {
            lastSessionToastAtRef.current = now;
            toast.error("Session expired. Please log in again.");
          }

          await logout();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(id);
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user,
      token,
      isAuthenticated,
      isInitializing,
      login,
      register,
      logout
    }),
    [user, token, isAuthenticated, isInitializing, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}