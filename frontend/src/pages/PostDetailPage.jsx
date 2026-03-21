// frontend/src/pages/PostDetailPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";

import { deletePostById, getPostById } from "../api/posts.js";
import DeletePostDialog from "../components/posts/DeletePostDialog.jsx";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

function wasEdited(post) {
  if (!post?.createdAt || !post?.updatedAt) return false;
  const created = new Date(post.createdAt).getTime();
  const updated = new Date(post.updatedAt).getTime();
  if (!Number.isFinite(created) || !Number.isFinite(updated)) return false;
  return Math.abs(updated - created) > 1000;
}

function getSentimentUi(sentiment) {
  switch (sentiment) {
    case "positive":
      return {
        emoji: "😊",
        label: "Positive experience",
        badge: "bg-emerald-50 text-emerald-700 ring-emerald-200"
      };
    case "negative":
      return {
        emoji: "😞",
        label: "Negative experience",
        badge: "bg-rose-50 text-rose-700 ring-rose-200"
      };
    default:
      return {
        emoji: "😐",
        label: "Neutral experience",
        badge: "bg-amber-50 text-amber-700 ring-amber-200"
      };
  }
}

function getPrivacyUi(privacy) {
  if (privacy === "public") {
    return {
      icon: "🌍",
      label: "Public"
    };
  }
  return {
    icon: "🔒",
    label: "Private"
  };
}

function optimizeCloudinaryUrl(secureUrl, variant = "full") {
  if (typeof secureUrl !== "string" || !secureUrl.includes("/upload/")) {
    return secureUrl;
  }

  const transform =
    variant === "thumb"
      ? "c_fill,w_900,h_560,g_auto,f_auto,q_auto"
      : "c_limit,w_1600,f_auto,q_auto";

  return secureUrl.replace("/upload/", `/upload/${transform}/`);
}

function EmptyStateCard({ title, message }) {
  return (
    <div className="mx-auto max-w-4xl p-6 lg:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-slate-600">{message}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/map"
            className="inline-flex items-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Back to Map
          </Link>
          <Link
            to="/feed"
            className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Go to Feed
          </Link>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <div className="animate-pulse space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="h-8 w-2/3 rounded-xl bg-slate-200" />
          <div className="mt-3 h-5 w-1/3 rounded-xl bg-slate-100" />
          <div className="mt-6 h-10 w-40 rounded-2xl bg-slate-100" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="h-6 w-40 rounded-xl bg-slate-200" />
            <div className="mt-4 h-32 rounded-2xl bg-slate-100" />
            <div className="mt-3 h-5 w-1/2 rounded-xl bg-slate-100" />
            <div className="mt-3 h-5 w-3/4 rounded-xl bg-slate-100" />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="h-[320px] rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Lightbox({ images, currentIndex, onClose, onPrev, onNext, title }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (currentIndex < 0) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev?.();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNext?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [currentIndex, onClose, onPrev, onNext]);

  if (currentIndex < 0 || !Array.isArray(images) || !images[currentIndex]) return null;

  const image = images[currentIndex];

  return (
    <div
      className="fixed inset-0 z-[1500] flex items-center justify-center bg-black/90 px-4 py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-6xl flex-col outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close image viewer"
          className="absolute right-0 top-0 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          ✕
        </button>

        <div className="mx-auto flex max-h-[85vh] w-full items-center justify-center">
          <img
            src={optimizeCloudinaryUrl(image.secureUrl, "full")}
            alt={title ? `${title} image ${currentIndex + 1}` : `Post image ${currentIndex + 1}`}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain"
          />
        </div>

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous image"
              className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white transition hover:bg-white/20"
            >
              ←
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Next image"
              className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-white transition hover:bg-white/20"
            >
              →
            </button>
          </>
        )}

        <div className="mt-4 text-center text-sm text-white/80">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}

