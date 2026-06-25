const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const zlib = require("zlib");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_DIR = __dirname;
const DATA_PATH = path.join(__dirname, "data", "site-data.json");
const PUBLIC_DATA_PATH = path.join(__dirname, "data", "site-public.json");
const PRODUCTS_INDEX_PATH = path.join(__dirname, "data", "products-index.json");
const PRODUCT_CHUNK_PREFIX = "products-";
const PRODUCT_CHUNK_MAX_BYTES = 2_000_000;
const UPLOAD_DIR = path.join(__dirname, "assets", "uploads");
const MAX_JSON_BODY = 36_000_000;
const ADMIN_USER = "Efe";
const ADMIN_PASS = "Efe.0107";
const sessions = new Set();
const customerSessions = new Map();
const otpRequests = new Map();
let dataCache = null;
let dataCacheMtime = 0;
let publicDataCache = null;
let publicDataCacheMtime = 0;
const DEFAULT_CHECKOUT_COUPONS = [
  { code: "THREON10", type: "percent", value: 10, label: "THREON10", status: "active", minSubtotal: 0, maxDiscount: 0 },
  { code: "FREESHIP", type: "shipping", value: 0, label: "FREESHIP", status: "active", minSubtotal: 0, maxDiscount: 0 }
];
const SHIPPING_METHODS = {
  standard: { label: "Standart kargo", fee: 99, freeThreshold: 1500 },
  express: { label: "Premium hızlı kargo", fee: 149, freeThreshold: 3500 },
  pickup: { label: "Showroom teslim", fee: 0, freeThreshold: 0 }
};
const BUNDLE_CAMPAIGN = {
  minQuantity: 3,
  percent: 8,
  label: "Kombin indirimi"
};
const CHECKOUT_EXTRAS = {
  giftWrapFee: 79,
  codFee: 69
};
const blockedEmailDomains = new Set([
  "example.com",
  "example.net",
  "example.org",
  "test.com",
  "fake.com",
  "mailinator.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "yopmail.com",
  "guerrillamail.com"
]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function readData(mutable = false) {
  const stat = fs.statSync(DATA_PATH);
  if (dataCache && dataCacheMtime === stat.mtimeMs) {
    return mutable ? cloneData(dataCache) : dataCache;
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  data.messages = Array.isArray(data.messages) ? data.messages : [];
  data.customers = Array.isArray(data.customers) ? data.customers : [];
  data.orders = Array.isArray(data.orders) ? data.orders : [];
  data.settings = data.settings && typeof data.settings === "object" ? data.settings : {};
  data.settings.coupons = normalizeCoupons(data.settings.coupons);
  data.settings.analytics = data.settings.analytics && typeof data.settings.analytics === "object" ? data.settings.analytics : {};
  data.settings.seo = data.settings.seo && typeof data.settings.seo === "object" ? data.settings.seo : {};
  data.settings.drop = data.settings.drop && typeof data.settings.drop === "object" ? data.settings.drop : {};
  data.products = Array.isArray(data.products)
    ? data.products.map((product) => ({
        ...product,
        reviews: Array.isArray(product.reviews) ? product.reviews : []
      }))
    : [];
  dataCache = data;
  dataCacheMtime = stat.mtimeMs;
  return mutable ? cloneData(dataCache) : dataCache;
}

function writeData(data) {
  const next = JSON.stringify(data, null, 2);
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, next);
  fs.renameSync(tempPath, DATA_PATH);
  dataCache = JSON.parse(next);
  dataCacheMtime = fs.statSync(DATA_PATH).mtimeMs;
  writePublicDataCache(dataCache);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendCompressedJson(req, res, statusCode, payload, options = {}) {
  const json = JSON.stringify(payload);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": options.cacheControl || "no-store",
    Vary: "Accept-Encoding"
  };
  if (json.length > 1024 && /\bgzip\b/.test(String(req.headers["accept-encoding"] || ""))) {
    const compressed = zlib.gzipSync(Buffer.from(json));
    res.writeHead(statusCode, {
      ...headers,
      "Content-Encoding": "gzip",
      "Content-Length": compressed.length
    });
    res.end(compressed);
    return;
  }
  res.writeHead(statusCode, {
    ...headers,
    "Content-Length": Buffer.byteLength(json)
  });
  res.end(json);
}

function sendError(res, statusCode, message) {
  sendJson(res, statusCode, { error: message });
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      body += chunk;
      if (body.length > MAX_JSON_BODY) {
        rejected = true;
        reject(new Error("İstek çok büyük. Görseli otomatik optimize ederek tekrar deneyin."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (rejected) return;
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Geçersiz JSON."));
      }
    });
    req.on("error", (error) => {
      if (!rejected) reject(error);
    });
  });
}

function getToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function getCustomerId(req) {
  const token = getToken(req);
  return token ? customerSessions.get(token) || "" : "";
}

function requireAdmin(req, res) {
  const token = getToken(req);
  if (!token || !sessions.has(token)) {
    sendError(res, 401, "Yetkili oturuma yeniden giriş yapın.");
    return false;
  }
  return true;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
}

function cleanString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function cleanTickerItems(value, fallback = []) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/[\n,]+/);
  const items = source.map((item) => cleanString(item)).filter(Boolean).slice(0, 12);
  if (items.length) return items;
  return Array.isArray(fallback) && fallback.length ? fallback.map((item) => cleanString(item)).filter(Boolean) : [];
}

