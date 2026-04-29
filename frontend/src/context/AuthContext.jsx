// frontend/src/context/AuthContext.jsx
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { api } from "../api/axios.js";
import { LS_TOKEN_KEY, LS_USER_KEY } from "../constants/storage.js";
import { getStorageItem, removeStorageItem, setStorageItem } from "../utils/safeStorage.js";

export const AuthContext = createContext(null);

function safeParseJson(raw) {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

function getAuthRequestPath(error) {
  const rawUrl = String(error?.config?.url || "");

  try {
    const parsed = new URL(rawUrl, "http://local");
    return parsed.pathname.replace(/^\/api(?=\/)/, "");
  } catch {
    return rawUrl.split("?")[0].replace(/^\/api(?=\/)/, "");
  }
}

function shouldSkipGlobalUnauthorizedReset(error) {
  const path = getAuthRequestPath(error);

  return (
    path === "/auth/login" ||
    path === "/auth/register" ||
    path === "/auth/me"
  );
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStorageItem(LS_TOKEN_KEY) || "");
  const [user, setUser] = useState(() => safeParseJson(getStorageItem(LS_USER_KEY)));
  const [isInitializing, setIsInitializing] = useState(true);

  const isLoggingOutRef = useRef(false);
  const lastSessionToastAtRef = useRef(0);

  const persistAuth = useCallback((nextToken, nextUser) => {
  if (nextToken) {
    setStorageItem(LS_TOKEN_KEY, nextToken);
  } else {
    removeStorageItem(LS_TOKEN_KEY);
  }

  if (nextUser) {
    setStorageItem(LS_USER_KEY, JSON.stringify(nextUser));
  } else {
    removeStorageItem(LS_USER_KEY);
  }
  }, []);

  const clearAuthState = useCallback(() => {
    setToken("");
    setUser(null);
    persistAuth("", null);
  }, [persistAuth]);

  const showSessionExpiredToast = useCallback(() => {
    const now = Date.now();

    if (now - lastSessionToastAtRef.current < 3000) {
      return;
    }

    lastSessionToastAtRef.current = now;
    toast.error("Session expired. Please log in again.");
  }, []);

  const logout = useCallback(async () => {
    if (isLoggingOutRef.current) return;

    isLoggingOutRef.current = true;

    try {
      clearAuthState();
    } finally {
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 0);
    }
  }, [clearAuthState]);

  const forceSessionReset = useCallback(() => {
    if (!isLoggingOutRef.current) {
      isLoggingOutRef.current = true;
    }

    showSessionExpiredToast();
    clearAuthState();

    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 0);
  }, [clearAuthState, showSessionExpiredToast]);

  const login = useCallback(
    async ({ email, password }, options = {}) => {
      const payload = {
        email: String(email || "").trim(),
        password: String(password || "")
      };

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

useEffect(() => {
  let cancelled = false;
  const controller = new AbortController();

  async function init() {
    try {
      const existingToken = getStorageItem(LS_TOKEN_KEY) || "";
      const cachedUser = safeParseJson(getStorageItem(LS_USER_KEY));

      if (!existingToken) {
        if (!cancelled) {
          setToken("");
          setUser(null);
        }
        return;
      }

      if (!cancelled) {
        setToken(existingToken);
        if (cachedUser) {
          setUser(cachedUser);
        }
      }

      try {
        const res = await api.get("/auth/me", {
          timeout: 15000,
          signal: controller.signal
        });

        const me = res?.data?.user;

        if (!me) {
          throw new Error("Invalid /auth/me response shape: missing user.");
        }

        if (!cancelled) {
          setUser(me);
          persistAuth(existingToken, me);
        }
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (!cancelled && isUnauthorizedError(err)) {
          forceSessionReset();
        } else if (!cancelled && !cachedUser) {
          clearAuthState();
        }
      }
    } finally {
      if (!cancelled) {
        setIsInitializing(false);
      }
    }
  }

  init();

  return () => {
    cancelled = true;
    controller.abort();
  };
}, [persistAuth, clearAuthState, forceSessionReset]);

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== LS_TOKEN_KEY && e.key !== LS_USER_KEY) return;

      const nextToken = getStorageItem(LS_TOKEN_KEY) || "";
      const nextUser = safeParseJson(getStorageItem(LS_USER_KEY));

      setToken(nextToken);
      setUser(nextUser);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const currentToken = getStorageItem(LS_TOKEN_KEY);
        if (
          isUnauthorizedError(error) &&
          currentToken &&
          !isLoggingOutRef.current &&
          !shouldSkipGlobalUnauthorizedReset(error)
        ) {
          forceSessionReset();
        }

        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [forceSessionReset]);

  const isAuthenticated = useMemo(() => {
    return Boolean(token) && Boolean(user?.id || user?.email);
  }, [token, user]);

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