export default function PostDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [post, setPost] = useState(null);
  const [status, setStatus] = useState("loading");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(-1);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    async function loadPost() {
      setStatus("loading");

      try {
        const nextPost = await getPostById(id, {
          signal: abortController.signal
        });

        if (cancelled) return;
        setPost(nextPost);
        setStatus("ready");
      } catch (err) {
        if (
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED" ||
          err?.name === "AbortError"
        ) {
          return;
        }

        if (cancelled) return;

        const httpStatus = err?.response?.status;
        if (httpStatus === 404) {
          setStatus("notfound");
        } else {
          setStatus("error");
        }
      }
    }

    loadPost();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [id]);

  const sentimentUi = useMemo(() => getSentimentUi(post?.sentiment), [post?.sentiment]);
  const privacyUi = useMemo(() => getPrivacyUi(post?.privacy), [post?.privacy]);

  async function handleDelete() {
    if (!post?.id || isDeleting) return;

    setIsDeleting(true);

    try {
      await deletePostById(post.id);
      toast.success("Post deleted successfully.");
      setDeleteOpen(false);
      navigate("/map", { replace: true });
    } catch (err) {
      const httpStatus = err?.response?.status;
      const message = err?.response?.data?.message;

      if (httpStatus === 404) {
        toast.error("This post doesn't exist or has already been deleted.");
        setDeleteOpen(false);
        navigate("/map", { replace: true });
        return;
      }

      toast.error(message || "Failed to delete post. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (status === "loading") {
    return <LoadingSkeleton />;
  }

  if (status === "notfound") {
    return (
      <EmptyStateCard
        title="Post not found"
        message="This post doesn't exist or has been deleted."
      />
    );
  }

  if (status === "error") {
    return (
      <EmptyStateCard
        title="Failed to load post"
        message="We couldn't load this post right now. Please try again."
      />
    );
  }

  const images = Array.isArray(post?.images) ? post.images : [];
  const hasImages = images.length > 0;

  return (
    <>
      <div className="mx-auto max-w-6xl p-6 lg:p-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {privacyUi.icon} {privacyUi.label}
                  </span>

                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.badge}`}
                  >
                    <span aria-hidden="true">{sentimentUi.emoji}</span>
                    <span>{sentimentUi.label}</span>
                  </span>
                </div>

                <h1 className="mt-4 break-words text-3xl font-semibold tracking-tight text-slate-900 lg:text-4xl">
                  {post.title}
                </h1>

                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span aria-hidden="true">📍</span>
                    <span className="min-w-0 break-words">{post.locationName}</span>
                  </span>

                  <span>Posted on {formatDate(post.createdAt)}</span>

                  {wasEdited(post) && <span>Last edited on {formatDateTime(post.updatedAt)}</span>}
                </div>
              </div>

              {post.isOwner && (
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    ✏️ Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="inline-flex items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
                    aria-label="Delete post"
                  >
                    🗑️ Delete
                  </button>
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
              <h2 className="text-lg font-semibold text-slate-900">Your story</h2>

              <div className="mt-4 min-w-0 break-words whitespace-pre-line text-[15px] leading-7 text-slate-700">
                {post.content}
              </div>

              {hasImages && (
                <div className="mt-8">
                  <h3 className="text-base font-semibold text-slate-900">Photos</h3>

                  <div
                    className={[
                      "mt-4 grid gap-3",
                      images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
                    ].join(" ")}
                  >
                    {images.map((image, index) => (
                      <button
                        key={image.id ?? image.publicId ?? index}
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
                      >
                        <img
                          src={optimizeCloudinaryUrl(image.secureUrl, "thumb")}
                          alt={`${post.title} image ${index + 1}`}
                          className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">
                <div>Posted on {formatDateTime(post.createdAt)}</div>
                {wasEdited(post) && <div className="mt-1">Last edited on {formatDateTime(post.updatedAt)}</div>}
              </div>
            </section>

            <aside className="min-w-0 space-y-6">
              <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-6 py-4">
                  <div className="text-base font-semibold text-slate-900">Location</div>
                  <div className="mt-1 break-words text-sm text-slate-500">
                    {post.city || post.country
                      ? [post.city, post.country].filter(Boolean).join(", ")
                      : post.locationName}
                  </div>
                </div>

                <div className="h-[320px]">
                  <MapContainer
                    center={[post.latitude, post.longitude]}
                    zoom={13}
                    scrollWheelZoom
                    className="h-full w-full"
                  >
                    <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
                    <Marker position={[post.latitude, post.longitude]} />
                  </MapContainer>
                </div>

                <div className="px-6 py-4 text-sm text-slate-600">
                  {Number(post.latitude).toFixed(5)}, {Number(post.longitude).toFixed(5)}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="text-base font-semibold text-slate-900">Actions</div>

                <div className="mt-4 flex flex-col gap-3">
                  <Link
                    to="/map"
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
                  >
                    Back to Map
                  </Link>

                  <Link
                    to="/feed"
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Go to Feed
                  </Link>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>

      <DeletePostDialog
        open={deleteOpen}
        postTitle={post?.title}
        isDeleting={isDeleting}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <Lightbox
        images={images}
        currentIndex={lightboxIndex}
        title={post?.title}
        onClose={() => setLightboxIndex(-1)}
        onPrev={() => {
          if (!images.length) return;
          setLightboxIndex((prev) => (prev <= 0 ? images.length - 1 : prev - 1));
        }}
        onNext={() => {
          if (!images.length) return;
          setLightboxIndex((prev) => (prev >= images.length - 1 ? 0 : prev + 1));
        }}
      />
    </>
  );
}