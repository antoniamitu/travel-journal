// frontend/src/api/posts.js
import { api } from "./axios.js";

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