const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const PUBLIC_DATA_FILE = path.join(process.cwd(), "data", "site-public.json");
const REPORT_FILE = path.join(process.cwd(), "data", "fashion-import-report.json");
const REQUEST_TIMEOUT_MS = Number(process.env.FASHION_TIMEOUT_MS || 26000);
const REQUEST_DELAY_MS = Number(process.env.FASHION_DELAY_MS || 90);
const CONCURRENCY = Math.max(1, Number(process.env.FASHION_IMPORT_CONCURRENCY || 5));
const IMAGE_LIMIT = Math.max(0, Number(process.env.FASHION_IMPORT_IMAGE_LIMIT || 4));
const GLOBAL_LIMIT = Math.max(0, Number(process.env.FASHION_IMPORT_LIMIT || 0));
const PRICE_MARKUP = Math.max(0, Number(process.env.FASHION_PRICE_MARKUP ?? 400));
const MIN_STOCK = Math.max(3, Number(process.env.FASHION_MIN_STOCK || 3));
const MAX_SITEMAPS = Math.max(1, Number(process.env.FASHION_MAX_SITEMAPS || 80));
const MAX_LISTING_PAGES = Math.max(1, Number(process.env.FASHION_MAX_LISTING_PAGES || 14));

const BRAND_CONFIGS = {
  quzu: {
    source: "quzu",
    label: "Quzu",
    origin: "https://quzu.com.tr",
    kind: "shopify",
    assetDir: "assets/quzu",
    urlHints: [/\/products\//i],
    listingPaths: [
      "/collections/all",
      "/collections/en-yeniler",
      "/collections/cok-satanlar",
      "/collections/bluz",
      "/collections/ceket-1",
      "/collections/elbise",
      "/collections/esofman",
      "/collections/etek",
      "/collections/gomlek",
      "/collections/pantolon",
      "/collections/sweatshirt",
      "/collections/sort",
      "/collections/tisort",
      "/collections/triko",
      "/collections/dis-giyim",
      "/collections/kaban",
      "/collections/trenckot",
      "/collections/mont"
    ]
  },
  dilvin: {
    source: "dilvin",
    label: "Dilvin",
    origin: "https://www.dilvin.com.tr",
    kind: "generic",
    assetDir: "assets/dilvin",
    urlHints: [/\/\d{4,}[-/][^/]+$/i],
    listingPaths: [
      "/yeni-gelenler",
      "/cok-satanlar",
      "/ust-giyim",
      "/alt-giyim",
      "/elbise",
      "/ceket",
      "/gomlek",
      "/bluz",
      "/pantolon",
      "/etek",
      "/dis-giyim",
      "/indirim"
    ]
  },
  manuka: {
    source: "manuka",
    label: "Manuka",
    origin: "https://www.manuka.com.tr",
    kind: "generic",
    assetDir: "assets/manuka",
    urlHints: [/\/[^/]*(?:takim|ceket|gomlek|bluz|tunik|pantolon|etek|elbise|kap|trenckot|mont|yelek)[^/]*$/i],
    listingPaths: [
      "/yeni-gelenler",
      "/cok-satanlar",
      "/ust-giyim",
      "/alt-giyim",
      "/dis-giyim",
      "/takim",
      "/takimlar",
      "/elbise",
      "/pantolon",
      "/gomlek",
      "/tunik",
      "/ceket",
      "/indirim"
    ]
  }
};

const ENTITY_MAP = {
  amp: "&",
  quot: '"',
  "#034": '"',
  "#039": "'",
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
  rsquo: "'",
  lsquo: "'",
  rdquo: '"',
  ldquo: '"'
};

const COLOR_TERMS = [
  ["antrasit", "Antrasit"],
  ["siyah", "Siyah"],
  ["black", "Siyah"],
  ["beyaz", "Beyaz"],
  ["white", "Beyaz"],
  ["ekru", "Ekru"],
  ["ecru", "Ekru"],
  ["krem", "Krem"],
  ["cream", "Krem"],
  ["bej", "Bej"],
  ["beige", "Bej"],
  ["kahverengi", "Kahverengi"],
  ["kahve", "Kahve"],
  ["brown", "Kahve"],
  ["taba", "Taba"],
  ["camel", "Camel"],
  ["vizon", "Vizon"],
  ["haki", "Haki"],
  ["khaki", "Haki"],
  ["yeşil", "Yeşil"],
  ["yesil", "Yeşil"],
  ["green", "Yeşil"],
  ["mint", "Mint"],
  ["mavi", "Mavi"],
  ["blue", "Mavi"],
  ["indigo", "İndigo"],
  ["lacivert", "Lacivert"],
  ["navy", "Lacivert"],
  ["gri", "Gri"],
  ["gray", "Gri"],
  ["grey", "Gri"],
  ["füme", "Füme"],
  ["fume", "Füme"],
  ["kırmızı", "Kırmızı"],
  ["kirmizi", "Kırmızı"],
  ["red", "Kırmızı"],
  ["bordo", "Bordo"],
  ["burgundy", "Bordo"],
  ["pembe", "Pembe"],
  ["pink", "Pembe"],
  ["lila", "Lila"],
  ["mor", "Mor"],
  ["purple", "Mor"],
  ["sarı", "Sarı"],
  ["sari", "Sarı"],
  ["yellow", "Sarı"],
  ["turuncu", "Turuncu"],
  ["orange", "Turuncu"],
  ["gümüş", "Gümüş"],
  ["gumus", "Gümüş"],
  ["silver", "Gümüş"],
  ["altın", "Altın"],
  ["altin", "Altın"],
  ["gold", "Altın"]
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function selectedBrands() {
  const requested = (process.env.FASHION_IMPORT_BRANDS || "quzu,dilvin,manuka")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return requested.map((key) => BRAND_CONFIGS[key]).filter(Boolean);
}

function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  let text = String(value);
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&([^;]+);/g, (match, entity) => {
      if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
      if (entity.startsWith("#x")) return String.fromCharCode(parseInt(entity.slice(2), 16));
      if (entity.startsWith("#")) return String.fromCharCode(parseInt(entity.slice(1), 10));
      return match;
    });
    if (decoded === text) break;
    text = decoded;
  }
  return text;
}

