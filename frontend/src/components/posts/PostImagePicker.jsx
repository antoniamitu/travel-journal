// frontend/src/components/posts/PostImagePicker.jsx
import React, { useRef } from "react";

const ACCEPT_ATTR =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

function StatusOverlay({ item, onRetry, disabled }) {
  if (item.status === "uploading") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/55 text-white">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        <div className="mt-2 text-xs font-semibold">{item.progress || 0}%</div>
      </div>
    );
  }

  if (item.status === "error") {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/65 px-2 text-center text-white">
        <div className="text-sm font-semibold">Upload failed</div>
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (disabled) return;
            onRetry?.(item.localId);
          }}
          className="mt-2 inline-flex min-h-9 items-center rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Retry
        </button>
      </div>
    );
  }

  if (item.source === "new" && item.status === "uploaded") {
    return (
      <div className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
        Uploaded
      </div>
    );
  }

  return null;
}

export default function PostImagePicker({
  items = [],
  maxCount = 6,
  onFilesSelected,
  onRequestRemove,
  onRetry,
  errorText = "",
  disabled = false,
  disabledReason = ""
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  const count = safeItems.length;
  const canAddMore = count < maxCount;

  function openGalleryPicker() {
    if (disabled || !canAddMore) return;
    galleryInputRef.current?.click();
  }

  function openCameraPicker() {
    if (disabled || !canAddMore) return;
    cameraInputRef.current?.click();
  }

  function handleFilesChange(fileList) {
    const files = Array.from(fileList || []);
    if (disabled || files.length === 0) return;
    onFilesSelected?.(files);
  }

  return (
    <div className={disabled ? "opacity-60" : ""} aria-disabled={disabled}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <label className="text-sm font-semibold text-slate-900">Photos</label>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            Add up to {maxCount} photos. Max 5MB each. JPEG, PNG, WebP, HEIC/HEIF when supported.
          </div>
        </div>

        <div className="text-xs font-medium text-slate-500">
          {count}/{maxCount}
        </div>
      </div>

      <input
        ref={galleryInputRef}
        type="file"
        hidden
        multiple
        accept={ACCEPT_ATTR}
        disabled={disabled}
        onChange={(e) => {
          handleFilesChange(e.target.files);
          e.target.value = "";
        }}
      />

      <input
        ref={cameraInputRef}
        type="file"
        hidden
        accept={ACCEPT_ATTR}
        capture="environment"
        disabled={disabled}
        onChange={(e) => {
          handleFilesChange(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled || !canAddMore}
          onClick={openGalleryPicker}
          className={[
            "inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition",
            disabled || !canAddMore
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400 hover:text-emerald-700"
          ].join(" ")}
        >
          🖼️ Add from gallery
        </button>

        <button
          type="button"
          disabled={disabled || !canAddMore}
          onClick={openCameraPicker}
          className={[
            "inline-flex min-h-11 items-center justify-center rounded-2xl border px-4 py-3 text-sm font-semibold transition",
            disabled || !canAddMore
              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
              : "border-slate-200 bg-white text-slate-700 hover:border-cyan-400 hover:text-cyan-700"
          ].join(" ")}
        >
          📷 Use camera
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {safeItems.map((item, index) => {
          const src = item.previewUrl || item.secureUrl || "";
          const label = item.fileName || `Photo ${index + 1}`;

          return (
            <div
              key={item.localId || item.id || item.publicId || `${src}-${index}`}
              className="group relative h-[118px] w-[118px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm"
            >
              {src ? (
                <img
                  src={src}
                  alt={label}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                  No preview
                </div>
              )}

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onRequestRemove?.(item.localId);
                }}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-slate-700 shadow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                aria-label={`Remove ${label}`}
              >
                ×
              </button>

              <StatusOverlay item={item} onRetry={onRetry} disabled={disabled} />
            </div>
          );
        })}

        {canAddMore && safeItems.length > 0 && (
          <button
            type="button"
            disabled={disabled}
            onClick={openGalleryPicker}
            className={[
              "flex h-[118px] w-[118px] shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed bg-white transition",
              disabled
                ? "cursor-not-allowed border-slate-200 text-slate-400"
                : "border-slate-300 text-slate-500 hover:border-emerald-400 hover:text-emerald-600"
            ].join(" ")}
          >
            <span className="text-xl">⇪</span>
            <span className="mt-2 text-xs font-medium">Add more</span>
          </button>
        )}
      </div>

      {disabled && disabledReason ? (
        <p className="mt-3 text-sm text-slate-500">{disabledReason}</p>
      ) : null}

      {errorText ? (
        <p className="mt-3 text-sm text-rose-600">{errorText}</p>
      ) : null}
    </div>
  );
}
