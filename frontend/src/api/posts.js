// frontend/src/api/posts.js
import { api } from "./axios.js";

const DEFAULT_FEED_PAGINATION = {
  page: 1,
  limit: 12,
  hasMore: false,
  nextPage: null
};

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
    posts: Array.isArray(res?.data?.posts) ? res.data.posts : [],
    pagination: res?.data?.pagination ?? DEFAULT_FEED_PAGINATION
  };
}

export async function getPostById(postId, options = {}) {
  const res = await api.get(`/posts/${postId}`, options);
  return res?.data?.post ?? null;
}

export async function createPost(payload, options = {}) {
  const res = await api.post("/posts", payload, options);
  return res?.data?.post ?? null;
}

export async function updatePost(postId, payload, options = {}) {
  const res = await api.put(`/posts/${postId}`, payload, options);
  return res?.data?.post ?? null;
}

export async function deletePostById(postId, options = {}) {
  const res = await api.delete(`/posts/${postId}`, options);
  return res?.data ?? null;
}