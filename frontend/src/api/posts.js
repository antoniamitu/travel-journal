// frontend/src/api/posts.js
import { api } from "./axios.js";

const DEFAULT_FEED_PAGINATION = {
  page: 1,
  limit: 12,
  hasMore: false,
  nextPage: null
};

function asPositiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function normalizeFeedPagination(value, fallback = {}) {
  const source = value && typeof value === "object" ? value : {};

  const page = asPositiveInteger(source.page, asPositiveInteger(fallback.page, DEFAULT_FEED_PAGINATION.page));
  const limit = asPositiveInteger(
    source.limit,
    asPositiveInteger(fallback.limit, DEFAULT_FEED_PAGINATION.limit)
  );

  const rawNextPage = Number(source.nextPage);
  const nextPage =
    Number.isInteger(rawNextPage) && rawNextPage > page ? rawNextPage : null;

  const hasMore = source.hasMore === true && nextPage !== null;

  return {
    page,
    limit,
    hasMore,
    nextPage: hasMore ? nextPage : null
  };
}

export async function listFeedPosts(params = {}, options = {}) {
  const mergedParams = {
    ...(params || {}),
    ...(options?.params || {})
  };

  const res = await api.get("/posts", {
    ...options,
    params: mergedParams
  });

  return {
    posts: Array.isArray(res?.data?.posts)
      ? res.data.posts.filter((post) => post && post.id != null)
      : [],
    pagination: normalizeFeedPagination(res?.data?.pagination, {
      page: mergedParams.page,
      limit: mergedParams.limit
    })
  };
}

export async function getPostById(postId, options = {}) {
  const safePostId = String(postId || "").trim();
  if (!safePostId) {
    throw new Error("Missing post id.");
  }

  const res = await api.get(`/posts/${encodeURIComponent(safePostId)}`, options);
  return res?.data?.post ?? null;
}

export async function createPost(payload, options = {}) {
  const res = await api.post("/posts", payload, options);
  return res?.data?.post ?? null;
}

export async function updatePost(postId, payload, options = {}) {
  const safePostId = String(postId || "").trim();
  if (!safePostId) {
    throw new Error("Missing post id.");
  }

  const res = await api.put(`/posts/${encodeURIComponent(safePostId)}`, payload, options);
  return res?.data?.post ?? null;
}

export async function deletePostById(postId, options = {}) {
  const safePostId = String(postId || "").trim();
  if (!safePostId) {
    throw new Error("Missing post id.");
  }

  const res = await api.delete(`/posts/${encodeURIComponent(safePostId)}`, options);
  return res?.data ?? null;
}