// frontend/src/pages/ProfilePage.jsx
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getOwnProfile, deleteOwnProfile } from "../api/users.js";
import OwnProfile from "../components/profile/OwnProfile.jsx";
import ActionDialog from "../components/posts/ActionDialog.jsx";
import { useAuth } from "../hooks/useAuth.js";

function ProfileLoadingSkeleton() {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-7xl animate-pulse px-4 py-5 lg:px-6 lg:py-6">
        <div className="rounded-[32px] bg-slate-200 px-6 py-10 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <div className="h-24 w-24 rounded-full bg-slate-100" />
            <div className="min-w-0 flex-1">
              <div className="h-10 w-64 rounded-2xl bg-slate-100" />
              <div className="mt-3 h-5 w-52 rounded-xl bg-slate-100" />
              <div className="mt-4 flex flex-wrap gap-3">
                <div className="h-9 w-32 rounded-full bg-slate-100" />
                <div className="h-9 w-32 rounded-full bg-slate-100" />
                <div className="h-9 w-32 rounded-full bg-slate-100" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-6">
            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <div className="h-5 w-32 rounded-xl bg-slate-200" />
              <div className="mt-5 space-y-4">
                <div className="h-14 rounded-2xl bg-slate-100" />
                <div className="h-14 rounded-2xl bg-slate-100" />
                <div className="h-14 rounded-2xl bg-slate-100" />
              </div>
            </div>

            <div className="rounded-[28px] bg-white p-6 shadow-sm">
              <div className="h-5 w-32 rounded-xl bg-slate-200" />
              <div className="mt-4 h-5 w-2/3 rounded-xl bg-slate-100" />
              <div className="mt-5 h-11 w-36 rounded-2xl bg-slate-100" />
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <div className="h-5 w-28 rounded-xl bg-slate-200" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 8 }).map((_, idx) => (
                <div key={idx} className="h-28 rounded-[24px] bg-slate-100" />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <div className="h-5 w-32 rounded-xl bg-slate-200" />
              <div className="mt-3 h-9 w-48 rounded-2xl bg-slate-100" />
            </div>
            <div className="h-11 w-36 rounded-2xl bg-slate-100" />
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="overflow-hidden rounded-[28px] bg-white shadow-sm">
                <div className="h-52 bg-slate-100" />
                <div className="space-y-3 p-5">
                  <div className="h-5 w-40 rounded-xl bg-slate-100" />
                  <div className="h-8 w-3/4 rounded-xl bg-slate-200" />
                  <div className="h-4 w-full rounded-xl bg-slate-100" />
                  <div className="h-4 w-4/5 rounded-xl bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileErrorState({ message, onRetry }) {
  return (
    <div className="min-h-full bg-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-10 lg:px-6">
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">
            Profile
          </div>

          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Failed to load profile
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-600">{message}</p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Try Again
            </button>

            <Link
              to="/feed"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Back to Feed
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [status, setStatus] = useState("loading");
  const [profileData, setProfileData] = useState({
    user: null,
    stats: null,
    recentPosts: []
  });
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadAbortRef = useRef(null);
  const deleteAbortRef = useRef(null);

  const titleId = useId();
  const descriptionId = useId();

  const loadProfile = useCallback(async () => {
    if (loadAbortRef.current) {
      loadAbortRef.current.abort();
    }

    const controller = new AbortController();
    loadAbortRef.current = controller;

    setStatus("loading");
    setErrorMessage("");

    try {
      const data = await getOwnProfile({
        signal: controller.signal,
        timeout: 15000
      });

      setProfileData({
        user: data?.user ?? null,
        stats: data?.stats ?? null,
        recentPosts: Array.isArray(data?.recentPosts) ? data.recentPosts : []
      });
      setStatus("ready");
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      const httpStatus = err?.response?.status;

      if (httpStatus === 401 || httpStatus === 403) {
        navigate("/login", { replace: true });
        return;
      }

      if (!err?.response) {
        setErrorMessage("Failed to load profile, please try again");
      } else {
        setErrorMessage("Unable to load profile data");
      }

      setStatus("error");
    } finally {
      if (loadAbortRef.current === controller) {
        loadAbortRef.current = null;
      }
    }
  }, [navigate]);

  useEffect(() => {
    loadProfile();

    return () => {
      if (loadAbortRef.current) {
        loadAbortRef.current.abort();
      }

      if (deleteAbortRef.current) {
        deleteAbortRef.current.abort();
      }
    };
  }, [loadProfile]);

  const handleDeleteRequest = useCallback(() => {
    setDeleteOpen(true);
  }, []);

  const handleDeleteClose = useCallback(() => {
    if (isDeleting) return;
    setDeleteOpen(false);
  }, [isDeleting]);

  const handleDeleteConfirm = useCallback(async () => {
    if (isDeleting) return;

    if (deleteAbortRef.current) {
      deleteAbortRef.current.abort();
    }

    const controller = new AbortController();
    deleteAbortRef.current = controller;

    setIsDeleting(true);
    let didNavigate = false;

    try {
      await deleteOwnProfile({
        signal: controller.signal,
        timeout: 15000
      });

      const maybePromise = logout?.();
      if (maybePromise && typeof maybePromise.then === "function") {
        await maybePromise;
      }

      toast.success("Account deleted successfully");
      setDeleteOpen(false);
      didNavigate = true;
      navigate("/login", { replace: true });
    } catch (err) {
      if (
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED" ||
        err?.name === "AbortError"
      ) {
        return;
      }

      const httpStatus = err?.response?.status;
      const message = err?.response?.data?.message;

      if (httpStatus === 401 || httpStatus === 403) {
        setDeleteOpen(false);
        didNavigate = true;
        navigate("/login", { replace: true });
        return;
      }

      if (!err?.response) {
        toast.error("Connection failed. Please check your internet and try again.");
      } else if (httpStatus >= 500) {
        toast.error("Failed to delete account. Please try again later.");
      } else {
        toast.error(message || "Failed to delete account. Please try again later.");
      }
    } finally {
      if (!didNavigate) {
        setIsDeleting(false);
      }

      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
      }
    }
  }, [isDeleting, logout, navigate]);

  if (status === "loading") {
    return <ProfileLoadingSkeleton />;
  }

  if (status === "error") {
    return <ProfileErrorState message={errorMessage} onRetry={loadProfile} />;
  }

  return (
    <>
      <OwnProfile
        user={profileData.user}
        stats={profileData.stats}
        recentPosts={profileData.recentPosts}
        onDeleteRequest={handleDeleteRequest}
        deleteDisabled={isDeleting}
      />

      <ActionDialog
        open={deleteOpen}
        busy={isDeleting}
        tone="danger"
        title="Delete your account?"
        message="This action cannot be undone. All your posts, images, and data will be permanently deleted."
        confirmLabel="Delete Account"
        confirmBusyLabel="Deleting..."
        cancelLabel="Cancel"
        titleId={titleId}
        descriptionId={descriptionId}
        onClose={handleDeleteClose}
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}