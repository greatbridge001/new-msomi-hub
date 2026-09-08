/**
 * Minimal in-process TTL cache.
 *
 * Good enough as long as the API runs as a single Render instance (true
 * today on Free/Starter, since neither autoscales). If you ever move to
 * multiple instances behind a load balancer, this needs to become a
 * shared store (e.g. Redis) - each instance would otherwise keep its own
 * separate cache and you'd lose most of the benefit.
 *
 * Intentionally tiny: no external dependency, no extra service to run or
 * pay for, safe to import anywhere.
 */
const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Drop a cached value early (e.g. after an admin edits the underlying row). */
function invalidate(key) {
  store.delete(key);
}

module.exports = { get, set, invalidate };