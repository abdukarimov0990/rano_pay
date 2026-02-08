/* =========================
   CONFIG
========================= */
const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbwAXo7LcO-serC4G4P18LNMdTE2r_pfvhz9kaQ9YDQpK_9MdzvExvSKkQzvBekgAbEW/exec";

const PENDING_KEY = "pendingSubmission";

/* =========================
   HELPERS
========================= */
function formatUZS(n) {
  const num = Number(n || 0);
  return num.toLocaleString("ru-RU").replace(/,/g, " ");
}

function safeJSONParse(str, fallback = null) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * formData'ni har xil formatlardan bitta normal formatga keltiradi
 * - minified: { Ism, TelefonRaqam, SanaSoat, ... }
 * - new:      { name, phone_number, timestamp, ... }
 */
function normalizeFormData(raw) {
  const obj = raw && typeof raw === "object" ? raw : {};

  const name = (obj.name ?? obj.Ism ?? obj.ism ?? obj.Имя ?? "").toString().trim();

  const phone = (obj.phone_number ?? obj.TelefonRaqam ?? obj.phone ?? obj.telefon ?? "")
    .toString()
    .trim();

  const timestamp = (obj.timestamp ?? obj.createdAt ?? obj.Sana ?? obj.SanaSoat ?? obj.date ?? "")
    .toString()
    .trim();

  const type = (obj.type ?? obj.Tarif ?? obj.tariff ?? obj.Tариф ?? "").toString().trim();

  const price = Number(obj.price ?? obj.Narx ?? obj.amount ?? 0) || 0;

  const currency = (obj.currency ?? "UZS").toString();

  const offerta = obj.offerta ?? obj.Oferta ?? obj.OFERTA ?? false;

  return {
    name: name || "",
    phone_number: phone || "",
    timestamp: timestamp || "",
    type: type || "",
    price,
    currency,
    offerta: !!offerta,
  };
}

function getFormData() {
  const raw = safeJSONParse(localStorage.getItem("formData") || "null", null);
  return normalizeFormData(raw);
}

function setFormData(patch) {
  const prevRaw = safeJSONParse(localStorage.getItem("formData") || "null", {});
  const prev = normalizeFormData(prevRaw);

  const patchNorm = normalizeFormData(patch);

  const next = {
    ...prev,
    ...patchNorm,

    // patch ichidagi "eski keylar" bilan ham mos tushsin:
    name: (patch.name ?? patch.Ism ?? prev.name ?? prevRaw?.name ?? prevRaw?.Ism ?? "").toString().trim(),
    phone_number: (patch.phone_number ?? patch.TelefonRaqam ?? prev.phone_number ?? prevRaw?.phone_number ?? prevRaw?.TelefonRaqam ?? "")
      .toString()
      .trim(),
    type: (patch.type ?? patch.Tarif ?? prev.type ?? prevRaw?.type ?? prevRaw?.Tarif ?? "").toString().trim(),
    price: Number(patch.price ?? patch.Narx ?? prev.price ?? prevRaw?.price ?? prevRaw?.Narx ?? 0) || 0,
    currency: (patch.currency ?? prev.currency ?? "UZS").toString(),
    timestamp: (patch.timestamp ?? patch.createdAt ?? prev.timestamp ?? prevRaw?.timestamp ?? prevRaw?.createdAt ?? prevRaw?.SanaSoat ?? "")
      .toString()
      .trim(),
    offerta: !!(patch.offerta ?? patch.Oferta ?? prev.offerta),
  };

  localStorage.setItem("formData", JSON.stringify(next));
  return next;
}

function getSelectedTariff() {
  const t = safeJSONParse(localStorage.getItem("selectedTariff") || "null", null);
  if (t && t.name && t.price) return t;
  return { name: "Tejamkor Ayol", price: 99000, currency: "UZS" };
}

function setSelectedTariff(tariff) {
  localStorage.setItem("selectedTariff", JSON.stringify(tariff));
}

