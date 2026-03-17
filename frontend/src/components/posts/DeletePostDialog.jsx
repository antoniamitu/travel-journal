// frontend/src/components/posts/DeletePostDialog.jsx
import React, { useMemo } from "react";
import ActionDialog from "./ActionDialog.jsx";

function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" stroke="currentColor" strokeWidth="2">
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

export default function DeletePostDialog({
  open,
  postTitle,
  isDeleting = false,
  onClose,
  onConfirm
}) {
  const titleText = useMemo(() => {
    if (!postTitle) return "Delete this post?";
    return `Delete "${postTitle}"?`;
  }, [postTitle]);

  return (
    <ActionDialog
      open={open}
      tone="danger"
      busy={isDeleting}
      title={titleText}
      message="This action cannot be undone. Your post and all its images will be permanently deleted."
      confirmLabel="Delete forever"
      confirmBusyLabel="Deleting..."
      cancelLabel="Cancel"
      titleId="delete-post-dialog-title"
      descriptionId="delete-post-dialog-description"
      icon={<DeleteIcon />}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}