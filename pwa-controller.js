(() => {
  "use strict";
  const RELEASE = "20260825-phase9-launch-hardening-1";
  const supported = "serviceWorker" in navigator && location.protocol !== "file:";
  let deferredInstall = null;
  let registration = null;
  let reloadForUpdate = false;

  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

  function mountSystemUi() {
    if (document.getElementById("pwaSystemUi")) return;
    const host = document.createElement("aside");
    host.id = "pwaSystemUi";
    host.className = "pwa-system-ui";
    host.setAttribute("aria-live", "polite");
    host.innerHTML = `
      <p class="pwa-offline-status" id="pwaOfflineStatus" role="status" hidden>Offline · secure SkillWard records are unavailable until you reconnect.</p>
      <button class="pwa-action pwa-update-action" id="pwaUpdateAction" type="button" hidden>Update SkillWard</button>
      <button class="pwa-action pwa-install-action" id="pwaInstallAction" type="button" hidden>Install SkillWard</button>
      <p class="pwa-install-help" id="pwaInstallHelp" role="status" hidden></p>`;
    document.body.append(host);
    document.getElementById("pwaUpdateAction").addEventListener("click", () => {
      if (!registration?.waiting) return;
      reloadForUpdate = true;
      registration.waiting.postMessage({ type:"SKILLWARD_SKIP_WAITING" });
    });
    document.getElementById("pwaInstallAction").addEventListener("click", async () => {
      const help = document.getElementById("pwaInstallHelp");
      if (deferredInstall) {
        deferredInstall.prompt();
        await deferredInstall.userChoice;
        deferredInstall = null;
        document.getElementById("pwaInstallAction").hidden = true;
      } else if (isIos()) {
        help.textContent = "On iPhone or iPad, open Share and choose Add to Home Screen.";
        help.hidden = false;
      }
    });
    updateConnectivity();
    if (isIos() && !standalone()) document.getElementById("pwaInstallAction").hidden = false;
  }

  function updateConnectivity() {
    const status = document.getElementById("pwaOfflineStatus");
    if (status) status.hidden = navigator.onLine;
  }

  function showUpdate() {
    const action = document.getElementById("pwaUpdateAction");
    if (action) action.hidden = false;
  }

  async function register() {
    if (!supported) return null;
    registration = await navigator.serviceWorker.register("/service-worker.js", { scope:"/", updateViaCache:"none" });
    if (registration.waiting) showUpdate();
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate();
      });
    });
    return registration;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstall = event;
    const action = document.getElementById("pwaInstallAction");
    if (action && !standalone()) action.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    deferredInstall = null;
    const action = document.getElementById("pwaInstallAction");
    if (action) action.hidden = true;
  });
  window.addEventListener("online", updateConnectivity);
  window.addEventListener("offline", updateConnectivity);
  navigator.serviceWorker?.addEventListener("message", event => {
    if (event.data?.type === "SKILLWARD_UPDATE_READY") showUpdate();
  });
  navigator.serviceWorker?.addEventListener("controllerchange", () => {
    if (reloadForUpdate) location.reload();
  });

  const ready = new Promise(resolve => {
    const start = () => {
      mountSystemUi();
      register().then(resolve).catch(() => resolve(null));
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true });
    else start();
  });

  globalThis.SkillWardPWA = Object.freeze({
    release: RELEASE,
    ready,
    isStandalone: standalone,
    pushReadiness() {
      return Object.freeze({
        serviceWorker: supported,
        pushManager: "PushManager" in globalThis,
        notifications: "Notification" in globalThis,
        permission: "Notification" in globalThis ? Notification.permission : "unsupported"
      });
    },
    async subscribeToPush({ applicationServerKey } = {}) {
      if (!applicationServerKey) throw new Error("PUSH_CONFIGURATION_REQUIRED");
      if (!("Notification" in globalThis) || !("PushManager" in globalThis)) throw new Error("PUSH_UNSUPPORTED");
      if (Notification.permission === "denied") throw new Error("PUSH_PERMISSION_DENIED");
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("PUSH_PERMISSION_REQUIRED");
      const active = await navigator.serviceWorker.ready;
      return active.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey });
    }
  });
})();
