function toValidDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toValidDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium"
  }).format(date);
}

export function formatFullDate(value) {
  return formatDate(value);
}

export function formatPostDate(value) {
  return formatDate(value);
}

export function formatDateTime(value) {
  const date = toValidDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short"
  }).format(date);
}

export function formatMemberSince(value) {
  const date = toValidDate(value);
  if (!date) return "Member since —";

  return `Member since ${new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(date)}`;
}

export function formatFeedPostDate(value) {
  const date = toValidDate(value);
  if (!date) return "—";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) {
    return formatDate(value);
  }

  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  const diffMinutes = Math.floor(diffMs / minuteMs);
  const diffHours = Math.floor(diffMs / hourMs);
  const diffDays = Math.floor(diffMs / dayMs);

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  }

  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  if (diffDays <= 7) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  }

  return formatDate(value);
}