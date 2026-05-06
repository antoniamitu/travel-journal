//src/components/ui/Lightbox.jsx
import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { buildCloudinarySrcSet } from "../../utils/cloudinaryImage.js";

const LIGHTBOX_SWIPE_THRESHOLD_PX = 56;

function getLightboxSizes() {
  return "100vw";
}

export default function Lightbox({
  images,
  currentIndex,
  onClose,
  onPrev,
  onNext,
  title,
  getImageUrl = (url) => url || ""
}) {
  const dialogRef = useRef(null);
  const touchStartXRef = useRef(null);
  const touchDeltaXRef = useRef(0);

  const onCloseRef = useRef(onClose);
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);

  const safeImages = Array.isArray(images) ? images : [];
  const activeImage =
    Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < safeImages.length
        ? safeImages[currentIndex]
        : null;

  const isLightboxOpen = Boolean(activeImage);

  useEffect(() => {
    onCloseRef.current = onClose;
    onPrevRef.current = onPrev;
    onNextRef.current = onNext;
  }, [onClose, onPrev, onNext]);

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

  const secureUrl =
  typeof activeImage === "string"
    ? activeImage
    : activeImage?.secureUrl || activeImage?.secure_url || "";

  if (!secureUrl) return null;

  const alt = title ? `${title} image ${currentIndex + 1}` : `Post image ${currentIndex + 1}`;

  const srcSet = buildCloudinarySrcSet(secureUrl, {
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
      onPrevRef.current?.();
    } else {
      onNextRef.current?.();
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
            src={getImageUrl(secureUrl)}
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

        {safeImages.length > 1 ? (
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
          {currentIndex + 1} / {safeImages.length}
        </div>
      </div>
    </div>,
    document.body
  );
}