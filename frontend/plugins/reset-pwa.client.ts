export default defineNuxtPlugin(() => {
  if (!import.meta.client) {
    return;
  }

  const buildScript = document.querySelector<HTMLScriptElement>('script[src*="/_nuxt/entry."]');
  const buildId = buildScript?.src || window.location.origin;
  const storageKey = `hb-pwa-reset:${buildId}`;

  if (sessionStorage.getItem(storageKey)) {
    return;
  }

  sessionStorage.setItem(storageKey, "1");

  queueMicrotask(async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
    } finally {
      window.location.reload();
    }
  });
});