function cleanCouponCode(value = "") {
  return cleanString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function normalizeCoupon(input = {}, index = 0) {
  const code = cleanCouponCode(input.code || input.label || `KUPON${index + 1}`);
  const type = ["percent", "fixed", "shipping"].includes(input.type) ? input.type : "percent";
  const value = Math.max(0, Number(input.value) || 0);
  const minSubtotal = Math.max(0, Number(input.minSubtotal) || 0);
  const maxDiscount = Math.max(0, Number(input.maxDiscount) || 0);
  return {
    id: cleanString(input.id, code || crypto.randomUUID()),
    code,
    label: cleanString(input.label, code),
    status: input.status === "draft" ? "draft" : "active",
    type,
    value: type === "shipping" ? 0 : value,
    minSubtotal,
    maxDiscount,
    startsAt: cleanString(input.startsAt),
    endsAt: cleanString(input.endsAt),
    note: cleanString(input.note)
  };
}

function normalizeCoupons(value, existing = []) {
  const source = Array.isArray(value) ? value : Array.isArray(existing) && existing.length ? existing : DEFAULT_CHECKOUT_COUPONS;
  const seen = new Set();
  return source
    .slice(0, 80)
    .map((coupon, index) => normalizeCoupon(coupon, index))
    .filter((coupon) => {
      if (!coupon.code || seen.has(coupon.code)) return false;
      seen.add(coupon.code);
      return true;
    });
}

function couponIsActive(coupon, subtotal = 0, now = Date.now()) {
  if (!coupon || coupon.status !== "active") return false;
  if (subtotal < (Number(coupon.minSubtotal) || 0)) return false;
  if (coupon.startsAt && Date.parse(coupon.startsAt) > now) return false;
  if (coupon.endsAt && Date.parse(coupon.endsAt) < now) return false;
  return true;
}

function couponDiscount(coupon, subtotal = 0) {
  if (!couponIsActive(coupon, subtotal)) return 0;
  if (coupon.type === "percent") {
    const raw = Math.round(subtotal * ((Number(coupon.value) || 0) / 100));
    return coupon.maxDiscount ? Math.min(raw, Number(coupon.maxDiscount) || raw) : raw;
  }
  if (coupon.type === "fixed") {
    return Math.min(subtotal, Number(coupon.value) || 0);
  }
  return 0;
}

const VISUAL_PLACEMENTS = new Set([
  "home-hero",
  "home-after-hero",
  "home-after-featured",
  "home-after-dynamic",
  "home-after-studio",
  "home-before-footer",
  "products-after-hero",
  "products-before-grid",
  "collection-after-hero",
  "collection-before-products",
  "lookbook-hero",
  "lookbook-grid",
  "lookbook-after-hero",
  "lookbook-before-products",
  "about-after-hero",
  "about-before-footer",
  "contact-after-hero",
  "contact-before-form",
  "account-after-hero",
  "checkout-after-hero"
]);

const VISUAL_THEMES = new Set(["editorial", "dark", "minimal"]);
const VISUAL_SHAPES = new Set(["square", "portrait", "landscape", "wide"]);
const IMAGE_FITS = new Set(["cover", "contain"]);
const IMAGE_RATIOS = new Set(["portrait", "square", "landscape", "wide"]);
const DYNAMIC_SHELF_MODES = new Set(["manual", "newest", "featured", "lowStock", "category", "sale"]);
const HOME_SECTION_DEFS = [
  { id: "hero", label: "Hero kampanya slider", sortOrder: 10 },
  { id: "visual-after-hero", label: "Hero altı vitrin görseli", sortOrder: 20 },
  { id: "ticker", label: "Sezon bilgi şeridi", sortOrder: 30 },
  { id: "featured-products", label: "Yeni gelenler ürünleri", sortOrder: 40 },
  { id: "visual-after-featured", label: "Yeni gelenler altı vitrin", sortOrder: 50 },
  { id: "nexframe", label: "NexFrame Merch bloğu", sortOrder: 60 },
  { id: "image-break", label: "Stüdyo görsel kırılımı", sortOrder: 70 },
  { id: "dynamic-shelves", label: "Canlı raflar", sortOrder: 80 },
  { id: "visual-after-dynamic", label: "Canlı raf altı vitrin", sortOrder: 90 },
  { id: "studio-products", label: "Stüdyo seçkisi ürünleri", sortOrder: 100 },
  { id: "visual-after-studio", label: "Stüdyo altı vitrin", sortOrder: 110 },
  { id: "category-board", label: "Kategori vitrini", sortOrder: 120 },
  { id: "gift-card", label: "THREE Gift Card", sortOrder: 130 },
  { id: "journal", label: "Atölye notları", sortOrder: 140 },
  { id: "service-strip", label: "Güvence şeridi", sortOrder: 150 },
  { id: "fit-finder", label: "Kalıp rehberi", sortOrder: 160 },
  { id: "support", label: "Sipariş sorgulama bloğu", sortOrder: 170 },
  { id: "visual-before-footer", label: "Footer öncesi vitrin", sortOrder: 180 },
  { id: "newsletter", label: "THREON Club bülten", sortOrder: 190 }
];

function normalizeImageFit(value = "cover") {
  return IMAGE_FITS.has(value) ? value : "cover";
}

function normalizeImageRatio(value = "portrait") {
  return IMAGE_RATIOS.has(value) ? value : "portrait";
}

function normalizeImagePosition(value = "center center") {
  return cleanString(value, "center center")
    .replace(/[;"'<>]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "center center";
}

function uploadExtension(mimeType = "", originalName = "") {
  const type = cleanString(mimeType).toLowerCase();
  if (type.includes("webp")) return "webp";
  if (type.includes("png")) return "png";
  if (type.includes("gif")) return "gif";
  if (type.includes("svg")) return "svg";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  const ext = path.extname(cleanString(originalName)).replace(".", "").toLowerCase();
  return ["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(ext) ? (ext === "jpeg" ? "jpg" : ext) : "jpg";
}

function safeUploadName(name = "threon-gorsel") {
  const base = slugify(cleanString(name).replace(/\.[^.]+$/, "")) || "threon-gorsel";
  return base.slice(0, 70);
}

function saveUploadedImage(body = {}) {
  const dataUrl = cleanString(body.dataUrl || body.image || body.file);
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error("Geçerli bir görsel verisi alınamadı.");
  }
  const mimeType = match[1].toLowerCase();
  if (!/^image\/(jpeg|jpg|png|webp|gif|svg\+xml)$/.test(mimeType)) {
    throw new Error("Sadece JPG, PNG, WebP, GIF veya SVG görsel yükleyin.");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) {
    throw new Error("Görsel dosyası boş görünüyor.");
  }
  if (buffer.length > 24_000_000) {
    throw new Error("Görsel çok büyük. Sistem otomatik optimize ettikten sonra tekrar deneyin.");
  }
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = uploadExtension(mimeType, body.name);
  const filename = `${Date.now().toString(36)}-${safeUploadName(body.name || body.context || "threon")}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  if (!filePath.startsWith(UPLOAD_DIR)) {
    throw new Error("Görsel yolu güvenli değil.");
  }
  fs.writeFileSync(filePath, buffer);
  return {
    path: `assets/uploads/${filename}`,
    size: buffer.length,
    mimeType
  };
}

function normalizeVisualBlocks(value, existing = []) {
  const source = Array.isArray(value) ? value : Array.isArray(existing) ? existing : [];
  return source
    .slice(0, 80)
    .map((block, index) => {
      const placement = VISUAL_PLACEMENTS.has(block?.placement) ? block.placement : "home-after-hero";
      const theme = VISUAL_THEMES.has(block?.theme) ? block.theme : "editorial";
      const shape = VISUAL_SHAPES.has(block?.shape) ? block.shape : "square";
      const title = cleanString(block?.title);
      const image = cleanString(block?.image);
      const idSeed = slugify(`${placement}-${title || image || index}`) || crypto.randomUUID();
      return {
        id: cleanString(block?.id, idSeed),
        placement,
        status: block?.status === "draft" ? "draft" : "active",
        title,
        kicker: cleanString(block?.kicker),
        subtitle: cleanString(block?.subtitle),
        image,
        productSlug: cleanString(block?.productSlug || block?.productId),
        href: cleanString(block?.href),
        cta: cleanString(block?.cta),
        theme,
        shape,
        crop: normalizeImageFit(block?.crop || "cover"),
        objectPosition: normalizeImagePosition(block?.objectPosition || "center center"),
        showText: block?.showText === false ? false : true,
        sortOrder: Number.isFinite(Number(block?.sortOrder)) ? Number(block.sortOrder) : index + 10
      };
    })
    .filter((block) => block.image);
}

function parseShelfProductSlugs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }
  return cleanString(value)
    .split(/[\n,]+/)
    .map((item) => cleanString(item))
    .filter(Boolean);
}

function normalizeDynamicShelves(value, existing = []) {
  const source = Array.isArray(value) ? value : Array.isArray(existing) ? existing : [];
  return source
    .slice(0, 24)
    .map((shelf, index) => {
      const mode = DYNAMIC_SHELF_MODES.has(shelf?.mode) ? shelf.mode : "manual";
      const title = cleanString(shelf?.title, mode === "manual" ? "Canlı raf" : mode);
      const idSeed = slugify(`${title || mode}-${index}`) || crypto.randomUUID();
      return {
        id: cleanString(shelf?.id, idSeed),
        status: shelf?.status === "draft" ? "draft" : "active",
        title,
        label: cleanString(shelf?.label),
        mode,
        productSlugs: parseShelfProductSlugs(shelf?.productSlugs || shelf?.products || shelf?.productSlug),
        category: cleanString(shelf?.category),
        subcategory: cleanString(shelf?.subcategory),
        limit: Math.min(12, Math.max(1, Number.isFinite(Number(shelf?.limit)) ? Number(shelf.limit) : 4)),
        sortOrder: Number.isFinite(Number(shelf?.sortOrder)) ? Number(shelf.sortOrder) : index + 10
      };
    })
    .filter((shelf) => shelf.title);
}

function normalizeHomeSections(value, existing = []) {
  const source = Array.isArray(value) ? value : Array.isArray(existing) ? existing : [];
  const savedById = new Map(
    source.map((section, index) => {
      const fallback = HOME_SECTION_DEFS[index] || HOME_SECTION_DEFS[0];
      const id = cleanString(section?.id, fallback?.id);
      return [
        id,
        {
          id,
          label: cleanString(section?.label, fallback?.label || id),
          status: section?.status === "draft" ? "draft" : "active",
          sortOrder: Number.isFinite(Number(section?.sortOrder)) ? Number(section.sortOrder) : fallback?.sortOrder || (index + 1) * 10
        }
      ];
    })
  );
  return HOME_SECTION_DEFS.map((section, index) => ({
    id: section.id,
    label: cleanString(savedById.get(section.id)?.label, section.label),
    status: savedById.get(section.id)?.status === "draft" ? "draft" : "active",
    sortOrder: Number.isFinite(Number(savedById.get(section.id)?.sortOrder))
      ? Number(savedById.get(section.id).sortOrder)
      : section.sortOrder || (index + 1) * 10
  })).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.label.localeCompare(b.label, "tr"));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return { salt, hash };
}

function safeCustomer(customer) {
  if (!customer) return null;
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone || "",
    createdAt: customer.createdAt
  };
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
}

function isValidEmail(email) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return false;
  const domain = email.split("@").pop();
  const local = email.split("@")[0] || "";
  const domainRoot = String(domain || "").split(".")[0] || "";
  if (!domain || blockedEmailDomains.has(domain)) return false;
  if (/(^|\.)invalid$|localhost|\.local$/i.test(domain)) return false;
  if (/^(test|fake|asdf|qwerty|abc|demo|deneme|ornek|örnek|mail|email|user|kullanici)\d*$/i.test(local)) return false;
  if (/^(test|fake|demo|example|mail|email)$/i.test(domainRoot)) return false;
  return true;
}

function normalizePhone(value) {
  return cleanString(value).replace(/[\s().-]/g, "");
}

function isValidTurkishMobile(phone) {
  return /^\+905\d{9}$/.test(phone);
}

function createOtp(phone) {
  const code = String(crypto.randomInt(100000, 1000000));
  otpRequests.set(phone, {
    code,
    attempts: 0,
    resendAt: Date.now() + 60 * 1000,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  return code;
}

function verifyOtp(phone, code) {
  const entry = otpRequests.get(phone);
  if (!entry) return { ok: false, message: "Önce SMS OTP kodu alın." };
  if (Date.now() > entry.expiresAt) {
    otpRequests.delete(phone);
    return { ok: false, message: "OTP kodunun süresi doldu. Yeni kod alın." };
  }
  entry.attempts += 1;
  if (entry.attempts > 5) {
    otpRequests.delete(phone);
    return { ok: false, message: "OTP deneme limiti aşıldı. Yeni kod alın." };
  }
  if (entry.code !== cleanString(code).replace(/\D/g, "")) {
    return { ok: false, message: "OTP kodu hatalı." };
  }
  otpRequests.delete(phone);
  return { ok: true };
}

function orderNumber() {
  return `THR-${new Date().getFullYear()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function paymentReference(method = "card") {
  const prefix = method === "bank" ? "BANK" : method === "door" ? "COD" : "PAY";
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function trackingNumber() {
  return `TRN${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function productById(data, id) {
  return data.products.find((product) => product.id === id || product.slug === id);
}

function approvedReviews(product = {}) {
  return (product.reviews || []).filter((review) => review.status === "approved");
}

function compactText(value = "", maxLength = 500) {
  const text = cleanProductText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function cleanProductText(value = "") {
  return cleanString(value)
    .replace(/ÜRÜN\s+ÖZELLİKLERİ[:：]?\s*/gi, "")
    .replace(/(?:MATERYAL|MANKEN\s*Ölçüler|Manken\s+Ölçüleri|YIKAMA\s*(?:\||&)\s*BAKIM|ÖLÇÜ\s+TABLOSU|BEDEN\s+TABLOSU)[\s\S]*$/gi, " ")
    .replace(/BEDEN\s+TABLOSU[\s\S]*?(?:Ölçüler\s+Arası[\s\S]*?(?:fark olabilir\.?|$)|$)/gi, " ")
    .replace(/ÖLÇÜ\s+TABLOSU[\s\S]*?(?:Ölçülerde[\s\S]*?(?:fark edebilir\.?|$)|$)/gi, " ")
    .replace(/\bBolum\b/gi, "Bölüm")
    .replace(/\s+/g, " ")
    .trim();
}

function productSummaryText(product = {}) {
  return (
    compactText(product.summary || product.description || product.fit || "", 240) ||
    `${product.category || "THREON"} seçkisinden premium kalıp ve günlük kullanıma uygun THREON parçası.`
  );
}

function productDescriptionText(product = {}) {
  return (
    compactText(product.description || product.summary || "", 420) ||
    `${product.name || "Bu ürün"}; kapsül gardıroba uyum sağlayan, kolay kombinlenen ve THREON çizgisini taşıyan bir parçadır.`
  );
}

function normalizedGenderSections(product = {}) {
  return Array.isArray(product.genderSections)
    ? [...new Set(product.genderSections.map((item) => cleanString(item)).filter(Boolean))]
    : [];
}

function productMerchandisingScore(product = {}) {
  const source = String(product.source || product.vendor || product.brand || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  const subcategory = String(product.subcategory || "").toLowerCase();
  const price = Number(product.price) || 0;
  let score = 0;

  if (source.includes("vamos")) score += 130;
  if (source.includes("quzu")) score += 126;
  if (source.includes("dilvin")) score += 124;
  if (source.includes("manuka")) score += 122;
  if (source.includes("penti")) score += 118;
  if (source.includes("lofibuy")) score += 55;
  if (source.includes("lesbenjamins")) score += 20;
  if (product.featured) score += 40;
  if (product.image && !String(product.image).includes("threon-fashion-hero")) score += 35;
  if ((Number(product.stock) || 0) > 0) score += 28;
  if (["takımlar", "üst giyim", "alt giyim", "dış giyim", "iç giyim"].some((item) => category.includes(item))) score += 18;
  if (/ceket|mont|kaban|gömlek|gomlek|yelek|pantolon|takım|takim|hoodie|sweat|cargo|triko|sütyen|sutyen|külot|kulot|bralet|büstiyer|bustiyer|korse|atlet|body|boxer/.test(`${name} ${subcategory}`)) score += 24;
  if (price > 0 && price <= 2500) score += 95;
  else if (price <= 4500) score += 75;
  else if (price <= 7500) score += 45;
  else if (price <= 12000) score += 20;
  else score -= 18;
  if (/gift card|hediye kart|aksesuar|çorap|corap/.test(name)) score -= 220;

  return score;
}

function publicProductSummary(product = {}) {
  const specs = Object.fromEntries(
    Object.entries(product.specs || {})
      .map(([key, value]) => [compactText(key, 80), compactText(value, 180)])
      .filter(([key, value]) => key && value)
      .slice(0, 8)
  );
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    subcategory: product.subcategory,
    price: product.price,
    comparePrice: product.comparePrice,
    currency: product.currency || "TRY",
    stock: product.stock,
    status: product.status,
    featured: Boolean(product.featured),
    badge: product.badge,
    sku: product.sku,
    image: product.image,
    imageFit: normalizeImageFit(product.imageFit || "cover"),
    imagePosition: normalizeImagePosition(product.imagePosition || "center center"),
    imageRatio: normalizeImageRatio(product.imageRatio || "portrait"),
    gallery: Array.isArray(product.gallery) ? product.gallery.filter(Boolean).slice(0, 6) : [],
    collection: product.collection,
    fit: product.fit,
    summary: productSummaryText(product),
    description: productDescriptionText(product),
    material: compactText(product.material || "", 180),
    care: compactText(product.care || "", 180),
    features: Array.isArray(product.features) ? product.features.map((item) => compactText(item, 180)).filter(Boolean).slice(0, 8) : [],
    modelInfo: compactText(product.modelInfo || "", 160),
    shippingNote: compactText(product.shippingNote || "", 160),
    specs,
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    genderSections: normalizedGenderSections(product),
    merchandisingScore: productMerchandisingScore(product)
  };
}

function publicProductDetail(product = {}) {
  return {
    ...product,
    summary: productSummaryText(product),
    description: productDescriptionText(product),
    reviews: approvedReviews(product)
  };
}

function productVariants(product = {}) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants.map((variant) => ({
      size: cleanString(variant.size, "Standart"),
      color: cleanString(variant.color, "Tek renk"),
      stock: Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : Number(product.stock || 0),
      sku: cleanString(variant.sku, product.sku),
      image: cleanString(variant.image)
    }));
  }
  const sizes = Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ["Standart"];
  const colors = Array.isArray(product.colors) && product.colors.length ? product.colors : ["Tek renk"];
  return sizes.flatMap((size) =>
    colors.map((color) => ({
      size,
      color,
      stock: Number(product.stock || 0),
      sku: product.sku || ""
    }))
  );
}

function findVariant(product = {}, size = "", color = "") {
  const variants = productVariants(product);
  const normalizedSize = cleanString(size, product.sizes?.[0] || "Standart");
  const normalizedColor = cleanString(color, product.colors?.[0] || "Tek renk");
  const exact = variants.find((variant) => variant.size === normalizedSize && variant.color === normalizedColor);
  if (exact) return exact;
  if (size && color && Array.isArray(product.variants) && product.variants.length) return null;
  return variants.find((variant) => variant.size === normalizedSize) || variants[0] || null;
}

function buildOrderItems(data, items = []) {
  return items
    .map((item) => {
      const product = productById(data, cleanString(item.productId));
      if (!product || product.status !== "active") return null;
      const variant = findVariant(product, item.size, item.color);
      if (Array.isArray(product.variants) && product.variants.length && !variant) return null;
      const availableStock = variant ? Number(variant.stock) || 0 : Number(product.stock) || 0;
      if (availableStock <= 0) return null;
      const quantity = Math.max(1, Math.min(20, Number(item.quantity) || 1));
      const price = Number(product.price) || 0;
      return {
        lineKey: cleanString(item.lineKey) || `${product.id}__${cleanString(item.size)}__${cleanString(item.color)}`,
        variantKey: `${variant?.size || cleanString(item.size)}__${variant?.color || cleanString(item.color)}`,
        productId: product.id,
        slug: product.slug,
        name: product.name,
        sku: variant?.sku || product.sku || "",
        image: product.image || "",
        size: variant?.size || cleanString(item.size, product.sizes?.[0] || "Standart"),
        color: variant?.color || cleanString(item.color, product.colors?.[0] || "Tek renk"),
        quantity,
        availableStock,
        price,
        currency: product.currency || "TRY",
        subtotal: price * quantity
      };
    })
    .filter(Boolean);
}

function calculateOrder(items, options = {}, settings = {}) {
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  const couponCode = cleanString(options.couponCode).toUpperCase();
  const coupon = normalizeCoupons(settings.coupons).find((item) => item.code === couponCode && couponIsActive(item, subtotal)) || null;
  const discount = couponDiscount(coupon, subtotal);
  const bundleDiscount = itemCount >= BUNDLE_CAMPAIGN.minQuantity ? Math.round(subtotal * (BUNDLE_CAMPAIGN.percent / 100)) : 0;
  const shippingMethodKey = SHIPPING_METHODS[options.shippingMethod] ? options.shippingMethod : "standard";
  const shippingMethod = SHIPPING_METHODS[shippingMethodKey];
  const shippingBeforeCoupon = subtotal >= shippingMethod.freeThreshold ? 0 : shippingMethod.fee;
  const shipping = coupon?.type === "shipping" ? 0 : shippingBeforeCoupon;
  const giftWrap = options.giftWrap ? CHECKOUT_EXTRAS.giftWrapFee : 0;
  const paymentFee = options.paymentMethod === "door" ? CHECKOUT_EXTRAS.codFee : 0;
  const total = Math.max(0, subtotal - discount - bundleDiscount + shipping + giftWrap + paymentFee);
  return {
    subtotal,
    discount,
    bundleDiscount,
    bundleLabel: bundleDiscount ? BUNDLE_CAMPAIGN.label : "",
    shipping,
    giftWrap,
    paymentFee,
    total,
    currency: "TRY",
    couponCode: coupon ? coupon.code : "",
    couponLabel: coupon ? coupon.label : "",
    shippingMethod: shippingMethodKey,
    shippingLabel: shippingMethod.label
  };
}

function normalizeProduct(input, existing = {}) {
  const name = cleanString(input.name, existing.name);
  const slug = slugify(input.slug || name || existing.slug);
  const id = existing.id || slug || crypto.randomUUID();
  return {
    id,
    name: name || "Yeni ürün",
    slug: slug || id,
    category: cleanString(input.category, existing.category || "Genel"),
    subcategory: cleanString(input.subcategory, existing.subcategory),
    price: cleanString(input.price, existing.price || "0"),
    comparePrice: cleanString(input.comparePrice, existing.comparePrice),
    currency: cleanString(input.currency, existing.currency || "TRY"),
    stock: Number.isFinite(Number(input.stock)) ? Number(input.stock) : Number(existing.stock || 0),
    status: input.status === "draft" ? "draft" : "active",
    featured: Boolean(input.featured),
    badge: cleanString(input.badge, existing.badge),
    sku: cleanString(input.sku, existing.sku),
    image: cleanString(input.image, existing.image || "assets/threon-fashion-hero.png"),
    imageFit: normalizeImageFit(input.imageFit || existing.imageFit || "cover"),
    imagePosition: normalizeImagePosition(input.imagePosition || existing.imagePosition || "center center"),
    imageRatio: normalizeImageRatio(input.imageRatio || existing.imageRatio || "portrait"),
    gallery: Array.isArray(input.gallery)
      ? input.gallery.map((item) => cleanString(item)).filter(Boolean)
      : Array.isArray(existing.gallery)
        ? existing.gallery
        : [],
    collection: cleanString(input.collection, existing.collection),
    fit: cleanString(input.fit, existing.fit),
    modelInfo: cleanString(input.modelInfo, existing.modelInfo),
    shippingNote: cleanString(input.shippingNote, existing.shippingNote),
    summary: cleanString(input.summary, existing.summary),
    description: cleanString(input.description, existing.description),
    sizes: Array.isArray(input.sizes)
      ? input.sizes.map((item) => cleanString(item)).filter(Boolean)
      : Array.isArray(existing.sizes)
        ? existing.sizes
        : [],
    colors: Array.isArray(input.colors)
      ? input.colors.map((item) => cleanString(item)).filter(Boolean)
      : Array.isArray(existing.colors)
        ? existing.colors
        : [],
    material: cleanString(input.material, existing.material),
    care: cleanString(input.care, existing.care),
    features: Array.isArray(input.features)
      ? input.features.map((item) => cleanString(item)).filter(Boolean)
      : Array.isArray(existing.features)
        ? existing.features
        : [],
    genderSections: Array.isArray(input.genderSections)
      ? input.genderSections.map((item) => cleanString(item)).filter(Boolean)
      : Array.isArray(existing.genderSections)
        ? existing.genderSections
        : [],
    variants: Array.isArray(input.variants)
      ? input.variants
          .map((variant) => ({
            size: cleanString(variant.size, "Standart"),
            color: cleanString(variant.color, "Tek renk"),
            stock: Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : 0,
            sku: cleanString(variant.sku),
            image: cleanString(variant.image)
          }))
          .filter((variant) => variant.size || variant.color)
      : Array.isArray(existing.variants)
        ? existing.variants
        : [],
    reviews: Array.isArray(existing.reviews) ? existing.reviews : Array.isArray(input.reviews) ? input.reviews : [],
    specs: input.specs && typeof input.specs === "object" ? input.specs : existing.specs || {}
  };
}

function publicProducts(data) {
  return data.products
      .filter((product) => product.status === "active")
      .map((product, index) => ({ product, index, score: productMerchandisingScore(product) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ product }) => product)
    .map(publicProductSummary);
}

function productChunksFromProducts(products = []) {
  const chunks = [];
  let current = [];
  let currentBytes = 2;
  products.forEach((product) => {
    const itemBytes = Buffer.byteLength(JSON.stringify(product)) + 2;
    if (current.length && currentBytes + itemBytes > PRODUCT_CHUNK_MAX_BYTES) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(product);
    currentBytes += itemBytes;
  });
  if (current.length) chunks.push(current);
  return chunks;
}

function removeOldProductChunks() {
  try {
    fs.readdirSync(path.dirname(PUBLIC_DATA_PATH))
      .filter((file) => new RegExp(`^${PRODUCT_CHUNK_PREFIX}\\d+\\.json$`).test(file))
      .forEach((file) => fs.unlinkSync(path.join(path.dirname(PUBLIC_DATA_PATH), file)));
  } catch {
    // Generated product chunk cleanup is best effort.
  }
}

function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload));
  fs.renameSync(tempPath, filePath);
}

function writePublicProductChunks(products = []) {
  removeOldProductChunks();
  const chunks = productChunksFromProducts(products);
  const productChunks = chunks.map((chunk, index) => {
    const file = `${PRODUCT_CHUNK_PREFIX}${index + 1}.json`;
    const filePath = path.join(path.dirname(PUBLIC_DATA_PATH), file);
    writeJsonAtomic(filePath, { products: chunk });
    return {
      file,
      count: chunk.length,
      bytes: fs.statSync(filePath).size
    };
  });
  const indexPayload = {
    version: "cloudflare-split-20260625",
    productCount: products.length,
    generatedAt: new Date().toISOString(),
    productChunks
  };
  writeJsonAtomic(PRODUCTS_INDEX_PATH, indexPayload);
  return indexPayload;
}

function publicData(data, productsIndex = null) {
  return {
    settings: data.settings,
    productsIndex: "data/products-index.json",
    productCount: productsIndex?.productCount || 0,
    productChunks: productsIndex?.productChunks || []
  };
}

function writePublicDataCache(data) {
  try {
    const products = publicProducts(data);
    const productsIndex = writePublicProductChunks(products);
    writeJsonAtomic(PUBLIC_DATA_PATH, publicData(data, productsIndex));
    publicDataCache = null;
    publicDataCacheMtime = 0;
  } catch (error) {
    console.warn(`Public ürün cache yazılamadı: ${error.message}`);
  }
}

function readPublicData() {
  try {
    const sourceStat = fs.statSync(DATA_PATH);
    const publicStat = fs.statSync(PUBLIC_DATA_PATH);
    if (publicStat.mtimeMs >= sourceStat.mtimeMs) {
      if (publicDataCache && publicDataCacheMtime === publicStat.mtimeMs) return publicDataCache;
      publicDataCache = JSON.parse(fs.readFileSync(PUBLIC_DATA_PATH, "utf8"));
      publicDataCacheMtime = publicStat.mtimeMs;
      return publicDataCache;
    }
  } catch {
    // Cache missing or stale; rebuild from the editable source data.
  }
  const mutableData = readData();
  const products = publicProducts(mutableData);
  const productsIndex = writePublicProductChunks(products);
  const next = publicData(mutableData, productsIndex);
  try {
    writeJsonAtomic(PUBLIC_DATA_PATH, next);
    publicDataCache = next;
    publicDataCacheMtime = fs.statSync(PUBLIC_DATA_PATH).mtimeMs;
  } catch (error) {
    console.warn(`Public ürün cache yenilenemedi: ${error.message}`);
  }
  return next;
}

function readPublicProducts(data = readPublicData()) {
  if (Array.isArray(data.products) && data.products.length) return data.products;
  const chunks = Array.isArray(data.productChunks) ? data.productChunks : [];
  const products = [];
  chunks.forEach((chunk) => {
    const file = typeof chunk === "string" ? chunk : chunk?.file;
    if (!file) return;
    try {
      const safeFile = path.basename(file);
      const chunkPath = path.join(path.dirname(PUBLIC_DATA_PATH), safeFile);
      const payload = JSON.parse(fs.readFileSync(chunkPath, "utf8"));
      products.push(...(Array.isArray(payload) ? payload : Array.isArray(payload.products) ? payload.products : []));
    } catch {
      // Missing generated chunks should not stop static pages from serving.
    }
  });
  return products;
}

const CLEAN_STATIC_ROUTES = {
  "/magaza": "/products.html",
  "/shop": "/products.html",
  "/koleksiyon": "/collection.html",
  "/nexframe-merch": "/collection.html",
  "/lookbook": "/lookbook.html",
  "/hakkimizda": "/about.html",
  "/marka-hikayesi": "/about.html",
  "/hesabim": "/account.html",
  "/odeme": "/checkout.html",
  "/iletisim": "/contact.html",
  "/kargo": "/shipping.html",
  "/kargo-ve-teslimat": "/shipping.html",
  "/iade": "/returns.html",
  "/iade-ve-degisim": "/returns.html",
  "/kvkk": "/privacy.html",
  "/gizlilik": "/privacy.html",
  "/mesafeli-satis": "/terms.html",
  "/sss": "/faq.html",
  "/stil-rehberi": "/style-guide.html"
};

const CLEAN_COLLECTION_ROUTES = new Set([
  "/kadin",
  "/kadin-yeni-gelenler",
  "/kadin-ust-giyim",
  "/kadin-alt-giyim",
  "/kadin-dis-giyim",
  "/kadin-takimlar",
  "/kadin-elbise-etek",
  "/kadin-ic-giyim",
  "/kadin-plaj-giyim",
  "/kadin-aksesuar",
  "/kadin-unisex",
  "/erkek",
  "/erkek-yeni-gelenler",
  "/erkek-ust-giyim",
  "/erkek-alt-giyim",
  "/erkek-dis-giyim",
  "/erkek-takimlar",
  "/erkek-ic-giyim",
  "/erkek-plaj-giyim",
  "/erkek-aksesuar",
  "/erkek-unisex",
  "/takimlar",
  "/ust-giyim",
  "/alt-giyim",
  "/pantolonlar",
  "/dis-giyim",
  "/plaj-giyim",
  "/ic-giyim",
  "/aksesuar",
  "/ceketler",
  "/kabanlar",
  "/montlar",
  "/bomber",
  "/palto-trenckot",
  "/palto",
  "/trenckot",
  "/gomlekler",
  "/yelekler",
  "/kapusonlu",
  "/tisortler",
  "/t-shirt",
  "/sweatshirt",
  "/triko-kazak",
  "/elbise",
  "/pantolonlar",
  "/pantolon",
  "/kargo-pantolon",
  "/jeans",
  "/sort",
  "/sortlar",
  "/esofman-alti",
  "/etek",
  "/corap",
  "/terlik",
  "/ayakkabi",
  "/esofman-takimi",
  "/takim-elbise",
  "/kombin-seti",
  "/alt-ust-takim",
  "/sort-takim",
  "/kapsul-set",
  "/mayo",
  "/bikini",
  "/bikini-ust",
  "/bikini-alt",
  "/deniz-sortu",
  "/plaj-ustu",
  "/sutyen",
  "/kulot",
  "/bralet",
  "/bustiyer",
  "/jartiyer",
  "/babydoll",
  "/bodysuit",
  "/korse",
  "/kombinezon-jupon",
  "/kombinezon",
  "/jupon",
  "/atlet-body",
  "/atlet",
  "/body",
  "/boxer",
  "/diger-ic-giyim",
  "/canta",
  "/cuzdan",
  "/sapka",
  "/parfum",
  "/kemer",
  "/taki",
  "/gozluk"
]);

function mapCleanStaticRoute(pathname) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (/^\/urun\/[^/]+$/.test(normalized)) return "/product.html";
  if (CLEAN_STATIC_ROUTES[normalized]) return CLEAN_STATIC_ROUTES[normalized];
  if (CLEAN_COLLECTION_ROUTES.has(normalized)) return "/collection.html";
  return pathname;
}

function serveStatic(req, res, pathname) {
  const cleanPath = mapCleanStaticRoute(pathname);
  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const safePath = path.normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(res, 403, "Erişim reddedildi.");
    return;
  }

  const targetPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile() ? filePath : path.join(PUBLIC_DIR, "index.html");
  const ext = path.extname(targetPath).toLowerCase();
  const cacheControl =
    ext === ".html"
      ? "no-cache"
      : [".css", ".js", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".webmanifest", ".xml"].includes(ext)
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "no-cache";
  fs.readFile(targetPath, (error, contents) => {
    if (error) {
      sendError(res, 404, "Dosya bulunamadı.");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": cacheControl,
      "Content-Length": contents.length
    });
    res.end(contents);
  });
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function siteBaseUrl(req, settings = {}) {
  const configured = cleanString(settings.seo?.siteUrl || settings.siteUrl).replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${proto}://${host}`;
}

function sendXml(res, xml) {
  res.writeHead(200, {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Length": Buffer.byteLength(xml)
  });
  res.end(xml);
}

function sendText(res, text) {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function sitemapUrl(loc, priority = "0.7", changefreq = "weekly", lastmod = new Date().toISOString()) {
  return `  <url><loc>${xmlEscape(loc)}</loc><lastmod>${xmlEscape(lastmod.slice(0, 10))}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

function sitemapXml(req) {
  const data = readPublicData();
  const base = siteBaseUrl(req, data.settings || {});
  const now = new Date().toISOString();
  const urls = [
    sitemapUrl(`${base}/`, "1.0", "daily", now),
    sitemapUrl(`${base}/magaza`, "0.9", "daily", now),
    sitemapUrl(`${base}/koleksiyon`, "0.8", "weekly", now),
    sitemapUrl(`${base}/lookbook`, "0.7", "weekly", now),
    sitemapUrl(`${base}/hakkimizda`, "0.5", "monthly", now),
    sitemapUrl(`${base}/iletisim`, "0.4", "monthly", now)
  ];
  Array.from(CLEAN_COLLECTION_ROUTES)
    .sort()
    .forEach((route) => urls.push(sitemapUrl(`${base}${route}`, "0.8", "daily", now)));
  readPublicProducts(data)
    .filter((product) => product.slug)
    .slice(0, 18000)
    .forEach((product) => {
      urls.push(sitemapUrl(`${base}/urun/${product.slug}`, "0.7", "weekly", product.updatedAt || product.createdAt || now));
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function robotsTxt(req) {
  const data = readPublicData();
  const base = siteBaseUrl(req, data.settings || {});
  return `User-agent: *\nAllow: /\nDisallow: /admin.html\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`;
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/site") {
    sendCompressedJson(req, res, 200, readPublicData(), {
      cacheControl: "private, max-age=45, stale-while-revalidate=300"
    });
    return;
  }

  const productDetailMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (req.method === "GET" && productDetailMatch) {
    const data = readData();
    const product = productById(data, decodeURIComponent(productDetailMatch[1]));
    if (!product || product.status !== "active") {
      sendError(res, 404, "Ürün bulunamadı.");
      return;
    }
    const related = data.products
      .filter((item) => item.status === "active" && item.id !== product.id)
      .filter(
        (item) =>
          item.category === product.category ||
          item.subcategory === product.subcategory ||
          Boolean(item.featured)
      )
      .slice(0, 12)
      .map(publicProductSummary);
    sendCompressedJson(req, res, 200, { settings: data.settings, product: publicProductDetail(product), related });
    return;
  }

  if (req.method === "POST" && pathname === "/api/contact") {
    const body = await getBody(req);
    const name = cleanString(body.name);
    const email = cleanString(body.email);
    const message = cleanString(body.message);
    if (!name || !email || !message) {
      sendError(res, 400, "Ad, e-posta ve mesaj alanları zorunludur.");
      return;
    }
    const data = readData(true);
    data.messages.unshift({
      id: crypto.randomUUID(),
      name,
      email,
      message,
      read: false,
      createdAt: new Date().toISOString()
    });
    writeData(data);
    sendJson(res, 201, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await getBody(req);
    if (body.username === ADMIN_USER && body.password === ADMIN_PASS) {
      const token = crypto.randomBytes(24).toString("hex");
      sessions.add(token);
      sendJson(res, 200, { token, user: { username: ADMIN_USER } });
      return;
    }
    sendError(res, 401, "Kullanıcı adı veya şifre hatalı.");
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/send-otp") {
    const body = await getBody(req);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    if (email && !isValidEmail(email)) {
      sendError(res, 400, "Geçerli bir e-posta adresi girin.");
      return;
    }
    if (!isValidTurkishMobile(phone)) {
      sendError(res, 400, "Telefon numarası +90 5XXXXXXXXX formatında olmalı.");
      return;
    }
    const data = readData();
    if (email && data.customers.some((customer) => customer.email === email)) {
      sendError(res, 409, "Bu e-posta ile zaten hesap var.");
      return;
    }
    if (data.customers.some((customer) => normalizePhone(customer.phone) === phone)) {
      sendError(res, 409, "Bu telefon numarası ile zaten hesap var.");
      return;
    }
    const existingOtp = otpRequests.get(phone);
    if (existingOtp?.resendAt && Date.now() < existingOtp.resendAt) {
      sendError(res, 429, "Yeni OTP göndermek için 1 dakika bekleyin.");
      return;
    }
    const otpCode = createOtp(phone);
    console.log(`[THREON OTP] ${phone}: ${otpCode}`);
    sendJson(res, 200, {
      ok: true,
      phone,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
      message: "SMS OTP gönderildi."
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await getBody(req);
    const name = cleanString(body.name);
    const email = normalizeEmail(body.email);
    const phone = normalizePhone(body.phone);
    const password = cleanString(body.password);
    const otpCode = cleanString(body.otpCode);
    if (!name || !isValidEmail(email) || password.length < 6) {
      sendError(res, 400, "Ad, gerçek e-posta ve en az 6 karakter şifre zorunludur.");
      return;
    }
    if (!isValidTurkishMobile(phone)) {
      sendError(res, 400, "Telefon numarası +90 5XXXXXXXXX formatında olmalı.");
      return;
    }
    const otpResult = verifyOtp(phone, otpCode);
    if (!otpResult.ok) {
      sendError(res, 400, otpResult.message);
      return;
    }
    const data = readData(true);
    if (data.customers.some((customer) => customer.email === email)) {
      sendError(res, 409, "Bu e-posta ile zaten hesap var.");
      return;
    }
    if (data.customers.some((customer) => normalizePhone(customer.phone) === phone)) {
      sendError(res, 409, "Bu telefon numarası ile zaten hesap var.");
      return;
    }
    const passwordData = hashPassword(password);
    const customer = {
      id: crypto.randomUUID(),
      name,
      email,
      phone,
      passwordHash: passwordData.hash,
      passwordSalt: passwordData.salt,
      createdAt: new Date().toISOString()
    };
    data.customers.unshift(customer);
    writeData(data);
    const token = crypto.randomBytes(24).toString("hex");
    customerSessions.set(token, customer.id);
    sendJson(res, 201, { token, customer: safeCustomer(customer) });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await getBody(req);
    const email = normalizeEmail(body.email);
    const password = cleanString(body.password);
    const data = readData();
    const customer = data.customers.find((item) => item.email === email);
    if (!customer) {
      sendError(res, 401, "E-posta veya şifre hatalı.");
      return;
    }
    const passwordData = hashPassword(password, customer.passwordSalt);
    if (passwordData.hash !== customer.passwordHash) {
      sendError(res, 401, "E-posta veya şifre hatalı.");
      return;
    }
    const token = crypto.randomBytes(24).toString("hex");
    customerSessions.set(token, customer.id);
    sendJson(res, 200, { token, customer: safeCustomer(customer) });
    return;
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const customerId = getCustomerId(req);
    if (!customerId) {
      sendError(res, 401, "Üye girişi gerekiyor.");
      return;
    }
    const data = readData();
    const customer = data.customers.find((item) => item.id === customerId);
    if (!customer) {
      sendError(res, 401, "Üye bulunamadı.");
      return;
    }
    const orders = data.orders.filter((order) => order.customerId === customer.id);
    sendJson(res, 200, { customer: safeCustomer(customer), orders });
    return;
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = getToken(req);
    if (token) customerSessions.delete(token);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/orders") {
    const body = await getBody(req);
    const data = readData(true);
    const customerId = getCustomerId(req);
    const customer = data.customers.find((item) => item.id === customerId);
    if (!customer) {
      sendError(res, 401, "Sipariş vermek için üye girişi yapmalısınız.");
      return;
    }
    const items = buildOrderItems(data, body.items);
    if (!items.length) {
      sendError(res, 400, "Sipariş için sepette ürün olmalı.");
      return;
    }
    const insufficientItem = items.find((item) => item.quantity > item.availableStock);
    if (insufficientItem) {
      sendError(res, 409, `${insufficientItem.name} için stokta yalnızca ${insufficientItem.availableStock} adet var.`);
      return;
    }
    const contact = body.contact || {};
    const shippingAddress = body.shippingAddress || {};
    const name = cleanString(contact.name);
    const email = normalizeEmail(contact.email);
    const phone = normalizePhone(contact.phone);
    const city = cleanString(shippingAddress.city);
    const district = cleanString(shippingAddress.district);
    const neighborhood = cleanString(shippingAddress.neighborhood);
    const address = cleanString(shippingAddress.address);
    if (!name || !email || !phone || !city || !district || !neighborhood || !address) {
      sendError(res, 400, "Teslimat ve iletişim bilgileri eksiksiz doldurulmalı.");
      return;
    }
    if (!isValidEmail(email)) {
      sendError(res, 400, "Geçerli bir e-posta adresi girin.");
      return;
    }
    if (!isValidTurkishMobile(phone)) {
      sendError(res, 400, "Telefon numarası +90 5XXXXXXXXX formatında olmalı.");
      return;
    }
    if (!body.legalConsent) {
      sendError(res, 400, "Mesafeli satış ve KVKK onayı zorunludur.");
      return;
    }
    const orderItems = items.map(({ availableStock, ...item }) => item);
    const totals = calculateOrder(orderItems, {
      couponCode: body.couponCode,
      shippingMethod: body.shippingMethod,
      giftWrap: Boolean(body.giftWrap),
      paymentMethod: body.paymentMethod
    }, data.settings);
    const paymentMethod = cleanString(body.paymentMethod, "card");
    const now = new Date().toISOString();
    const order = {
      id: crypto.randomUUID(),
      number: orderNumber(),
      customerId,
      status: "Yeni",
      paymentStatus: paymentMethod === "bank" ? "Havale bekliyor" : paymentMethod === "door" ? "Kapıda ödeme talebi" : "Demo ödeme onaylandı",
      paymentMethod,
      paymentProvider: paymentMethod === "card" ? "iyzico / Stripe demo" : paymentMethod === "bank" ? "Banka transferi" : "Kapıda ödeme",
      paymentReference: paymentReference(paymentMethod),
      invoiceType: cleanString(body.invoiceType, "personal"),
      giftWrap: Boolean(body.giftWrap),
      shippingMethod: totals.shippingMethod,
      shippingCarrier: "",
      trackingNumber: "",
      couponCode: totals.couponCode,
      contact: { name, email, phone },
      shippingAddress: {
        city,
        district,
        neighborhood,
        address,
        note: cleanString(shippingAddress.note)
      },
      items: orderItems,
      totals,
      loyaltyPoints: Math.floor(totals.total / 100),
      marketingConsent: Boolean(body.marketingConsent),
      legalConsent: Boolean(body.legalConsent),
      notifications: [
        { type: "email", message: "Sipariş alındı bildirimi hazırlandı.", createdAt: now },
        { type: "sms", message: "Sipariş durum SMS'i demo olarak kuyruğa alındı.", createdAt: now }
      ],
      timeline: [{ status: "Yeni", note: "Sipariş oluşturuldu.", createdAt: now }],
      returnRequest: null,
      createdAt: now
    };
    data.orders.unshift(order);
    orderItems.forEach((item) => {
      const product = productById(data, item.productId);
      if (!product) return;
      if (Array.isArray(product.variants) && product.variants.length) {
        const variant = product.variants.find((entry) => cleanString(entry.size) === item.size && cleanString(entry.color) === item.color);
        if (variant) {
          variant.stock = Math.max(0, Number(variant.stock || 0) - item.quantity);
        }
      }
      product.stock = Math.max(0, Number(product.stock || 0) - item.quantity);
    });
    writeData(data);
    sendJson(res, 201, { order });
    return;
  }

  if (req.method === "GET" && pathname === "/api/orders") {
    const customerId = getCustomerId(req);
    if (!customerId) {
      sendError(res, 401, "Sipariş geçmişi için üye girişi gerekiyor.");
      return;
    }
    const data = readData();
    sendJson(res, 200, { orders: data.orders.filter((order) => order.customerId === customerId) });
    return;
  }

  const returnMatch = pathname.match(/^\/api\/orders\/([^/]+)\/return$/);
  if (req.method === "POST" && returnMatch) {
    const customerId = getCustomerId(req);
    if (!customerId) {
      sendError(res, 401, "İade talebi için üye girişi gerekiyor.");
      return;
    }
    const body = await getBody(req);
    const data = readData(true);
    const orderIndex = data.orders.findIndex((order) => order.id === decodeURIComponent(returnMatch[1]) && order.customerId === customerId);
    if (orderIndex === -1) {
      sendError(res, 404, "Sipariş bulunamadı.");
      return;
    }
    const now = new Date().toISOString();
    data.orders[orderIndex].returnRequest = {
      id: crypto.randomUUID(),
      status: "İncelemede",
      reason: cleanString(body.reason, "Müşteri iade/değişim talebi"),
      note: cleanString(body.note),
      createdAt: now,
      updatedAt: now
    };
    data.orders[orderIndex].timeline = Array.isArray(data.orders[orderIndex].timeline) ? data.orders[orderIndex].timeline : [];
    data.orders[orderIndex].timeline.unshift({ status: "İade", note: "Müşteri iade talebi oluşturdu.", createdAt: now });
    writeData(data);
    sendJson(res, 201, data.orders[orderIndex]);
    return;
  }

  const reviewMatch = pathname.match(/^\/api\/products\/([^/]+)\/reviews$/);
  if (req.method === "POST" && reviewMatch) {
    const body = await getBody(req);
    const data = readData(true);
    const product = productById(data, decodeURIComponent(reviewMatch[1]));
    if (!product) {
      sendError(res, 404, "Ürün bulunamadı.");
      return;
    }
    const rating = Math.max(1, Math.min(5, Number(body.rating) || 5));
    const text = cleanString(body.text);
    const author = cleanString(body.author);
    const email = normalizeEmail(body.email);
    if (!author || !text || text.length < 12) {
      sendError(res, 400, "Yorum için ad ve en az 12 karakterlik deneyim yazısı gerekiyor.");
      return;
    }
    if (email && !isValidEmail(email)) {
      sendError(res, 400, "Geçerli bir e-posta adresi girin.");
      return;
    }
    const customerId = getCustomerId(req);
    const customer = customerId ? data.customers.find((item) => item.id === customerId) : null;
    product.reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const review = {
      id: crypto.randomUUID(),
      rating: rating.toFixed(1),
      author: customer?.name || author,
      email: customer?.email || email,
      text,
      verified: Boolean(customer),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    product.reviews.unshift(review);
    writeData(data);
    sendJson(res, 201, { review, message: "Yorum onay sürecine gönderildi." });
    return;
  }

  if (!pathname.startsWith("/api/admin")) {
    sendError(res, 404, "API bulunamadı.");
    return;
  }

  if (!requireAdmin(req, res)) {
    return;
  }

  if (req.method === "GET" && pathname === "/api/admin/data") {
    sendCompressedJson(req, res, 200, readData());
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/upload") {
    const body = await getBody(req);
    const uploaded = saveUploadedImage(body);
    sendJson(res, 201, uploaded);
    return;
  }

  if (req.method === "PUT" && pathname === "/api/admin/settings") {
    const body = await getBody(req);
    const data = readData(true);
    const hasField = (key) => Object.prototype.hasOwnProperty.call(body, key);
    data.settings = {
      ...data.settings,
      brandName: cleanString(body.brandName, data.settings.brandName),
      tagline: cleanString(body.tagline, data.settings.tagline),
      heroTitle: cleanString(body.heroTitle, data.settings.heroTitle),
      heroSubtitle: cleanString(body.heroSubtitle, data.settings.heroSubtitle),
      announcement: cleanString(body.announcement, data.settings.announcement),
      tickerItems: cleanTickerItems(body.tickerItems, data.settings.tickerItems),
      contactEmail: cleanString(body.contactEmail, data.settings.contactEmail),
      phone: cleanString(body.phone, data.settings.phone),
      address: cleanString(body.address, data.settings.address),
      heroImage: cleanString(body.heroImage, data.settings.heroImage),
      visualBlocks: normalizeVisualBlocks(body.visualBlocks, data.settings.visualBlocks),
      homeSections: normalizeHomeSections(body.homeSections, data.settings.homeSections),
      dynamicShelves: normalizeDynamicShelves(body.dynamicShelves, data.settings.dynamicShelves),
      coupons: normalizeCoupons(body.coupons, data.settings.coupons),
      seo: {
        ...(data.settings.seo || {}),
        ...(body.seo && typeof body.seo === "object" ? body.seo : {}),
        siteUrl: cleanString(body.siteUrl, data.settings.seo?.siteUrl || "https://threon.com.tr"),
        defaultTitle: cleanString(body.defaultTitle, data.settings.seo?.defaultTitle || "THREON Premium Giyim"),
        defaultDescription: cleanString(body.defaultDescription, data.settings.seo?.defaultDescription || data.settings.heroSubtitle || ""),
        sitemapEnabled: hasField("sitemapEnabled")
          ? !(body.sitemapEnabled === false || body.sitemapEnabled === "false")
          : data.settings.seo?.sitemapEnabled !== false
      },
      analytics: {
        ...(data.settings.analytics || {}),
        ...(body.analytics && typeof body.analytics === "object" ? body.analytics : {}),
        googleAnalyticsId: cleanString(body.googleAnalyticsId, data.settings.analytics?.googleAnalyticsId),
        metaPixelId: cleanString(body.metaPixelId, data.settings.analytics?.metaPixelId),
        conversionLabel: cleanString(body.conversionLabel, data.settings.analytics?.conversionLabel),
        enabled: hasField("analyticsEnabled")
          ? body.analyticsEnabled === "on" || body.analyticsEnabled === true
          : Boolean(data.settings.analytics?.enabled)
      },
      drop: {
        ...(data.settings.drop || {}),
        ...(body.drop && typeof body.drop === "object" ? body.drop : {}),
        title: cleanString(body.dropTitle, data.settings.drop?.title || "Limitli Drop"),
        productSlug: cleanString(body.dropProductSlug, data.settings.drop?.productSlug),
        endsAt: cleanString(body.dropEndsAt, data.settings.drop?.endsAt),
        enabled: hasField("dropEnabled")
          ? body.dropEnabled === "on" || body.dropEnabled === true
          : Boolean(data.settings.drop?.enabled)
      }
    };
    writeData(data);
    sendJson(res, 200, data);
    return;
  }

  if (req.method === "POST" && pathname === "/api/admin/products") {
    const body = await getBody(req);
    const data = readData(true);
    const product = normalizeProduct(body);
    data.products.unshift(product);
    writeData(data);
    sendJson(res, 201, product);
    return;
  }

  const productMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)(?:\/(duplicate))?$/);
  if (productMatch) {
    const productId = decodeURIComponent(productMatch[1]);
    const action = productMatch[2];
    const data = readData(true);
    const productIndex = data.products.findIndex((product) => product.id === productId);
    if (productIndex === -1) {
      sendError(res, 404, "Ürün bulunamadı.");
      return;
    }

    if (req.method === "PUT" && !action) {
      const body = await getBody(req);
      data.products[productIndex] = normalizeProduct(body, data.products[productIndex]);
      writeData(data);
      sendJson(res, 200, data.products[productIndex]);
      return;
    }

    if (req.method === "DELETE" && !action) {
      const [removed] = data.products.splice(productIndex, 1);
      writeData(data);
      sendJson(res, 200, removed);
      return;
    }

    if (req.method === "POST" && action === "duplicate") {
      const source = data.products[productIndex];
      const cloneName = `${source.name} Kopya`;
      const cloneSlug = `${source.slug}-kopya-${Date.now().toString(36)}`;
      const clone = {
        ...source,
        id: crypto.randomUUID(),
        name: cloneName,
        slug: cloneSlug,
        featured: false,
        status: "draft"
      };
      data.products.unshift(clone);
      writeData(data);
      sendJson(res, 201, clone);
      return;
    }
  }

  const messageMatch = pathname.match(/^\/api\/admin\/messages\/([^/]+)(?:\/read)?$/);
  if (messageMatch) {
    const messageId = decodeURIComponent(messageMatch[1]);
    const data = readData(true);
    const messageIndex = data.messages.findIndex((message) => message.id === messageId);
    if (messageIndex === -1) {
      sendError(res, 404, "Mesaj bulunamadı.");
      return;
    }

    if (req.method === "PUT" && pathname.endsWith("/read")) {
      data.messages[messageIndex].read = true;
      writeData(data);
      sendJson(res, 200, data.messages[messageIndex]);
      return;
    }

    if (req.method === "DELETE") {
      const [removed] = data.messages.splice(messageIndex, 1);
      writeData(data);
      sendJson(res, 200, removed);
      return;
    }
  }

  const reviewAdminMatch = pathname.match(/^\/api\/admin\/products\/([^/]+)\/reviews\/([^/]+)$/);
  if (reviewAdminMatch) {
    const productId = decodeURIComponent(reviewAdminMatch[1]);
    const reviewId = decodeURIComponent(reviewAdminMatch[2]);
    const data = readData(true);
    const product = data.products.find((item) => item.id === productId || item.slug === productId);
    if (!product) {
      sendError(res, 404, "Ürün bulunamadı.");
      return;
    }
    product.reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const reviewIndex = product.reviews.findIndex((review) => review.id === reviewId);
    if (reviewIndex === -1) {
      sendError(res, 404, "Yorum bulunamadı.");
      return;
    }
    if (req.method === "PUT") {
      const body = await getBody(req);
      const status = cleanString(body.status, "approved");
      product.reviews[reviewIndex].status = ["approved", "pending", "rejected"].includes(status) ? status : "approved";
      product.reviews[reviewIndex].updatedAt = new Date().toISOString();
      writeData(data);
      sendJson(res, 200, product.reviews[reviewIndex]);
      return;
    }
    if (req.method === "DELETE") {
      const [removed] = product.reviews.splice(reviewIndex, 1);
      writeData(data);
      sendJson(res, 200, removed);
      return;
    }
  }

  const orderMatch = pathname.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch) {
    const orderId = decodeURIComponent(orderMatch[1]);
    const data = readData(true);
    const orderIndex = data.orders.findIndex((order) => order.id === orderId);
    if (orderIndex === -1) {
      sendError(res, 404, "Sipariş bulunamadı.");
      return;
    }

    if (req.method === "PUT") {
      const body = await getBody(req);
      const allowedStatuses = ["Yeni", "Hazırlanıyor", "Kargoda", "Tamamlandı", "İptal"];
      const allowedPaymentStatuses = ["Demo ödeme onaylandı", "Havale bekliyor", "Ödeme alındı", "İade edildi"];
      const order = data.orders[orderIndex];
      const now = new Date().toISOString();
      if (allowedStatuses.includes(body.status)) {
        order.status = body.status;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.unshift({ status: body.status, note: `Durum ${body.status} olarak güncellendi.`, createdAt: now });
        order.notifications = Array.isArray(order.notifications) ? order.notifications : [];
        order.notifications.unshift({ type: "sms", message: `${order.number} durumu: ${body.status}`, createdAt: now });
      }
      if (allowedPaymentStatuses.includes(body.paymentStatus)) {
        order.paymentStatus = body.paymentStatus;
      }
      if (typeof body.shippingCarrier === "string") {
        order.shippingCarrier = cleanString(body.shippingCarrier);
      }
      if (typeof body.trackingNumber === "string") {
        order.trackingNumber = cleanString(body.trackingNumber) || trackingNumber();
        order.status = order.status === "Yeni" ? "Kargoda" : order.status;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.unshift({ status: "Kargo", note: `${order.shippingCarrier || "Kargo"} takip kodu: ${order.trackingNumber}`, createdAt: now });
      }
      if (body.returnStatus && order.returnRequest) {
        order.returnRequest.status = cleanString(body.returnStatus);
        order.returnRequest.updatedAt = now;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.unshift({ status: "İade", note: `İade talebi ${order.returnRequest.status}.`, createdAt: now });
      }
      order.updatedAt = now;
      writeData(data);
      sendJson(res, 200, order);
      return;
    }
  }

  if (req.method === "POST" && pathname === "/api/admin/import") {
    const body = await getBody(req);
    const data = readData(true);
    const next = {
      settings: body.settings && typeof body.settings === "object" ? { ...data.settings, ...body.settings } : data.settings,
      products: Array.isArray(body.products) ? body.products.map((item) => normalizeProduct(item)) : data.products,
      messages: Array.isArray(body.messages) ? body.messages : data.messages,
      customers: Array.isArray(body.customers) ? body.customers : data.customers,
      orders: Array.isArray(body.orders) ? body.orders : data.orders
    };
    writeData(next);
    sendJson(res, 200, next);
    return;
  }

  sendError(res, 404, "Yönetim işlemi bulunamadı.");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      sendXml(res, sitemapXml(req));
      return;
    }
    if (req.method === "GET" && url.pathname === "/robots.txt") {
      sendText(res, robotsTxt(req));
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Beklenmeyen bir hata olustu.");
  }
});

server.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" || HOST === "::" ? "127.0.0.1" : HOST;
  console.log(`Threon site hazir: http://${displayHost}:${PORT}`);
});