function stripHtml(value = "") {
  return decodeEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function sentenceSummary(text = "", maxLength = 190) {
  const clean = cleanString(text);
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  return `${sliced.slice(0, lastSpace > 70 ? lastSpace : maxLength).trim()}...`;
}

function slugify(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 92);
}

function titleCaseTurkish(value = "") {
  return cleanString(value)
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = decodeEntities(String(value ?? "")).trim();
  if (!text) return 0;
  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function roundPrice(value) {
  return String(Math.max(0, Math.round(toNumber(value))));
}

async function fetchBuffer(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "THREON catalog importer/1.0 (+owner requested local import)",
          "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.7,en;q=0.5",
          Accept: "text/html,application/xhtml+xml,application/xml,application/json,image/avif,image/webp,image/*,*/*"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(450 + attempt * 850);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchText(url, retries = 2) {
  const buffer = await fetchBuffer(url, retries);
  const body =
    url.endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b)
      ? zlib.gunzipSync(buffer).toString("utf8")
      : buffer.toString("utf8");
  return body;
}

async function fetchJson(url, retries = 2) {
  return JSON.parse(await fetchText(url, retries));
}

function normalizeUrl(value = "", origin = "") {
  const raw = decodeEntities(cleanString(value));
  if (!raw || /^(true|false|null|undefined)$/i.test(raw)) return "";
  if (/^(data:|mailto:|tel:|javascript:|#)/i.test(raw)) return "";
  try {
    if (raw.startsWith("//")) return `https:${raw}`;
    if (raw.startsWith("/")) return `${origin}${raw}`;
    return new URL(raw, origin || undefined).toString();
  } catch {
    return "";
  }
}

function sameHost(url, origin) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") === new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return false;
  }
}

function isAssetUrl(url = "") {
  return /\.(?:jpg|jpeg|png|webp|avif)(?:[?#].*)?$/i.test(url);
}

function looksLikeImage(url = "") {
  return isAssetUrl(url) || /cdn|image|img|upload|product|urun|media/i.test(url);
}

function cleanImageUrl(url = "") {
  try {
    const parsed = new URL(url);
    ["width", "height", "crop", "format"].forEach((key) => {
      if (parsed.searchParams.get(key) && Number(parsed.searchParams.get(key)) < 900) parsed.searchParams.delete(key);
    });
    return parsed.toString();
  } catch {
    return url;
  }
}

function imageExtension(url = "") {
  try {
    const parsed = new URL(url);
    const marker = `${parsed.pathname} ${parsed.search}`.toLowerCase();
    if (marker.includes("format=webp")) return ".webp";
    const ext = path.extname(parsed.pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext) ? ext : ".jpg";
  } catch {
    return ".jpg";
  }
}

async function downloadProductImages(config, slug, imageUrls) {
  const assetDir = path.join(process.cwd(), config.assetDir);
  fs.mkdirSync(assetDir, { recursive: true });
  const localPaths = [];
  const limitedUrls = IMAGE_LIMIT > 0 ? imageUrls.slice(0, IMAGE_LIMIT) : imageUrls;

  for (const [index, sourceUrl] of limitedUrls.entries()) {
    const ext = imageExtension(sourceUrl);
    const fileName = `${slug}-${String(index + 1).padStart(2, "0")}${ext}`;
    const localFile = path.join(assetDir, fileName);
    const publicFile = `${config.assetDir}/${fileName}`;
    if (!fs.existsSync(localFile) || fs.statSync(localFile).size === 0) {
      try {
        const buffer = await fetchBuffer(sourceUrl, 1);
        fs.writeFileSync(localFile, buffer);
        await sleep(25);
      } catch (error) {
        console.warn(`Gorsel atlandi: ${sourceUrl} (${error.message})`);
        continue;
      }
    }
    localPaths.push(publicFile);
  }

  return localPaths;
}

function parseJsonLd(html = "") {
  const entries = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1]).trim());
      entries.push(...flattenJsonLd(parsed));
    } catch {
      // ignored: malformed JSON-LD on storefronts is common.
    }
  }
  return entries;
}

function flattenJsonLd(entry) {
  if (!entry) return [];
  if (Array.isArray(entry)) return entry.flatMap(flattenJsonLd);
  if (Array.isArray(entry["@graph"])) return [entry, ...entry["@graph"].flatMap(flattenJsonLd)];
  if (entry["@type"] === "ItemList" && Array.isArray(entry.itemListElement)) {
    return [entry, ...entry.itemListElement.flatMap((item) => flattenJsonLd(item.item || item))];
  }
  return [entry];
}

function jsonLdType(entry = {}) {
  const type = entry["@type"];
  return Array.isArray(type) ? type.join(" ") : String(type || "");
}

function productJsonLd(html = "") {
  return parseJsonLd(html).find((entry) => jsonLdType(entry).toLowerCase().includes("product")) || {};
}

function metaContent(html = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["'][^>]*>`, "i")
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return "";
}

function attributeValue(block = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`${escaped}=["']([^"']+)["']`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function textFromTitle(html = "") {
  return cleanString(decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s*[|-]\s*(Quzu|Dilvin|Manuka).*$/i, ""));
}

function parsePriceCandidates(text = "") {
  const clean = decodeEntities(String(text));
  const values = [];
  const moneyPattern =
    /(?:₺|TL|TRY)\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:₺|TL|TRY)/gi;
  for (const match of clean.matchAll(moneyPattern)) {
    const amount = toNumber(match[1] || match[2]);
    if (amount > 20 && amount < 300000) values.push(amount);
  }
  return unique(values.map((value) => String(Math.round(value)))).map(Number);
}

function offerPrice(offers = {}) {
  const rows = Array.isArray(offers) ? offers : [offers];
  const prices = rows.map((offer) => toNumber(offer?.price || offer?.lowPrice || offer?.highPrice)).filter((value) => value > 0);
  return prices.length ? Math.min(...prices) : 0;
}

