const UPDATE_PARAM = "__snb_update";
const EDITABLE = 'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), select:not([disabled]), [contenteditable="true"]';

// Each HTML/JS build and its version manifest share one ID. Check before
// mounting React, and again when a saved tab returns to the foreground.
export function createAppUpdater({ version, timeoutMs = 2500, intervalMs = 60000, quietMs = 10000 }) {
  const attempted = new Set([new URL(window.location.href).searchParams.get(UPDATE_PARAM)]);
  const dirtyFields = new Set();
  let pending = null, checking = null, reloading = false, lastInteraction = 0;
  let retryTimer, pollTimer, observer, stopped = false;

  function cleanUpdateParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(UPDATE_PARAM)) return;
    url.searchParams.delete(UPDATE_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function isBusy() {
    for (const field of dirtyFields) if (!field.isConnected) dirtyFields.delete(field);
    return dirtyFields.size > 0 || document.activeElement?.matches(EDITABLE) ||
      document.querySelector('dialog[open], [role="dialog"], [data-app-update-block], [aria-busy="true"]') ||
      window.location.pathname.startsWith("/payment-complete");
  }

  function applyUpdate(startup = false) {
    if (!pending || reloading || stopped || attempted.has(pending) || navigator.onLine === false) return false;
    if (!startup) {
      if (document.visibilityState !== "visible" || isBusy()) return false;
      const remaining = lastInteraction + quietMs - Date.now();
      if (remaining > 0) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => applyUpdate(), remaining);
        return false;
      }
    }
    attempted.add(pending);
    reloading = true;
    // A unique navigation URL also bypasses an older cached HTML response.
    // Keep referral codes, checkout references, admin routes and fragments.
    const url = new URL(window.location.href);
    url.searchParams.set(UPDATE_PARAM, pending);
    window.location.replace(url.href);
    return true;
  }

  async function check({ startup = false } = {}) {
    if (stopped || reloading || navigator.onLine === false || (!startup && document.visibilityState !== "visible")) return false;
    if (checking) return checking;
    checking = (async () => {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), timeoutMs);
      try {
        const url = new URL(`${import.meta.env.BASE_URL}app-version.json`, window.location.origin);
        url.searchParams.set("check", String(Date.now()));
        const response = await fetch(url.href, { cache:"no-store", signal:controller.signal, credentials:"same-origin" });
        if (!response.ok) return false;
        const latest = (await response.json()).version;
        if (typeof latest !== "string" || !/^[a-zA-Z0-9._-]{1,128}$/.test(latest)) return false;
        pending = latest !== version ? latest : null;
        return applyUpdate(startup);
      } catch {
        // Offline/failed checks must never prevent sign-in or cause a reload.
        return false;
      } finally {
        window.clearTimeout(timer);
        checking = null;
      }
    })();
    return checking;
  }

  const onReturn = () => { check(); };
  function onInteraction(event) {
    lastInteraction = Date.now();
    if ((event.type === "input" || event.type === "change") && event.target.matches?.(EDITABLE)) dirtyFields.add(event.target);
  }
  const onChange = () => {
    if (!pending) return;
    window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(() => applyUpdate(), Math.max(250, lastInteraction + quietMs - Date.now()));
  };

  function start() {
    cleanUpdateParam();
    window.addEventListener("pageshow", onReturn);
    window.addEventListener("focus", onReturn);
    window.addEventListener("online", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    for (const name of ["input", "change", "pointerdown", "keydown"]) document.addEventListener(name, onInteraction, true);
    document.addEventListener("focusout", onChange);
    observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:["open","aria-busy","data-app-update-block"] });
    pollTimer = window.setInterval(onReturn, intervalMs);
  }

  function stop() {
    stopped = true;
    observer?.disconnect();
    window.clearTimeout(retryTimer);
    window.clearInterval(pollTimer);
    window.removeEventListener("pageshow", onReturn);
    window.removeEventListener("focus", onReturn);
    window.removeEventListener("online", onReturn);
    document.removeEventListener("visibilitychange", onReturn);
    for (const name of ["input", "change", "pointerdown", "keydown"]) document.removeEventListener(name, onInteraction, true);
    document.removeEventListener("focusout", onChange);
  }

  return { check, start, stop };
}