function ensureSheetDateTime() {
  // Sana: YYYY-MM-DD, vaqt: HH:MM:SS
  const now = new Date();
  const Sana = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const vaqt = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
    2,
    "0"
  )}:${String(now.getSeconds()).padStart(2, "0")}`;
  return { Sana, vaqt };
}

/* =========================
   MODAL OPEN/CLOSE
========================= */
function openModal() {
  const modal = document.getElementById("registrationModal");
  if (!modal) return;
  modal.style.display = "block";
  document.documentElement.style.overflow = "hidden";
}

function closeModal() {
  const modal = document.getElementById("registrationModal");
  if (!modal) return;
  modal.style.display = "none";
  document.documentElement.style.overflow = "";
}

/* =========================
   SIGNUP SEND (ONE-TIME)
   refresh bo‘lsa qayta yubormaydi
   (Bu qism oldingidek qoladi. CORS bo‘lsa ham ko‘p holatda ishlaydi, lekin kerak bo‘lsa
   keyin FormSubmit-ga o‘tkazamiz. Hozircha originalni saqlayapman.)
========================= */
async function sendSignupIfNeeded() {
  const localData = getFormData();
  if (!localData.name || !localData.phone_number) return;

  const sentKey = "signupSent_v1";
  if (localStorage.getItem(sentKey) === "1") return;

  let formattedDate = "";
  try {
    const d = localData.timestamp ? new Date(localData.timestamp) : new Date();
    formattedDate = `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(
      2,
      "0"
    )}.${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    formattedDate = localData.timestamp || "";
  }

  const tariff = getSelectedTariff();
  const tariffName = localData.type || tariff.name;
  const tariffPrice = Number(localData.price || tariff.price || 0);

  const fd = new FormData();
  fd.append("Ism", localData.name);
  fd.append("Telefon raqam", localData.phone_number);
  fd.append("Tarif", tariffName);
  fd.append("Narx", String(tariffPrice));
  fd.append("Sana", formattedDate);
  fd.append("imageUpload", "false");
  fd.append("sheetName", "SignUp");
  fd.append("Oferta", String(!!localData.offerta));

  try {
    const res = await fetch(SHEET_URL, { method: "POST", body: fd });
    if (res.ok) {
      localStorage.setItem(sentKey, "1");
    } else {
      console.error("SignUp yuborishda xatolik:", res.statusText);
    }
  } catch (err) {
    console.error("SignUp network error:", err);
  }
}

/* =========================
   USD CONVERTER
========================= */
async function convertUZStoUSD(amountUZS) {
  try {
    const response = await fetch(
      "https://v6.exchangerate-api.com/v6/fdb1c54a6bf927bbc9eb4862/latest/UZS"
    );
    const data = await response.json();
    const rate = data?.conversion_rates?.USD;
    if (!rate) return null;
    return (Number(amountUZS) * rate).toFixed(2);
  } catch (error) {
    console.error("Valyuta kursini olishda xatolik:", error);
    return null;
  }
}