function extractImageUrls(html = "", origin = "", jsonProduct = {}) {
  const jsonImages = Array.isArray(jsonProduct.image) ? jsonProduct.image : [jsonProduct.image];
  const metaImages = [metaContent(html, "og:image"), metaContent(html, "twitter:image")];
  const attrImages = [...html.matchAll(/(?:src|data-src|data-original|data-image|data-large|content)=["']([^"']+\.(?:jpg|jpeg|png|webp|avif)(?:[^"']*)?)["']/gi)].map(
    (match) => match[1]
  );
  return unique([...jsonImages, ...metaImages, ...attrImages].map((url) => cleanImageUrl(normalizeUrl(url, origin))).filter(looksLikeImage)).filter(
    (url) => !/logo|favicon|sprite|placeholder|no-image|loading/i.test(url)
  );
}

function inferColors(...values) {
  const source = values.join(" ").toLocaleLowerCase("tr-TR");
  return unique(COLOR_TERMS.filter(([needle]) => source.includes(needle)).map(([, label]) => label));
}

function normalizeSizeLabel(value = "") {
  const clean = cleanString(value)
    .replace(/^beden[:\s-]*/i, "")
    .replace(/^size[:\s-]*/i, "")
    .toUpperCase();
  const replacements = {
    "TEK EBAT": "Standart",
    STD: "Standart",
    STANDARD: "Standart",
    STANDART: "Standart",
    "O/S": "Standart",
    OS: "Standart",
    "2XL": "XXL",
    "3XL": "3XL"
  };
  return replacements[clean] || clean;
}

function sizeLooksValid(value = "") {
  const clean = normalizeSizeLabel(value);
  return /^(XXS|XS|S|M|L|XL|XXL|3XL|4XL|5XL|3XS|34|36|38|40|42|44|46|48|50|52|54|56|75[ABCDEF]|80[ABCDEF]|85[ABCDEF]|90[ABCDEF]|95[ABCDEF]|100[ABCDEF]|105[ABCDEF]|110[ABCDEF]|Standart)$/i.test(
    clean
  );
}

function extractSizes(...values) {
  const text = values.join(" ");
  const found = [];
  for (const match of text.matchAll(/(?:data-(?:size|beden|value)|value|title|aria-label)=["']([^"']{1,28})["']/gi)) {
    const label = normalizeSizeLabel(match[1]);
    if (sizeLooksValid(label)) found.push(label);
  }
  for (const match of text.matchAll(/>\s*(XXS|XS|S|M|L|XL|XXL|2XL|3XL|4XL|34|36|38|40|42|44|46|48|50|52|54|56|STD|Standart|Tek Ebat|O\/S)\s*</gi)) {
    const label = normalizeSizeLabel(match[1]);
    if (sizeLooksValid(label)) found.push(label);
  }
  return unique(found);
}

function defaultSizes(category, subcategory) {
  const key = `${category} ${subcategory}`.toLocaleLowerCase("tr-TR");
  if (/aksesuar|çanta|canta|takı|taki|kemer|şapka|sapka|cüzdan|cuzdan|gözlük|gozluk/.test(key)) return ["Standart"];
  if (/ayakkabı|ayakkabi|terlik|sandalet/.test(key)) return ["36", "37", "38", "39", "40"];
  if (/pantolon|jeans|etek|şort|sort/.test(key)) return ["34", "36", "38", "40", "42"];
  return ["XS", "S", "M", "L", "XL"];
}

function categoryFromProduct({ name = "", url = "", tags = [], productType = "", breadcrumb = "" }) {
  const source = unique([name, url, productType, breadcrumb, ...tags])
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const has = (...terms) => terms.some((term) => source.includes(term));

  if (has("bikini", "mayo", "pareo", "plaj", "deniz şortu", "deniz sortu")) {
    if (has("mayo")) return { category: "Plaj Giyim", subcategory: "Mayo" };
    if (has("deniz şortu", "deniz sortu")) return { category: "Plaj Giyim", subcategory: "Deniz Şortu" };
    return { category: "Plaj Giyim", subcategory: "Plaj Üstü" };
  }
  if (has("sütyen", "sutyen", "külot", "kulot", "bralet", "büstiyer", "bustiyer", "korse", "body", "bodysuit", "atlet", "boxer", "jartiyer", "kombinezon")) {
    if (has("sütyen", "sutyen")) return { category: "İç Giyim", subcategory: "Sütyen" };
    if (has("külot", "kulot")) return { category: "İç Giyim", subcategory: "Külot" };
    if (has("bralet")) return { category: "İç Giyim", subcategory: "Bralet" };
    if (has("büstiyer", "bustiyer")) return { category: "İç Giyim", subcategory: "Büstiyer" };
    if (has("boxer")) return { category: "İç Giyim", subcategory: "Boxer" };
    if (has("atlet", "body")) return { category: "İç Giyim", subcategory: "Atlet & Body" };
    return { category: "İç Giyim", subcategory: "Diğer İç Giyim" };
  }
  if (has("çanta", "canta", "bag", "kemer", "belt", "takı", "taki", "kolye", "küpe", "kupe", "bileklik", "yüzük", "yuzuk", "şapka", "sapka", "cüzdan", "cuzdan", "gözlük", "gozluk", "aksesuar")) {
    if (has("çanta", "canta", "bag")) return { category: "Aksesuar", subcategory: "Çanta" };
    if (has("cüzdan", "cuzdan")) return { category: "Aksesuar", subcategory: "Cüzdan" };
    if (has("gözlük", "gozluk")) return { category: "Aksesuar", subcategory: "Gözlük" };
    if (has("şapka", "sapka")) return { category: "Aksesuar", subcategory: "Şapka" };
    if (has("takı", "taki", "kolye", "küpe", "kupe", "bileklik", "yüzük", "yuzuk")) return { category: "Aksesuar", subcategory: "Takı" };
    return { category: "Aksesuar", subcategory: "Aksesuar" };
  }
  if (has("takım elbise", "takim elbise", "suit")) return { category: "Takımlar", subcategory: "Takım Elbise" };
  if (has("eşofman takım", "esofman takim")) return { category: "Takımlar", subcategory: "Eşofman Takımı" };
  if (has("şort takım", "sort takim")) return { category: "Takımlar", subcategory: "Şort Takım" };
  if (has("takım", "takim", "ikili set", "ikili takım", "alt üst", "alt ust", "set")) return { category: "Takımlar", subcategory: "Alt Üst Takım" };
  if (has("kaban", "mont", "trençkot", "trenc", "palto", "pardesü", "pardesu", "kap ", "/kap", "dış giyim", "dis giyim", "kaşe", "kase", "bomber")) {
    if (has("bomber")) return { category: "Dış Giyim", subcategory: "Bomber" };
    if (has("mont")) return { category: "Dış Giyim", subcategory: "Mont" };
    if (has("trençkot", "trenc", "palto", "pardesü", "pardesu", "kap ")) return { category: "Dış Giyim", subcategory: "Palto | Trençkot" };
    if (has("ceket")) return { category: "Dış Giyim", subcategory: "Ceket" };
    return { category: "Dış Giyim", subcategory: "Kaban" };
  }
  if (has("ceket", "jacket", "blazer")) return { category: "Dış Giyim", subcategory: "Ceket" };
  if (has("pantolon", "jean", "denim", "etek", "şort", "sort", "bermuda", "tayt", "eşofman altı", "esofman alti")) {
    if (has("jean", "denim")) return { category: "Alt Giyim", subcategory: "Jeans" };
    if (has("etek")) return { category: "Alt Giyim", subcategory: "Etek" };
    if (has("şort", "sort", "bermuda")) return { category: "Alt Giyim", subcategory: "Şort" };
    if (has("kargo")) return { category: "Alt Giyim", subcategory: "Kargo Pantolon" };
    if (has("eşofman", "esofman")) return { category: "Alt Giyim", subcategory: "Eşofman Altı" };
    return { category: "Alt Giyim", subcategory: "Pantolon" };
  }
  if (has("elbise", "dress")) return { category: "Üst Giyim", subcategory: "Elbise" };
  if (has("tunik", "tunic")) return { category: "Üst Giyim", subcategory: "Tunik" };
  if (has("gömlek", "gomlek", "shirt")) return { category: "Üst Giyim", subcategory: "Gömlek" };
  if (has("bluz", "blouse")) return { category: "Üst Giyim", subcategory: "Bluz" };
  if (has("triko", "kazak", "hırka", "hirka", "cardigan", "knit")) return { category: "Üst Giyim", subcategory: "Triko | Kazak" };
  if (has("sweatshirt", "sweat", "hoodie", "kapüşon", "kapuson")) return { category: "Üst Giyim", subcategory: "Sweatshirt" };
  if (has("t-shirt", "t shirt", "tişört", "tisort")) return { category: "Üst Giyim", subcategory: "T-Shirt" };
  if (has("yelek", "vest")) return { category: "Üst Giyim", subcategory: "Yelek" };

  return { category: "Üst Giyim", subcategory: titleCaseTurkish(productType || "Yeni Sezon") };
}

