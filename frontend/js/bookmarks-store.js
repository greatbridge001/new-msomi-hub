import { api } from './api.js';

let cache = null; // array of bookmark rows: { id, item_type, item_id }

export async function loadBookmarks() {
  const { data } = await api.get('/bookmarks');
  cache = data;
  return cache;
}

export function isBookmarked(itemType, itemId) {
  return !!cache?.find((b) => b.item_type === itemType && b.item_id === itemId);
}

export function bookmarkRowId(itemType, itemId) {
  return cache?.find((b) => b.item_type === itemType && b.item_id === itemId)?.id;
}

/** Toggles a bookmark; returns the new bookmarked state (true/false). */
export async function toggleBookmark(itemType, itemId) {
  if (!cache) await loadBookmarks();
  const existingId = bookmarkRowId(itemType, itemId);
  if (existingId) {
    await api.del(`/bookmarks/${existingId}`);
    cache = cache.filter((b) => b.id !== existingId);
    return false;
  } else {
    const { data } = await api.post('/bookmarks', { itemType, itemId });
    if (data?.id) cache.push(data);
    return true;
  }
}