/* =========================
   MAIN DOM READY
========================= */
document.addEventListener("DOMContentLoaded", () => {
  /* ---------- TARIF BUTTONS ---------- */
  const tariffInput = document.getElementById("tariffInput");

  document.querySelectorAll(".registerBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = (btn.dataset.tariffName || "Tarif").trim();
      const price = Number(btn.dataset.tariffPrice || 0);

      const tariff = { name, price, currency: "UZS" };
      setSelectedTariff(tariff);

      if (tariffInput) tariffInput.value = name;

      openModal();
    });
  });

  // Default tarif bo‘lmasa qo‘yib ketamiz
  if (!localStorage.getItem("selectedTariff")) {
    const t = { name: "Tejamkor Ayol", price: 99000, currency: "UZS" };
    setSelectedTariff(t);
    if (tariffInput && !tariffInput.value) tariffInput.value = t.name;
  }

  /* ---------- MODAL CLOSE EVENTS ---------- */
  const closeBtn = document.getElementById("closeModalBtn");
  if (closeBtn) closeBtn.addEventListener("click", closeModal);

  const overlay = document.querySelector(".homeModalOverlay");
  if (overlay) overlay.addEventListener("click", closeModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  /* ---------- REGISTRATION FORM ---------- */
  const form = document.getElementById("registrationForm");
  if (form) {
    const nameInput = document.getElementById("name");
    const phoneInput = document.getElementById("phone");
    const nameError = document.getElementById("nameError");
    const phoneError = document.getElementById("phoneError");

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const name = (nameInput?.value || "").trim();
      const phoneRaw = (phoneInput?.value || "").trim();

      let ok = true;

      if (!name) {
        ok = false;
        if (nameError) nameError.style.display = "block";
      } else if (nameError) nameError.style.display = "none";

      const digits = phoneRaw.replace(/\D/g, "");
      if (digits.length < 9) {
        ok = false;
        if (phoneError) phoneError.style.display = "block";
      } else if (phoneError) phoneError.style.display = "none";

      if (!ok) return;

      const tariff = getSelectedTariff();

      // formData saqlash (oldingidek)
      setFormData({
        name,
        phone_number: phoneRaw.startsWith("+") ? phoneRaw : `+998${digits}`,
        type: tariff.name,
        price: tariff.price,
        currency: tariff.currency,
        timestamp: new Date().toISOString(),
        offerta: true,
      });

      closeModal();
    });
  }

  /* =========================
     TIMER (2:00)
  ========================= */
  const timerElement = document.getElementById("timer");
  if (timerElement) {
    let [m, s] = (timerElement.innerText || "2:00").split(":");
    let minutes = parseInt(m, 10) || 0;
    let seconds = parseInt(s, 10) || 0;

    const timerInterval = setInterval(() => {
      if (minutes === 0 && seconds === 0) {
        clearInterval(timerInterval);
        timerElement.innerText = "00:00";
        return;
      }

      if (seconds === 0) {
        minutes--;
        seconds = 59;
      } else {
        seconds--;
      }

      timerElement.innerText = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }, 1000);
  }

  /* =========================
     PAYMENT PAGE UI
  ========================= */
  const localData = getFormData();
  const selectedTariff = getSelectedTariff();

  const tariffName = (localData.type || selectedTariff.name || "Tarif").toString();
  const tariffPrice = Number(localData.price || selectedTariff.price || 0);

  const payment__tariff = document.querySelector(".payment__tariff");
  if (payment__tariff) payment__tariff.innerHTML = `Tarif: ${tariffName}`;

  const payment__price = document.querySelectorAll(".pricesAll");
  if (payment__price?.length) {
    payment__price.forEach((el) => (el.innerHTML = formatUZS(tariffPrice)));
  }

  const payment__price2 = document.querySelector(".payment__card-amount");
  if (payment__price2) payment__price2.innerHTML = formatUZS(tariffPrice);

  const priceUSD = document.querySelector(".priceUSD");
  if (priceUSD) {
    convertUZStoUSD(tariffPrice).then((usd) => {
      if (usd) priceUSD.innerHTML = `$${usd}`;
    });
  }

  /* =========================
     SIGNUP SEND (ONE TIME)
  ========================= */
  sendSignupIfNeeded();

  /* =========================
     PAYMENT FORM SUBMIT
     ✅ BU YERDA ENG MUHIM O'ZGARISH:
     pendingSubmission GAS kutgan FORMATDA bo'ladi:
     sheetName="Chek Yuborganlar"
     imageUpload=true
     checkUrlHeader="Check URL"
     Ism, Telefon raqam, Tarif, Oferta, Sana, vaqt, file_data, file_filename, file_mime
  ========================= */
  const paymentForm = document.getElementById("paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      const submitButton = this.querySelector(".payment__btn");
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Yuborilmoqda...";
      }

      try {
        const localDataNow = getFormData();
        const tariffNow = getSelectedTariff();

        const name = localDataNow.name;
        const phone = localDataNow.phone_number;

        if (!name || !phone) {
          alert("Ism yoki telefon raqami topilmadi. Iltimos, formani to‘ldiring.");
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = "Davom etish";
          }
          return;
        }

        const form = new FormData(this);
        const paymentType = form.get("status") || ""; // o'zingizda bor bo'lsa
        const file = form.get("chek");

        if (!file || file.size === 0) throw new Error("Chek rasmini yuklang");

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) throw new Error("Fayl hajmi 10MB dan kichik bo‘lishi kerak");

        const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
        if (!allowedTypes.includes(file.type))
          throw new Error("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");

        // localStorage meta update
        setFormData({
          payment_type: String(paymentType),
          file_name: file.name,
          last_submitted: new Date().toISOString(),
          type: localDataNow.type || tariffNow.name,
          price: Number(localDataNow.price || tariffNow.price),
        });

        // to base64
        const toBase64 = (f) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || "");
              const commaIndex = result.indexOf(",");
              const b64 = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
              resolve({ b64, mime: f.type });
            };
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(f);
          });

        const { b64, mime } = await toBase64(file);

        const finalTariffName = localDataNow.type || tariffNow.name || "";

        const { Sana, vaqt } = ensureSheetDateTime();

        // ✅ GAS (imageUpload mode) uchun to'g'ri payload:
        const payload = {
          sheetName: "Chek Yuborganlar",
          imageUpload: true,
          checkUrlHeader: "Check URL",

          Ism: String(name),
          "Telefon raqam": String(phone),
          Tarif: String(finalTariffName),

          // Sheetsda "Roziman" chiqsin:
          Oferta: String(localDataNow.offerta ? "Roziman" : ""),

          // Siz ko'rsatgan sheet columnlari:
          Sana: String(Sana),
          vaqt: String(vaqt),

          // file:
          file_data: b64,
          file_filename: file.name,
          file_mime: mime,

          // ixtiyoriy:
          Status: String(paymentType || ""),
        };

        localStorage.setItem(PENDING_KEY, JSON.stringify(payload));

        this.reset();

        const uploadLabel = document.querySelector(".uploadCheck");
        if (uploadLabel) uploadLabel.textContent = "Chek rasmini yuklash uchun bu yerga bosing";

        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Davom etish";
        }

        window.location.href = "/thankYou.html";
      } catch (err) {
        console.error("Submit error:", err);
        alert(`Xato yuz berdi: ${err.message || err}`);
        const submitButton = document.querySelector(".payment__btn");
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = "Davom etish";
        }
      }
    });
  }

  /* =========================
     UPLOAD LABEL UI
  ========================= */
  const chekInput = document.getElementById("chek");
  if (chekInput) {
    chekInput.addEventListener("change", function () {
      const file = this.files && this.files[0];
      const uploadLabel = document.querySelector(".uploadCheck");
      if (!uploadLabel) return;

      if (!file) {
        uploadLabel.textContent = "Chek rasmini yuklash uchun bu yerga bosing";
        return;
      }

      const maxSize = 10 * 1024 * 1024;
      if (file.size > maxSize) {
        alert("Fayl hajmi 10MB dan kichik bo‘lishi kerak");
        this.value = "";
        uploadLabel.textContent = "Chek rasmini yuklash uchun bu yerga bosing";
        return;
      }

      const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];
      if (!allowedTypes.includes(file.type)) {
        alert("Faqat PNG, JPG yoki PDF fayllarni yuklash mumkin");
        this.value = "";
        uploadLabel.textContent = "Chek rasmini yuklash uchun bu yerga bosing";
        return;
      }

      uploadLabel.textContent = file.name;
    });
  }

  /* =========================
     COPY BUTTONS
  ========================= */
  document.querySelectorAll(".copy").forEach((btn) => {
    const originalHTML = btn.innerHTML;

    const tickHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2F80EC" class="size-8">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    `;

    btn.addEventListener("click", () => {
      const card = btn.closest(".payment__card");
      const cardNumberEl = card?.querySelector(".payment__card-number");
      const cardNumber = (cardNumberEl?.textContent || "").trim();

      if (!cardNumber) {
        alert("Karta raqami topilmadi");
        return;
      }

      navigator.clipboard
        .writeText(cardNumber)
        .then(() => {
          btn.innerHTML = tickHTML;
          setTimeout(() => (btn.innerHTML = originalHTML), 1500);
        })
        .catch(() => {
          alert("Nusxalashda xatolik yuz berdi!");
        });
    });
  });
});