function fitFromName(name = "") {
  const lower = name.toLocaleLowerCase("tr-TR");
  if (lower.includes("oversize")) return "Oversize";
  if (lower.includes("regular")) return "Regular fit";
  if (lower.includes("slim")) return "Slim fit";
  if (lower.includes("bol")) return "Rahat kesim";
  return "Premium regular fit";
}

function materialFromText(text = "") {
  const clean = stripHtml(text);
  const match = clean.match(/(?:materyal|kumaş|kumas|içerik|icerik)[:\s]+([^.\n]{4,160})/i);
  return cleanString(match?.[1] || "Premium kumaş ve konfor odaklı sezon materyali.");
}

function careFromText(text = "") {
  const clean = stripHtml(text);
  const match = clean.match(/(?:yıkama|yikama|bakım|bakim)[:\s]+([^.\n]{4,160})/i);
  return cleanString(match?.[1] || "Etiket talimatına uygun hassas bakım önerilir.");
}

function applyPricePolicy(price, comparePrice, category) {
  const excluded = ["Plaj Giyim", "İç Giyim", "Aksesuar"].includes(category);
  const current = toNumber(price);
  const compare = toNumber(comparePrice);
  if (!current) return { price: "", comparePrice: "" };
  if (excluded || !PRICE_MARKUP) {
    return {
      price: roundPrice(current),
      comparePrice: compare > current ? roundPrice(compare) : ""
    };
  }
  const nextPrice = current + PRICE_MARKUP;
  const nextCompare = compare > current ? compare + PRICE_MARKUP : 0;
  return {
    price: roundPrice(nextPrice),
    comparePrice: nextCompare > nextPrice ? roundPrice(nextCompare) : ""
  };
}

function normalizeVariantStock(value) {
  return Math.max(MIN_STOCK, Math.round(toNumber(value) || MIN_STOCK));
}

function normalizeProductStock(variants = []) {
  const total = variants.reduce((sum, variant) => sum + normalizeVariantStock(variant.stock), 0);
  return Math.max(MIN_STOCK, total || MIN_STOCK);
}

function productUrlFromConfig(config, value = "") {
  const url = normalizeUrl(value, config.origin);
  return sameHost(url, config.origin) ? url : "";
}

function productUrlLooksValid(config, url = "", block = "") {
  const absolute = productUrlFromConfig(config, url);
  if (!absolute) return false;
  const parsed = new URL(absolute);
  const pathname = parsed.pathname.toLocaleLowerCase("tr-TR");
  if (!pathname || pathname === "/" || isAssetUrl(pathname)) return false;
  if (/\/(?:blog|blogs|pages|page|sayfa|sepet|cart|checkout|account|login|arama|search|iletisim|contact|hakkimizda|about|kvkk|sitemap|cdn)\b/.test(pathname)) {
    return false;
  }
  if (config.urlHints.some((pattern) => pattern.test(pathname))) return true;
  if (parsePriceCandidates(block).length && /<img|data-src|src=/i.test(block)) return true;
  return false;
}

function parseListingCards(html = "", config) {
  const cards = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?<\/a>/gi)) {
    const block = match[0];
    const href = productUrlFromConfig(config, match[1]);
    if (!productUrlLooksValid(config, href, block)) continue;
    const imgAlt = block.match(/<img[^>]+alt=["']([^"']+)["']/i)?.[1] || "";
    const name = cleanString(
      attributeValue(block, "title") ||
        attributeValue(block, "aria-label") ||
        imgAlt ||
        stripHtml(block).replace(/\d[\d.,]*\s*(?:TL|₺).*/i, "")
    );
    const prices = parsePriceCandidates(block);
    const imageUrls = extractImageUrls(block, config.origin);
    const existing = cards.get(href) || { href, name: "", price: 0, comparePrice: 0, imageUrls: [] };
    existing.name = existing.name || name;
    existing.price = existing.price || prices[0] || 0;
    existing.comparePrice = existing.comparePrice || prices.find((price) => price > prices[0]) || 0;
    existing.imageUrls = unique([...existing.imageUrls, ...imageUrls]);
    cards.set(href, existing);
  }
  return [...cards.values()];
}

