// frontend/src/pages/PostDetailPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";

import { deletePostById, getPostById } from "../api/posts.js";
import DeletePostDialog from "../components/posts/DeletePostDialog.jsx";
import { formatSentimentScore, getSentimentUi } from "../utils/sentimentUi.js";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import {
  buildCloudinarySrcSet,
  makeCloudinaryOptimizer
} from "../utils/cloudinaryImage.js";
import { getPlaceCategoryUi } from "../utils/placeCategoryUi.js";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';


const LIGHTBOX_SWIPE_THRESHOLD_PX = 56;

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

function normalizeVerificationConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;

  const normalized = numeric >= 0 && numeric <= 1 ? numeric * 100 : numeric;
  return Math.round(normalized);
}


function getPhotoVerificationUi(photoVerification) {
  if (!photoVerification || !photoVerification.status || photoVerification.status === "skipped") {
    return null;
  }

  const confidence = normalizeVerificationConfidence(photoVerification.confidence);

  if (photoVerification.status === "match") {
    return {
      type: "match",
      label:
        confidence != null
          ? `Photo verified for this location • ${confidence}% confidence`
          : "Photo verified for this location"
    };
  }

  if (photoVerification.status === "uncertain") {
    return {
      type: "uncertain",
      label:
        confidence != null
          ? `Photo check inconclusive • ${confidence}% confidence`
          : "Photo check inconclusive"
    };
  }

  return null;
}

const optimizeCloudinaryUrl = makeCloudinaryOptimizer(
  {
    thumb: "c_fill,g_auto,w_900,h_560,f_auto,q_auto",
    detail: "c_limit,w_1440,f_auto,q_auto",
    lightbox: "c_limit,w_2000,f_auto,q_auto",
    full: "c_limit,w_1600,f_auto,q_auto"
  },
  "full"
);

function getThumbSizes(imageCount) {
  if (imageCount <= 1) {
    return "(max-width: 640px) 100vw, (max-width: 1280px) 70vw, 900px";
  }

  return "(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 560px";
}

function getLightboxSizes() {
  return "100vw";
}

function getStorySectionTitle(post) {
  if (post?.isOwner) {
    return "Your story";
  }

  const username = String(post?.username || "").trim();
  if (!username) {
    return "Traveler story";
  }

  return `${username}'s story`;
}

