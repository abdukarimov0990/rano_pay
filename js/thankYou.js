const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbwAXo7LcO-serC4G4P18LNMdTE2r_pfvhz9kaQ9YDQpK_9MdzvExvSKkQzvBekgAbEW/exec";

const PENDING_KEY = "pendingSubmission";

let retryTimer = null;
let retryAttempts = 0;

const MAX_RETRIES = 12;
const BASE_DELAY_MS = 2000;

function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function ensureDateTime(payload) {
  // Sana: YYYY-MM-DD, vaqt: HH:MM:SS
  const now = new Date();
  const Sana = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const vaqt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0"
  )}:${String(now.getSeconds()).padStart(2, "0")}`;

  if (!payload.Sana) payload.Sana = Sana;
  if (!payload.vaqt) payload.vaqt = vaqt;

  return payload;
}

/**
 * ✅ CORS-FREE SENDER
 * hidden iframe + form submit
 * GAS doPost => e.parameter orqali payload oladi.
 */
function postFormNoCors(payloadObj) {
  return new Promise((resolve) => {
    const frameName = "gas_iframe_" + Date.now();

    const iframe = document.createElement("iframe");
    iframe.name = frameName;
    iframe.style.display = "none";

    const form = document.createElement("form");
    form.action = SHEET_URL;
    form.method = "POST";
    form.target = frameName;
    form.enctype = "application/x-www-form-urlencoded";

    Object.entries(payloadObj).forEach(([k, v]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = k;
      input.value = String(v ?? "");
      form.appendChild(input);
    });

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;

      setTimeout(() => {
        try { form.remove(); } catch {}
        try { iframe.remove(); } catch {}
      }, 1000);

      resolve(true); // browser response'ni o‘qiyolmaymiz, ammo request jo‘nadi
    };

    iframe.addEventListener("load", finish);

    document.body.appendChild(iframe);
    document.body.appendChild(form);

    form.submit();

    // Fallback: load bo‘lmasa ham 4s dan keyin finish
    setTimeout(finish, 4000);
  });
}

// Retry scheduler (optimistic)
function scheduleRetry(payload) {
  if (retryAttempts >= MAX_RETRIES) {
    console.error("Max retries reached — stopping.");
    const el = document.getElementById("thankYouMessage");
    if (el)
      el.textContent =
        "Internet muammo bo‘lyapti. Keyinroq sahifani qayta oching (ma’lumot yo‘qolmagan).";
    return;
  }

  const delay = Math.min(60000, BASE_DELAY_MS * Math.pow(1.8, retryAttempts));
  retryAttempts++;

  retryTimer = setTimeout(async () => {
    const ok = await postFormNoCors(payload);
    if (ok) cleanupSuccess();
    else scheduleRetry(payload);
  }, delay);
}

function cleanupSuccess() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retryAttempts = 0;

  // Optimistic: form submit ketdi -> pending'ni tozalaymiz
  localStorage.removeItem(PENDING_KEY);
  console.log("✅ Sent (form submit). pendingSubmission cleared.");

  const el = document.getElementById("thankYouMessage");
  if (el) el.textContent = "Rahmat! Sizning ma'lumot qabul qilindi.";
}

async function trySendAndMaybeRetry() {
  const raw = localStorage.getItem(PENDING_KEY);
  const msg = document.getElementById("thankYouMessage");

  if (!raw) {
    console.log("No pending submission found.");
    if (msg) msg.textContent = "Rahmat! (Yuboriladigan ma’lumot topilmadi)";
    return;
  }

  let payload = safeJSONParse(raw, null);
  if (!payload || typeof payload !== "object") {
    console.error("Invalid pendingSubmission JSON.");
    localStorage.removeItem(PENDING_KEY);
    if (msg) msg.textContent = "Xato: pendingSubmission buzilgan (tozalandi).";
    return;
  }

  payload = ensureDateTime(payload);

  // UI preview
  const ismEl = document.querySelector(".ism");
  const telEl = document.querySelector(".tel");
  const tarifEl = document.querySelector(".tarif");
  const sanEl = document.querySelector(".san");

  if (ismEl) ismEl.textContent = payload.Ism || "—";
  if (telEl) telEl.textContent = payload["Telefon raqam"] || "—";
  if (tarifEl) tarifEl.textContent = payload.Tarif || "—";
  if (sanEl) sanEl.textContent = `${payload.Sana || ""} ${payload.vaqt || ""}`.trim();

  // retrylar bir xil Sana/vaqt bilan ketishi uchun qayta saqlaymiz
  localStorage.setItem(PENDING_KEY, JSON.stringify(payload));

  if (msg) msg.textContent = "Rahmat! Ma'lumot yuborilmoqda...";

  // 1) attempt (CORS-free)
  const ok = await postFormNoCors(payload);
  if (ok) {
    cleanupSuccess();
    return;
  }

  // 2) retry
  scheduleRetry(payload);
}

// page chiqayotganda ham yuborishga urinib ko‘ramiz
function onPageHideOrUnload() {
  const raw = localStorage.getItem(PENDING_KEY);
  if (!raw) return;

  const payload = safeJSONParse(raw, null);
  if (!payload) return;

  // best-effort: form submit quick
  try {
    postFormNoCors(payload);
  } catch {}
}

window.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("thankYouMessage");
  if (el) el.textContent = "Rahmat! Ma'lumot yuborilmoqda...";

  trySendAndMaybeRetry().catch((e) => console.error("Initial send error:", e));
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") onPageHideOrUnload();
});

window.addEventListener("pagehide", onPageHideOrUnload);
window.addEventListener("beforeunload", onPageHideOrUnload);