function paginationLinks(html = "", config, currentPath = "") {
  const links = [];
  for (const match of html.matchAll(/href=["']([^"']*(?:page=|sayfa=|p=|pg=)[^"']*)["']/gi)) {
    const url = normalizeUrl(match[1], config.origin);
    if (url && sameHost(url, config.origin)) links.push(url);
  }
  for (let page = 2; page <= MAX_LISTING_PAGES; page += 1) {
    const base = normalizeUrl(currentPath, config.origin);
    if (!base) continue;
    const url = new URL(base);
    ["page", "sayfa", "p"].forEach((key) => {
      const next = new URL(url);
      next.searchParams.set(key, String(page));
      links.push(next.toString());
    });
  }
  return unique(links).slice(0, MAX_LISTING_PAGES * 3);
}

async function crawlListingCards(config) {
  const queue = unique(config.listingPaths.map((item) => normalizeUrl(item, config.origin)));
  const seen = new Set();
  const cards = new Map();

  while (queue.length && seen.size < config.listingPaths.length * MAX_LISTING_PAGES * 4) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const html = await fetchText(url, 1);
      for (const card of parseListingCards(html, config)) {
        const existing = cards.get(card.href) || card;
        existing.name = existing.name || card.name;
        existing.price = existing.price || card.price;
        existing.comparePrice = existing.comparePrice || card.comparePrice;
        existing.imageUrls = unique([...(existing.imageUrls || []), ...(card.imageUrls || [])]);
        cards.set(card.href, existing);
      }
      paginationLinks(html, config, url).forEach((nextUrl) => {
        if (!seen.has(nextUrl) && queue.length < MAX_LISTING_PAGES * 8) queue.push(nextUrl);
      });
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      console.warn(`Kategori atlandi: ${url} (${error.message})`);
    }
  }

  return [...cards.values()];
}

function sitemapLocs(xml = "") {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => decodeEntities(match[1].trim()));
}

async function collectSitemapUrls(config) {
  const sitemapCandidates = unique([
    `${config.origin}/sitemap.xml`,
    `${config.origin}/sitemap_index.xml`,
    `${config.origin}/sitemap-products.xml`,
    `${config.origin}/sitemap_products_1.xml`
  ]);
  const queue = [...sitemapCandidates];
  const seen = new Set();
  const urls = [];

  while (queue.length && seen.size < MAX_SITEMAPS) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const xml = await fetchText(url, 1);
      const locs = sitemapLocs(xml);
      locs.forEach((loc) => {
        const absolute = normalizeUrl(loc, config.origin);
        if (!absolute || !sameHost(absolute, config.origin)) return;
        if (/sitemap|\.xml(?:\.gz)?$/i.test(absolute) && !seen.has(absolute)) {
          queue.push(absolute);
        } else if (productUrlLooksValid(config, absolute)) {
          urls.push(absolute);
        }
      });
      await sleep(REQUEST_DELAY_MS);
    } catch (error) {
      if (url === sitemapCandidates[0]) console.warn(`${config.label} sitemap okunamadi: ${error.message}`);
    }
  }

  return unique(urls);
}

function shopifyImageUrls(product = {}) {
  return unique(
    [
      ...(Array.isArray(product.images) ? product.images.map((image) => image.src) : []),
      product.image?.src
    ].map((url) => cleanImageUrl(normalizeUrl(url, "https:")))
  );
}

function shopifyOptions(product = {}) {
  const options = new Map();
  (product.options || []).forEach((option, index) => {
    const name = cleanString(option.name || option, `option${index + 1}`).toLocaleLowerCase("tr-TR");
    options.set(index + 1, name);
  });
  return options;
}

function shopifyVariantRows(product = {}, localImages = []) {
  const optionNames = shopifyOptions(product);
  const fallbackColor = inferColors(product.title, product.tags?.join(" "))[0] || "Standart";
  const rows = (product.variants || []).map((variant, index) => {
    const entry = {
      size: "",
      color: "",
      stock: normalizeVariantStock(variant.inventory_quantity || (variant.available === false ? MIN_STOCK : 8)),
      sku: cleanString(variant.sku, `${product.handle || "SHOPIFY"}-${index + 1}`),
      image: localImages[0] || ""
    };
    [1, 2, 3].forEach((slot) => {
      const optionName = optionNames.get(slot) || "";
      const value = cleanString(variant[`option${slot}`]);
      if (!value) return;
      if (/beden|size|numara/.test(optionName) || sizeLooksValid(value)) entry.size = normalizeSizeLabel(value);
      else if (/renk|color/.test(optionName)) entry.color = titleCaseTurkish(value);
    });
    if (!entry.size) entry.size = "Standart";
    if (!entry.color) entry.color = fallbackColor;
    return entry;
  });
  return rows.length ? uniqueBy(rows, (row) => `${row.sku}|${row.size}|${row.color}`) : [];
}