function EmptyStateCard({ title, message }) {
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-3 text-slate-600">{message}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/map"
            className="inline-flex min-h-11 items-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Back to Map
          </Link>
          <Link
            to="/feed"
            className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
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
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <div className="animate-pulse space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="h-8 w-2/3 rounded-xl bg-slate-200" />
          <div className="mt-3 h-5 w-1/3 rounded-xl bg-slate-100" />
          <div className="mt-6 h-10 w-40 rounded-2xl bg-slate-100" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
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
  const touchStartXRef = useRef(null);
  const touchDeltaXRef = useRef(0);

  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);

  useEffect(() => {
    onCloseRef.current = onClose;
    onPrevRef.current = onPrev;
    onNextRef.current = onNext;
  }, [onClose, onPrev, onNext]);

  const activeImage =
  currentIndex >= 0 && Array.isArray(images) ? images[currentIndex] : null;

  const isLightboxOpen = Boolean(activeImage);

  useEffect(() => {
    if (!isLightboxOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;

    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const currentPaddingRight =
      Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;

    document.body.style.overflow = "hidden";

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${currentPaddingRight + scrollbarWidth}px`;
    }

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPrevRef.current?.();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        onNextRef.current?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isLightboxOpen]);

  if (!activeImage) return null;
  if (typeof document === "undefined") return null;

  const image = activeImage;
  const alt = title ? `${title} image ${currentIndex + 1}` : `Post image ${currentIndex + 1}`;
  const srcSet = buildCloudinarySrcSet(image.secureUrl, {
    widths: [640, 960, 1280, 1600, 2000],
    crop: "limit"
  });

  function handleTouchStart(e) {
    const touch = e.touches?.[0];
    if (!touch) return;
    touchStartXRef.current = touch.clientX;
    touchDeltaXRef.current = 0;
  }

  function handleTouchMove(e) {
    const touch = e.touches?.[0];
    if (!touch || touchStartXRef.current == null) return;
    touchDeltaXRef.current = touch.clientX - touchStartXRef.current;
  }

  function handleTouchEnd() {
    const deltaX = touchDeltaXRef.current;
    touchStartXRef.current = null;
    touchDeltaXRef.current = 0;

    if (Math.abs(deltaX) < LIGHTBOX_SWIPE_THRESHOLD_PX) {
      return;
    }

    if (deltaX > 0) {
      onPrev?.();
    } else {
      onNext?.();
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 px-3 py-4 sm:px-4 sm:py-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
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

        <div
          className="mx-auto flex max-h-[85vh] w-full items-center justify-center overflow-auto rounded-2xl"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: "pan-y pinch-zoom" }}
        >
          <img
            src={optimizeCloudinaryUrl(image.secureUrl, "lightbox")}
            srcSet={srcSet}
            sizes={getLightboxSizes()}
            alt={alt}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            draggable={false}
            className="max-h-[85vh] max-w-full rounded-2xl object-contain select-none"
          />
        </div>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous image"
              className="absolute left-0 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"
            >
              ←
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Next image"
              className="absolute right-0 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 px-3 py-3 text-white transition hover:bg-white/20"
            >
              →
            </button>
          </>
        ) : null}

        <div className="mt-4 text-center text-sm text-white/80">
          {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ResponsivePostImage({ image, index, title, imageCount, onOpen }) {
  const alt = title ? `${title} image ${index + 1}` : `Post image ${index + 1}`;
  const srcSet = buildCloudinarySrcSet(image?.secureUrl, {
    widths: imageCount <= 1 ? [640, 960, 1280, 1440] : [480, 640, 960, 1200],
    crop: "fill",
    gravity: "auto",
    height: 560
  });

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-left"
      aria-label={`Open image ${index + 1} in full screen`}
    >
      <img
        src={optimizeCloudinaryUrl(image?.secureUrl, "thumb")}
        srcSet={srcSet}
        sizes={getThumbSizes(imageCount)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-72 w-full object-cover transition duration-300 group-hover:scale-[1.02]"
      />
    </button>
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

        if (!nextPost) {
          setStatus("notfound");
          return;
        }

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

  const sentimentUi = useMemo(
    () => getSentimentUi(post?.sentiment, post?.sentimentScore, "detail"),
    [post?.sentiment, post?.sentimentScore]
  );
  const privacyUi = useMemo(() => getPrivacyUi(post?.privacy), [post?.privacy]);
  const placeCategoryUi = useMemo(
    () => getPlaceCategoryUi(post?.placeCategory),
    [post?.placeCategory]
  );
  const photoVerificationUi = useMemo(
    () => getPhotoVerificationUi(post?.photoVerification),
    [post?.photoVerification]
  );

  async function handleDelete() {
    if (!post?.id || isDeleting) return;

    setIsDeleting(true);
    let didNavigate = false;

    try {
      await deletePostById(post.id);
      toast.success("Post deleted successfully.");
      setDeleteOpen(false);
      didNavigate = true;
      navigate("/map", { replace: true });
    } catch (err) {
      const httpStatus = err?.response?.status;
      const message = err?.response?.data?.message;

      if (httpStatus === 404) {
        toast.error("This post doesn't exist or has already been deleted.");
        setDeleteOpen(false);
        didNavigate = true;
        navigate("/map", { replace: true });
        return;
      }

      toast.error(message || "Failed to delete post. Please try again.");
    } finally {
        if (!didNavigate) {
          setIsDeleting(false);
        }
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

  const images = Array.isArray(post?.images) ? post.images.filter((img) => img?.secureUrl) : [];
  const lat = Number(post?.latitude);
  const lng = Number(post?.longitude);
  const hasValidCoordinates =
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  lat >= -90 &&
  lat <= 90 &&
  lng >= -180 &&
  lng <= 180;
  const hasImages = images.length > 0;
  const storySectionTitle = getStorySectionTitle(post);

  return (
    <>
      <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    {privacyUi.icon} {privacyUi.label}
                  </span>

                  <span
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${sentimentUi.badge}`}
                  >
                    <span aria-hidden="true">{sentimentUi.emoji}</span>
                    <span>{sentimentUi.label}</span>
                  </span>

                  {post?.sentimentScore != null ? (
                    <span className="inline-flex min-h-9 items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      Score: {formatSentimentScore(post.sentimentScore)}
                    </span>
                  ) : null}

                  <span
                    className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${placeCategoryUi.badge}`}
                  >
                    <span aria-hidden="true">{placeCategoryUi.icon}</span>
                    <span>{placeCategoryUi.label}</span>
                  </span>
                </div>

                <h1 className="mt-4 break-words text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl lg:text-4xl">
                  {post.title}
                </h1>

                <div className="mt-3 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span aria-hidden="true">📍</span>
                    <span className="min-w-0 break-words">{post.locationName}</span>
                  </span>

                  <span>Posted on {formatDate(post.createdAt)}</span>

                  {wasEdited(post) ? (
                    <span>Last edited on {formatDateTime(post.updatedAt)}</span>
                  ) : null}
                </div>
              </div>

              {post.isOwner ? (
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Link
                    to={`/posts/${post.id}/edit`}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    ✏️ Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700"
                    aria-label="Delete post"
                  >
                    🗑️ Delete
                  </button>
                </div>
              ) : null}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 lg:p-8">
              <h2 className="text-lg font-semibold text-slate-900">{storySectionTitle}</h2>

              <div className="mt-4 min-w-0 break-words whitespace-pre-line text-[15px] leading-7 text-slate-700">
                {post.content}
              </div>

              {hasImages ? (
                <div className="mt-8">
                  <h3 className="text-base font-semibold text-slate-900">Photos</h3>

                  <div
                    className={[
                      "mt-4 grid gap-3",
                      images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
                    ].join(" ")}
                  >
                    {images.map((image, index) => (
                      <ResponsivePostImage
                        key={image.id ?? image.publicId ?? image.secureUrl ?? index}
                        image={image}
                        index={index}
                        title={post.title}
                        imageCount={images.length}
                        onOpen={setLightboxIndex}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 border-t border-slate-200 pt-6 text-sm text-slate-500">
                <div>Posted on {formatDateTime(post.createdAt)}</div>
                {wasEdited(post) ? (
                  <div className="mt-1">Last edited on {formatDateTime(post.updatedAt)}</div>
                ) : null}
              </div>
            </section>

            <aside className="min-w-0 space-y-6">
              <section className="relative z-0 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                  <div className="text-base font-semibold text-slate-900">Location</div>
                  <div className="mt-1 break-words text-sm text-slate-500">
                    {post.city || post.country
                      ? [post.city, post.country].filter(Boolean).join(", ")
                      : post.locationName}
                  </div>

                    <div className="mt-3 space-y-3">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${placeCategoryUi.badge}`}
                      >
                        <span aria-hidden="true">{placeCategoryUi.icon}</span>
                        <span>{placeCategoryUi.label}</span>
                      </span>

                      {photoVerificationUi?.type === "match" ? (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                            <span className="font-medium">✅ {photoVerificationUi.label}</span>
                          </div>
                        ) : post?.isOwner && photoVerificationUi?.type === "uncertain" ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                            <div className="font-medium text-slate-700">{photoVerificationUi.label}</div>
                          </div>
                        ) : null}
                    </div>
                </div>

                <div className="relative z-0 h-[300px] overflow-hidden sm:h-[320px]">
                {hasValidCoordinates ? (
                  <MapContainer
                    center={[lat, lng]}
                    zoom={13}
                    scrollWheelZoom
                    className="h-full w-full"
                  >
                    <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
                    <Marker position={[lat, lng]} />
                  </MapContainer>
                ) : (
                  <div className="flex h-full items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-500">
                    Map unavailable for this post because the saved coordinates are invalid.
                  </div>
                )}
              </div>

              <div className="px-5 py-4 text-sm text-slate-600 sm:px-6">
                {hasValidCoordinates ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "Coordinates unavailable"}
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
