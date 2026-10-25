// Keep the same key after a lost response, a retry, or a page reload in this tab.
// A changed cart/request starts a new operation. The server scopes keys by user.
export function checkoutKey(operation: "order" | "payment", request: string): string {
  const storageKey = `brewLite.idempotency.${operation}`;
  const saved = sessionStorage.getItem(storageKey);
  if (saved) {
    const previous: unknown = JSON.parse(saved);
    if (
      typeof previous === "object" && previous !== null &&
      "request" in previous && previous.request === request &&
      "key" in previous && typeof previous.key === "string"
    ) {
      return previous.key;
    }
  }
  const key = crypto.randomUUID();
  sessionStorage.setItem(storageKey, JSON.stringify({ request, key }));
  return key;
}