function normalizeShopifyProduct(config, product, index, localImages = []) {
  const url = `${config.origin}/products/${product.handle}`;
  const name = cleanString(product.title || product.handle || `${config.label} ürün ${index + 1}`);
  const tags = Array.isArray(product.tags)
    ? product.tags
    : String(product.tags || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const category = categoryFromProduct({ name, url, tags, productType: product.product_type });
  const variants = shopifyVariantRows(product, localImages);
  const sizes = unique(variants.map((variant) => variant.size)).filter(Boolean);
  const colors = unique([...variants.map((variant) => variant.color), ...inferColors(name, tags.join(" "))]).filter(Boolean);
  const currentPrices = (product.variants || []).map((variant) => toNumber(variant.price)).filter((value) => value > 0);
  const comparePrices = (product.variants || []).map((variant) => toNumber(variant.compare_at_price)).filter((value) => value > 0);
  const basePrice = currentPrices.length ? Math.min(...currentPrices) : 0;
  const baseCompare = comparePrices.length ? Math.max(...comparePrices) : 0;
  const price = applyPricePolicy(basePrice, baseCompare, category.category);
  const description = stripHtml(product.body_html || "");
  const stock = normalizeProductStock(variants);
  const sku = cleanString((product.variants || []).find((variant) => variant.sku)?.sku, `${config.label.toUpperCase()}-${product.id || index + 1}`);

  return {
    id: `${config.source}-${slugify(product.handle || name || index + 1)}`,
    name,
    slug: `${config.source}-${slugify(product.handle || name || index + 1)}`,
    category: category.category,
    subcategory: category.subcategory,
    price: price.price,
    comparePrice: price.comparePrice,
    currency: "TRY",
    stock,
    status: "active",
    featured: index < 48,
    badge: price.comparePrice ? "İndirim" : "Yeni",
    sku,
    image: localImages[0] || shopifyImageUrls(product)[0] || "assets/threon-fashion-hero.png",
    gallery: localImages.length ? localImages : shopifyImageUrls(product).slice(0, Math.max(1, IMAGE_LIMIT || 6)),
    imageFit: "cover",
    imagePosition: "center top",
    imageRatio: "portrait",
    collection: "",
    fit: fitFromName(name),
    modelInfo: "Beden, renk ve stok bilgileri ürün varyantlarına göre gösterilir.",
    shippingNote: "14:00'a kadar verilen siparişler aynı gün kargo hazırlığına alınır.",
    summary: sentenceSummary(description || `${name} THREON kataloğuna eklenen yeni sezon parçası.`),
    description: description || `${name} THREON kataloğuna eklenen yeni sezon parçası.`,
    sizes: sizes.length ? sizes : defaultSizes(category.category, category.subcategory),
    colors: colors.length ? colors : ["Standart"],
    material: materialFromText(description),
    care: careFromText(description),
    features: unique([`${category.category} / ${category.subcategory}`, fitFromName(name), materialFromText(description)]).slice(0, 6),
    genderSections: ["Kadın"],
    specs: {
      Marka: "THREON",
      Kategori: `${category.category} / ${category.subcategory}`,
      "Kaynak ürün kodu": sku,
      "Toplam stok": String(stock)
    },
    variants: variants.length
      ? variants
      : defaultSizes(category.category, category.subcategory).map((size, sizeIndex) => ({
          size,
          color: colors[0] || "Standart",
          stock: MIN_STOCK,
          sku: `${sku}-${sizeIndex + 1}`,
          image: localImages[0] || ""
        })),
    reviews: [],
    source: config.source,
    sourceUrl: url,
    importedAt: new Date().toISOString()
  };
}

async function readShopifySources(config) {
  const products = [];
  const seen = new Set();
  const brandLimit = Math.max(0, Number(process.env[`${config.source.toUpperCase()}_LIMIT`] || GLOBAL_LIMIT));
  for (let page = 1; page <= 80; page += 1) {
    const url = `${config.origin}/products.json?limit=250&page=${page}`;
    const json = await fetchJson(url, 2);
    const rows = Array.isArray(json.products) ? json.products : [];
    if (!rows.length) break;
    rows.forEach((product) => {
      const key = cleanString(product.handle || product.id);
      if (!key || seen.has(key)) return;
      seen.add(key);
      products.push(product);
    });
    console.log(`${config.label}: products.json sayfa ${page}, toplam ${products.length}`);
    if (brandLimit && products.length >= brandLimit) break;
    await sleep(REQUEST_DELAY_MS);
  }
  return brandLimit ? products.slice(0, brandLimit) : products;
}

function extractBreadcrumb(html = "") {
  const json = parseJsonLd(html).find((entry) => jsonLdType(entry).toLowerCase().includes("breadcrumblist"));
  if (json?.itemListElement) {
    return json.itemListElement
      .map((item) => cleanString(item?.item?.name || item?.name))
      .filter(Boolean)
      .join(" / ");
  }
  const match = stripHtml(html.match(/breadcrumb[\s\S]{0,1600}/i)?.[0] || "");
  return sentenceSummary(match, 180);
}

function parseGenericDetail(config, url, html = "", card = {}) {
  const jsonProduct = productJsonLd(html);
  const jsonOfferPrice = offerPrice(jsonProduct.offers);
  const title = cleanString(
    jsonProduct.name ||
      metaContent(html, "og:title").replace(/\s*[|-]\s*(Quzu|Dilvin|Manuka).*$/i, "") ||
      card.name ||
      textFromTitle(html) ||
      decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "")
  );
  const rawDescription =
    jsonProduct.description ||
    metaContent(html, "description") ||
    metaContent(html, "og:description") ||
    html.match(/(?:product-detail|product-description|urun-aciklama|description)[\s\S]{0,2400}/i)?.[0] ||
    "";
  const description = stripHtml(rawDescription);
  const priceCandidates = unique([jsonOfferPrice, card.price, ...parsePriceCandidates(html)].filter((value) => toNumber(value) > 0).map((value) => Math.round(toNumber(value))));
  const price = priceCandidates[0] || 0;
  const comparePrice = card.comparePrice || priceCandidates.find((value) => value > price + 1) || 0;
  const breadcrumb = extractBreadcrumb(html);
  const category = categoryFromProduct({ name: title, url, tags: [], productType: "", breadcrumb });
  const colors = inferColors(title, description, breadcrumb);
  const sizes = extractSizes(html, description);
  const sku =
    cleanString(jsonProduct.sku) ||
    cleanString(html.match(/(?:sku|stok kodu|ürün kodu|urun kodu)["':\s-]+([A-Z0-9._-]{3,40})/i)?.[1]) ||
    `${config.label.toUpperCase()}-${slugify(title).slice(0, 26).toUpperCase()}`;
  const images = unique([...(card.imageUrls || []), ...extractImageUrls(html, config.origin, jsonProduct)]);

  return {
    name: titleCaseTurkish(title),
    description,
    price,
    comparePrice,
    category,
    colors,
    sizes,
    sku,
    images,
    breadcrumb
  };
}

function normalizeGenericProduct(config, url, detail, index, localImages = []) {
  const slug = slugify(new URL(url).pathname.split("/").filter(Boolean).pop() || detail.name || `${config.source}-${index + 1}`);
  const price = applyPricePolicy(detail.price, detail.comparePrice, detail.category.category);
  const sizes = detail.sizes.length ? detail.sizes : defaultSizes(detail.category.category, detail.category.subcategory);
  const colors = detail.colors.length ? detail.colors : ["Standart"];
  const variants = sizes.map((size, sizeIndex) => ({
    size,
    color: colors[0],
    stock: MIN_STOCK,
    sku: `${detail.sku}-${sizeIndex + 1}`,
    image: localImages[0] || ""
  }));
  const stock = normalizeProductStock(variants);
  const material = materialFromText(detail.description);
  const fit = fitFromName(detail.name);

  return {
    id: `${config.source}-${slug}`,
    name: detail.name,
    slug: `${config.source}-${slug}`,
    category: detail.category.category,
    subcategory: detail.category.subcategory,
    price: price.price,
    comparePrice: price.comparePrice,
    currency: "TRY",
    stock,
    status: "active",
    featured: index < 48,
    badge: price.comparePrice ? "İndirim" : "Yeni",
    sku: detail.sku,
    image: localImages[0] || detail.images[0] || "assets/threon-fashion-hero.png",
    gallery: localImages.length ? localImages : detail.images.slice(0, Math.max(1, IMAGE_LIMIT || 6)),
    imageFit: "cover",
    imagePosition: "center top",
    imageRatio: "portrait",
    collection: "",
    fit,
    modelInfo: "Beden, renk ve stok bilgileri ürün varyantlarına göre gösterilir.",
    shippingNote: "14:00'a kadar verilen siparişler aynı gün kargo hazırlığına alınır.",
    summary: sentenceSummary(detail.description || `${detail.name} THREON kataloğuna eklenen yeni sezon parçası.`),
    description: detail.description || `${detail.name} THREON kataloğuna eklenen yeni sezon parçası.`,
    sizes,
    colors,
    material,
    care: careFromText(detail.description),
    features: unique([`${detail.category.category} / ${detail.category.subcategory}`, fit, material]).slice(0, 6),
    genderSections: ["Kadın"],
    specs: {
      Marka: "THREON",
      Kategori: `${detail.category.category} / ${detail.category.subcategory}`,
      "Kaynak ürün kodu": detail.sku,
      "Toplam stok": String(stock)
    },
    variants,
    reviews: [],
    source: config.source,
    sourceUrl: url,
    importedAt: new Date().toISOString()
  };
}

async function readGenericSources(config) {
  const [sitemapUrls, cards] = await Promise.all([collectSitemapUrls(config), crawlListingCards(config)]);
  const cardMap = new Map(cards.map((card) => [card.href, card]));
  const urls = unique([...cards.map((card) => card.href), ...sitemapUrls]);
  const brandLimit = Math.max(0, Number(process.env[`${config.source.toUpperCase()}_LIMIT`] || GLOBAL_LIMIT));
  return (brandLimit ? urls.slice(0, brandLimit) : urls).map((url) => ({ url, card: cardMap.get(url) || {} }));
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function importShopifyProduct(config, product, index, total) {
  const slug = slugify(product.handle || product.title || `${config.source}-${index + 1}`);
  const localImages = await downloadProductImages(config, slug, shopifyImageUrls(product));
  const normalized = normalizeShopifyProduct(config, product, index, localImages);
  if ((index + 1) % 25 === 0 || index === total - 1) console.log(`${config.label}: ${index + 1}/${total} ${normalized.name}`);
  await sleep(REQUEST_DELAY_MS);
  return normalized;
}

async function importGenericProduct(config, source, index, total) {
  const html = await fetchText(source.url, 2);
  const detail = parseGenericDetail(config, source.url, html, source.card);
  if (!detail.name || !detail.price) throw new Error("Ürün adı veya fiyatı okunamadı.");
  const slug = slugify(new URL(source.url).pathname.split("/").filter(Boolean).pop() || detail.name || `${config.source}-${index + 1}`);
  const imageUrls = detail.images.length ? detail.images : source.card.imageUrls || [];
  const localImages = await downloadProductImages(config, slug, imageUrls);
  const normalized = normalizeGenericProduct(config, source.url, detail, index, localImages);
  if ((index + 1) % 25 === 0 || index === total - 1) console.log(`${config.label}: ${index + 1}/${total} ${normalized.name}`);
  await sleep(REQUEST_DELAY_MS);
  return normalized;
}

async function importBrand(config) {
  const startedAt = Date.now();
  const failures = [];
  let sources = [];
  let sourceMode = config.kind;
  console.log(`${config.label} aktarimi basladi...`);

  if (config.kind === "shopify") {
    try {
      sources = await readShopifySources(config);
    } catch (error) {
      console.warn(`${config.label} products.json okunamadi, kategori/sitemap yedegi deneniyor: ${error.message}`);
      sources = await readGenericSources(config);
      sourceMode = "generic";
    }
  } else {
    sources = await readGenericSources(config);
  }
  if (!sources.length) throw new Error(`${config.label} için ürün adresi bulunamadı.`);

  const results = await mapLimit(sources, CONCURRENCY, async (source, index) => {
    try {
      return sourceMode === "shopify"
        ? await importShopifyProduct(config, source, index, sources.length)
        : await importGenericProduct(config, source, index, sources.length);
    } catch (error) {
      failures.push({
        url: sourceMode === "shopify" ? `${config.origin}/products/${source.handle}` : source.url,
        name: source.title || source.card?.name || "",
        error: error.message
      });
      console.warn(`${config.label} atlandi: ${source.url || source.handle || source.title} (${error.message})`);
      return null;
    }
  });

  const products = sortImportedProducts(results.filter(Boolean));
  return {
    config,
    products,
    failures,
    sourceCount: sources.length,
    durationSeconds: Math.round((Date.now() - startedAt) / 1000)
  };
}

function importedProductRank(product = {}) {
  const categoryRank = {
    "Takımlar": 0,
    "Dış Giyim": 1,
    "Üst Giyim": 2,
    "Alt Giyim": 3,
    "Plaj Giyim": 4,
    "İç Giyim": 5,
    "Aksesuar": 6
  };
  const subcategoryRank = {
    "Alt Üst Takım": 0,
    "Eşofman Takımı": 1,
    "Takım Elbise": 2,
    "Ceket": 3,
    "Kaban": 4,
    "Mont": 5,
    "Palto | Trençkot": 6,
    "Gömlek": 7,
    "Bluz": 8,
    "Tunik": 9,
    "Triko | Kazak": 10,
    "T-Shirt": 11,
    "Pantolon": 12,
    "Jeans": 13,
    "Etek": 14,
    "Şort": 15
  };
  return [
    categoryRank[product.category] ?? 9,
    subcategoryRank[product.subcategory] ?? 30,
    product.featured ? 0 : 1,
    product.stock > 0 ? 0 : 1,
    Number(product.price) || 999999,
    product.name
  ];
}

function sortImportedProducts(products) {
  return [...products].sort((a, b) => {
    const left = importedProductRank(a);
    const right = importedProductRank(b);
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return 0;
  });
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
  if (/ceket|mont|kaban|gömlek|gomlek|yelek|pantolon|takım|takim|hoodie|sweat|cargo|triko|sütyen|sutyen|külot|kulot|bralet|büstiyer|bustiyer|korse|atlet|body|boxer|tunik|bluz|elbise|etek/.test(`${name} ${subcategory}`)) score += 24;
  if (price > 0 && price <= 2500) score += 95;
  else if (price <= 4500) score += 75;
  else if (price <= 7500) score += 45;
  else if (price <= 12000) score += 20;
  else score -= 18;
  if (/gift card|hediye kart|aksesuar|çorap|corap/.test(name)) score -= 220;

  return score;
}

function compactText(value = "", maxLength = 170) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function publicProductSummary(product = {}) {
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
    imageFit: product.imageFit || "cover",
    imagePosition: product.imagePosition || "center center",
    imageRatio: product.imageRatio || "portrait",
    collection: product.collection,
    fit: product.fit,
    summary: compactText(product.summary || product.description || product.fit || ""),
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    genderSections: Array.isArray(product.genderSections) ? product.genderSections : [],
    merchandisingScore: productMerchandisingScore(product)
  };
}

function publicData(data) {
  return {
    settings: data.settings,
    products: (Array.isArray(data.products) ? data.products : [])
      .filter((product) => product.status === "active")
      .map((product, index) => ({ product, index, score: productMerchandisingScore(product) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ product }) => publicProductSummary(product))
  };
}

function reportCategoryCounts(products = []) {
  return products.reduce((counts, product) => {
    const key = `${product.category} / ${product.subcategory}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

async function main() {
  const brands = selectedBrands();
  if (!brands.length) throw new Error("Geçerli marka seçilmedi. FASHION_IMPORT_BRANDS=quzu,dilvin,manuka kullanın.");
  const startedAt = Date.now();
  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const brandResults = [];

  for (const config of brands) {
    try {
      const result = await importBrand(config);
      if (!result.products.length) throw new Error(`${config.label} için ürün aktarılamadı.`);
      result.products.forEach((product, index) => {
        product.featured = index < 48 && !["Aksesuar", "İç Giyim", "Plaj Giyim"].includes(product.category);
      });
      brandResults.push(result);
      console.log(`${config.label} tamamlandi: ${result.products.length}/${result.sourceCount}`);
    } catch (error) {
      brandResults.push({
        config,
        products: [],
        failures: [{ url: config.origin, error: error.message }],
        sourceCount: 0,
        durationSeconds: 0
      });
      console.warn(`${config.label} aktarimi tamamlanamadi: ${error.message}`);
    }
  }

  const importedProducts = brandResults.flatMap((result) => result.products);
  if (!importedProducts.length) {
    fs.writeFileSync(
      REPORT_FILE,
      `${JSON.stringify(
        {
          imported: 0,
          error: "Hiç ürün aktarılamadı.",
          brands: brandResults.map((result) => ({
            source: result.config.source,
            label: result.config.label,
            failures: result.failures
          })),
          durationSeconds: Math.round((Date.now() - startedAt) / 1000)
        },
        null,
        2
      )}\n`
    );
    throw new Error("Hiç Quzu/Dilvin/Manuka ürünü aktarılamadı. Detay: data/fashion-import-report.json");
  }

  const importedSources = new Set(brandResults.map((result) => result.config.source));
  const currentProducts = Array.isArray(siteData.products) ? siteData.products : [];
  const keepProducts = currentProducts.filter((product) => !importedSources.has(product.source) && ![...importedSources].some((source) => String(product.id || "").startsWith(`${source}-`)));
  siteData.products = [...sortImportedProducts(importedProducts), ...keepProducts];
  const settingsPatch = {};
  brandResults.forEach((result) => {
    const name = result.config.source.charAt(0).toUpperCase() + result.config.source.slice(1);
    settingsPatch[`last${name}Import`] = new Date().toISOString();
    settingsPatch[`${result.config.source}ProductCount`] = result.products.length;
    settingsPatch[`${result.config.source}SourceProductCount`] = result.sourceCount;
  });
  siteData.settings = {
    ...(siteData.settings || {}),
    ...settingsPatch,
    lastFashionImport: new Date().toISOString(),
    fashionImportPriceMarkup: PRICE_MARKUP
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(publicData(siteData)));
  fs.writeFileSync(
    REPORT_FILE,
    `${JSON.stringify(
      {
        imported: importedProducts.length,
        brands: brandResults.map((result) => ({
          source: result.config.source,
          label: result.config.label,
          imported: result.products.length,
          sourceCount: result.sourceCount,
          failures: result.failures,
          durationSeconds: result.durationSeconds,
          categoryCounts: reportCategoryCounts(result.products)
        })),
        imageLimit: IMAGE_LIMIT,
        minStock: MIN_STOCK,
        priceMarkup: PRICE_MARKUP,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        totalProductCount: siteData.products.length
      },
      null,
      2
    )}\n`
  );

  console.log(`Tamamlandi: ${importedProducts.length} Quzu/Dilvin/Manuka urunu THREON'a aktarildi.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
