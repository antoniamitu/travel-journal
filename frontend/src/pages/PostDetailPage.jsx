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
      label: "Public",
      pill: "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-200"
    };
  }

  return {
    icon: "🔒",
    label: "Private",
    pill: "border-slate-200 bg-slate-50 text-slate-700 ring-slate-200"
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

function getAuthorName(post) {
  if (post?.isOwner) return "You";

  const username = String(post?.username || "").trim();
  return username || "Traveler";
}

function getAuthorHandle(post) {
  if (post?.isOwner) return "Your memory";

  const username = String(post?.username || "").trim();
  return username ? `@${username}` : "@traveler";
}

function getAuthorInitials(post) {
  const source = String(post?.username || post?.email || "T").trim();
  if (!source) return "T";

  const parts = source.replace(/[@._-]+/g, " ").split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getLocationDisplay(post) {
  const city = String(post?.city || "").trim();
  const country = String(post?.country || "").trim();

  if (city || country) {
    return [city, country].filter(Boolean).join(", ");
  }

  return String(post?.locationName || "Unknown location").trim();
}

function getSafeTitle(post) {
  return String(post?.title || "Untitled memory").trim();
}

function CalendarIcon({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3.5v3" />
      <path d="M16 3.5v3" />
      <path d="M3.5 10h17" />
    </svg>
  );
}

function LocationPinIcon({ className = "h-6 w-6" }) {
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

function EmptyStateCard({ title, message }) {
  return (
    <div className="min-h-full bg-[#eff7f6]">
      <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
        <div className="rounded-[30px] border border-cyan-100/80 bg-white p-6 shadow-[0_18px_42px_rgba(8,145,178,0.10),0_0_34px_rgba(16,185,129,0.08)] sm:p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">{title}</h1>
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
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-full bg-[#eff7f6]">
      <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="grid animate-pulse gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="h-8 w-72 rounded-full bg-white/80" />
            <div className="h-20 w-4/5 rounded-[28px] bg-white/80" />
            <div className="h-28 rounded-[30px] bg-white/80" />
            <div className="h-44 rounded-[30px] bg-white/80" />
            <div className="h-[420px] rounded-[32px] bg-white/80" />
          </div>

          <div className="space-y-6">
            <div className="h-[440px] rounded-[30px] bg-white/80" />
            <div className="h-32 rounded-[30px] bg-white/80" />
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

function DetailPill({ children, className = "" }) {
  return (
    <span
      className={[
        "inline-flex min-h-[34px] items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] font-extrabold uppercase tracking-[0.08em] shadow-[0_10px_22px_rgba(15,23,42,0.05)] ring-1",
        className
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function AuthorCard({ post }) {
  const authorName = getAuthorName(post);
  const authorHandle = getAuthorHandle(post);
  const initials = getAuthorInitials(post);

  return (
    <section className="rounded-[28px] border border-cyan-100/80 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(8,145,178,0.12),0_0_34px_rgba(16,185,129,0.08)] sm:px-6">
      <div className="flex items-center gap-5">
        <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center rounded-full border-4 border-white bg-slate-900 text-xl font-extrabold text-white shadow-[0_16px_34px_rgba(8,145,178,0.24),0_0_30px_rgba(16,185,129,0.20)] ring-1 ring-cyan-100">
          {initials}
        </div>

        <div className="min-w-0">
          <div className="text-[12px] font-extrabold uppercase tracking-[0.24em] text-slate-400">
            Written by
          </div>

          <div className="mt-1 break-words text-2xl font-extrabold tracking-tight text-slate-950">
            {authorName}
          </div>

          <div className="mt-1 break-words text-sm font-extrabold text-cyan-700">
            {authorHandle}
          </div>
        </div>
      </div>
    </section>
  );
}

function StoryCard({ post }) {
  const content = String(post?.content || "").trim();

  return (
    <section className="relative overflow-hidden rounded-[30px] border border-cyan-100/80 bg-white/90 px-6 py-8 shadow-[0_18px_42px_rgba(8,145,178,0.12),0_0_34px_rgba(16,185,129,0.08)] sm:px-8 sm:py-9">
      <div className="absolute bottom-8 right-8 text-7xl font-black leading-none text-cyan-100/70">
        ”
      </div>

      <div className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-cyan-500 to-emerald-500" />

      <p className="relative z-10 whitespace-pre-line text-[18px] font-semibold italic leading-9 text-slate-800 sm:text-[19px]">
        {content || "No story content available."}
      </p>
    </section>
  );
}

function ResponsivePostImage({ image, index, title, imageCount, onOpen }) {
  const alt = title ? `${title} image ${index + 1}` : `Post image ${index + 1}`;
  const srcSet = buildCloudinarySrcSet(image?.secureUrl, {
    widths: imageCount <= 1 ? [640, 960, 1280, 1440] : [480, 640, 960, 1200],
    crop: "fill",
    gravity: "auto",
    height: 720
  });

  return (
    <button
      type="button"
      onClick={() => onOpen(index)}
      className="group overflow-hidden rounded-[30px] border border-cyan-100/80 bg-slate-50 text-left shadow-[0_18px_42px_rgba(8,145,178,0.10)]"
      aria-label={`Open image ${index + 1} in full screen`}
    >
      <img
        src={optimizeCloudinaryUrl(image?.secureUrl, "detail")}
        srcSet={srcSet}
        sizes={getThumbSizes(imageCount)}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="h-[360px] w-full object-cover transition duration-300 group-hover:scale-[1.02] sm:h-[430px] lg:h-[520px]"
      />
    </button>
  );
}

function PhotosSection({ images, title, onOpen }) {
  if (!images.length) {
    return (
      <section className="rounded-[30px] border border-dashed border-cyan-200 bg-white/70 px-6 py-12 text-center text-sm font-semibold text-slate-500">
        No photos available for this post.
      </section>
    );
  }

  return (
    <section>
      <div
        className={[
          "grid gap-5",
          images.length === 1 ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"
        ].join(" ")}
      >
        {images.map((image, index) => (
          <ResponsivePostImage
            key={image.id ?? image.publicId ?? image.secureUrl ?? index}
            image={image}
            index={index}
            title={title}
            imageCount={images.length}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

function LocationCard({
  post,
  lat,
  lng,
  hasValidCoordinates,
  placeCategoryUi,
  photoVerificationUi
}) {
  const locationDisplay = getLocationDisplay(post);

  return (
    <section className="overflow-hidden rounded-[30px] border border-cyan-100/80 bg-white shadow-[0_22px_52px_rgba(8,145,178,0.14),0_0_46px_rgba(16,185,129,0.12)]">
      <div className="px-6 py-6">
        <div className="flex items-center gap-4">
          <div className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[22px] bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-[0_18px_42px_rgba(8,145,178,0.28),0_0_34px_rgba(16,185,129,0.20)] ring-4 ring-cyan-50">
            <LocationPinIcon className="h-8 w-8" />
          </div>

          <div className="min-w-0">
            <div className="text-[12px] font-extrabold uppercase tracking-[0.24em] text-slate-400">
              Location
            </div>

            <div className="mt-1 break-words text-2xl font-extrabold tracking-tight text-teal-700">
              {locationDisplay}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[0.08em] ring-1 ${placeCategoryUi.badge}`}
          >
            <span aria-hidden="true">{placeCategoryUi.icon}</span>
            <span>{placeCategoryUi.label}</span>
          </span>
        </div>

        {photoVerificationUi?.type === "match" ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            ✅ {photoVerificationUi.label}
          </div>
        ) : post?.isOwner && photoVerificationUi?.type === "uncertain" ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
            {photoVerificationUi.label}
          </div>
        ) : null}
      </div>

      <div className="relative h-[300px] overflow-hidden border-y border-cyan-100/80 sm:h-[330px]">
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

      <div className="px-6 py-4 text-sm font-semibold text-slate-600">
        {hasValidCoordinates
          ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
          : "Coordinates unavailable"}
      </div>
    </section>
  );
}

function OwnerActions({ post, onDelete }) {
  if (!post?.isOwner) return null;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3">
      <Link
        to={`/posts/${post.id}/edit`}
        className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50"
      >
        ✏️ Edit
      </Link>

      <button
        type="button"
        onClick={onDelete}
        className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-rose-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-rose-700"
        aria-label="Delete post"
      >
        🗑️ Delete
      </button>
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

  const images = Array.isArray(post?.images)
    ? post.images.filter((img) => img?.secureUrl)
    : [];

  const lat = Number(post?.latitude);
  const lng = Number(post?.longitude);

  const hasValidCoordinates =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const safeTitle = getSafeTitle(post);
  const scoreLabel = formatSentimentScore(post?.sentimentScore);

  return (
    <>
      <div className="min-h-full bg-[#eff7f6]">
      <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="space-y-7">
          <section>
            <div className="flex flex-wrap items-center gap-2">
              <DetailPill className={sentimentUi.badge}>
                <span aria-hidden="true">{sentimentUi.emoji}</span>
                <span>{String(sentimentUi.label || "").replace(" experience", "")}</span>
              </DetailPill>

              <DetailPill className={privacyUi.pill}>
                <span aria-hidden="true">{privacyUi.icon}</span>
                <span>{privacyUi.label}</span>
              </DetailPill>

              <DetailPill className={placeCategoryUi.badge}>
                <span aria-hidden="true">{placeCategoryUi.icon}</span>
                <span>{placeCategoryUi.label}</span>
              </DetailPill>

              {post?.sentimentScore != null ? (
                <DetailPill className="border-blue-200 bg-blue-50 text-blue-700 ring-blue-200">
                  <span>Score</span>
                  <span>{scoreLabel}</span>
                </DetailPill>
              ) : null}
            </div>

            <div className="mt-7 flex items-start gap-4">
              <div className="mt-2 h-[108px] w-2 shrink-0 rounded-full bg-gradient-to-b from-cyan-500 to-emerald-500" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <h1 className="min-w-0 flex-1 break-words text-[44px] font-extrabold leading-[1.02] tracking-[-0.04em] text-slate-950 sm:text-[60px] lg:text-[68px]">
                    {safeTitle}
                  </h1>

                  <OwnerActions post={post} onDelete={() => setDeleteOpen(true)} />
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex min-h-10 max-w-full items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-extrabold text-slate-700 shadow-sm ring-1 ring-cyan-100">
                  <CalendarIcon className="h-4 w-4 shrink-0 text-cyan-600" />
                  <span className="min-w-0 break-words">
                    Posted on {formatDateTime(post.createdAt)}
                  </span>
                </span>

                {wasEdited(post) ? (
                  <span className="inline-flex min-h-10 max-w-full items-center rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-500 shadow-sm ring-1 ring-cyan-100">
                    <span className="min-w-0 break-words">
                      Last edited on {formatDateTime(post.updatedAt)}
                    </span>
                  </span>
                ) : null}
              </div>
              </div>
            </div>
          </section>

          <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_360px]">
            <main className="min-w-0 space-y-6">
              <AuthorCard post={post} />

              <StoryCard post={post} />

              <PhotosSection images={images} title={safeTitle} onOpen={setLightboxIndex} />
            </main>

            <aside className="min-w-0 space-y-6 xl:sticky xl:top-[128px] xl:self-start">
              <LocationCard
                post={post}
                lat={lat}
                lng={lng}
                hasValidCoordinates={hasValidCoordinates}
                placeCategoryUi={placeCategoryUi}
                photoVerificationUi={photoVerificationUi}
              />
            </aside>
          </div>
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