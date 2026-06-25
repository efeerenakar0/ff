const fs = require("fs");
const path = require("path");

const STORE_URL = "https://www.penti.com";
const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const PUBLIC_DATA_FILE = path.join(process.cwd(), "data", "site-public.json");
const REPORT_FILE = path.join(process.cwd(), "data", "penti-import-report.json");
const ASSET_DIR = path.join(process.cwd(), "assets", "penti");
const ASSET_PUBLIC_DIR = "assets/penti";
const SOURCE_MARKER = "penti";
const REQUEST_TIMEOUT_MS = Number(process.env.PENTI_TIMEOUT_MS || 22000);
const REQUEST_DELAY_MS = Number(process.env.PENTI_DELAY_MS || 55);
const CONCURRENCY = Math.max(1, Number(process.env.PENTI_CONCURRENCY || 8));
const IMAGE_LIMIT = Math.max(0, Number(process.env.PENTI_IMAGE_LIMIT || 2));
const LIMIT = Math.max(0, Number(process.env.PENTI_LIMIT || 0));
const CATEGORY_PATHS = (process.env.PENTI_CATEGORY_PATHS || "/tr/c/kadin-ic-giyim,/tr/c/boxer,/tr/c/erkek-atlet")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const ENTITY_MAP = {
  amp: "&",
  quot: '"',
  "#034": '"',
  "#039": "'",
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " "
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuffer(url, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "THREON Penti product import/1.0 (+owner requested local import)",
          Accept: "text/html,application/xhtml+xml,application/xml,image/avif,image/webp,image/*,*/*"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(350 + attempt * 650);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchText(url, retries = 2) {
  return (await fetchBuffer(url, retries)).toString("utf8");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
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
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n\s+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
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
    .slice(0, 90);
}

function titleCaseTurkish(value = "") {
  return cleanString(value)
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function roundPrice(value) {
  return Math.round(toNumber(value));
}

function normalizeUrl(value = "") {
  const raw = decodeEntities(cleanString(value));
  if (!raw || /placeholder|resim-hazirlaniyor/i.test(raw)) return "";
  if (raw.startsWith("//")) return `https:${raw}`;
  if (raw.startsWith("/")) return `${STORE_URL}${raw}`;
  return raw;
}

function categoryUrl(pathname = "") {
  if (/^https?:\/\//i.test(pathname)) return pathname;
  return `${STORE_URL}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
}

function appendQuery(url, params = {}) {
  const next = new URL(url);
  Object.entries(params).forEach(([key, value]) => next.searchParams.set(key, value));
  return next.toString();
}

function parsePagination(html = "") {
  const match = html.match(/js-hidden-pagination[^>]+data-count="([^"]+)"[^>]+data-url="([^"]+)"/i);
  if (!match) return { maxPage: 0, ajaxUrl: "" };
  const count = Math.max(0, Number(match[1]) || 0);
  const ajaxPath = decodeEntities(match[2]);
  const maxPage = count > 0 ? count : 0;
  const ajaxUrl = ajaxPath.startsWith("/tr/") ? `${STORE_URL}${ajaxPath}` : `${STORE_URL}/tr${ajaxPath.startsWith("/") ? "" : "/"}${ajaxPath}`;
  return { maxPage, ajaxUrl };
}

function parseJsonLdProducts(html = "") {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(match[1]);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    })
    .flatMap((entry) => {
      if (entry?.["@type"] === "ItemList" && Array.isArray(entry.itemListElement)) {
        return entry.itemListElement.map((item) => item.item).filter(Boolean);
      }
      return entry?.["@type"] === "Product" ? [entry] : [];
    });
}

function parseGtmProduct(raw = "") {
  try {
    return JSON.parse(decodeEntities(raw));
  } catch {
    return {};
  }
}

function productBlocks(html = "") {
  return html
    .split(/(?=<div data-page="\d+" class="prd\b)/g)
    .filter((block) => /class="prd-link"/.test(block));
}

function parseProductCards(html = "", categoryPath = "", jsonProductMap = new Map()) {
  return productBlocks(html).map((block) => {
    const href = decodeEntities(block.match(/<a class="prd-link"\s+href="([^"]+)"/i)?.[1] || "");
    const gtmRaw = block.match(/data-gtm-product="([\s\S]*?)">\s*<div class="prd-block1/i)?.[1] || "";
    const gtm = parseGtmProduct(gtmRaw);
    const absoluteUrl = normalizeUrl(href);
    const jsonProduct = jsonProductMap.get(absoluteUrl) || {};
    const productName = cleanString(gtm.name || jsonProduct.name || block.match(/title="([^"]+)"/i)?.[1] || "");
    const sourceCode = cleanString(gtm.dimension14 || block.match(/data-prd-code="([^"]+)"/i)?.[1] || gtm.id || "");
    const imageUrls = unique([
      gtm.dimension19,
      jsonProduct.image,
      ...[...block.matchAll(/(?:data-src|data-src-retina|src)=["']([^"']*pentiimages[^"']+)["']/gi)].map((match) => match[1])
    ].map((url) => normalizePentiImage(normalizeUrl(url))));
    const colors = unique([
      inferColor(productName),
      ...[...block.matchAll(/<img[^>]+class="[^"]*color-variant-image[^"]*"[^>]+alt="([^"]*)"/gi)].map((match) =>
        titleCaseTurkish(decodeEntities(match[1]))
      )
    ]).filter((color) => color && !/^standart$/i.test(color));

    return {
      href: absoluteUrl,
      categoryPath,
      gtm,
      jsonProduct,
      name: productName,
      sourceCode,
      imageUrls,
      colors
    };
  });
}

function normalizePentiImage(url = "") {
  if (!url) return "";
  return url.replace(/mnresize\/\d+\/\d+\//i, "mnresize/550/825/");
}

function inferColor(name = "") {
  const source = cleanString(name).toLocaleLowerCase("tr-TR");
  const colors = [
    ["siyah", "Siyah"],
    ["black", "Siyah"],
    ["beyaz", "Beyaz"],
    ["kırık beyaz", "Kırık Beyaz"],
    ["kirik beyaz", "Kırık Beyaz"],
    ["ekru", "Ekru"],
    ["krem", "Krem"],
    ["bej", "Bej"],
    ["nude", "Nude"],
    ["ten", "Ten"],
    ["kahverengi", "Kahverengi"],
    ["kahve", "Kahverengi"],
    ["vizon", "Vizon"],
    ["gri", "Gri"],
    ["füme", "Füme"],
    ["fume", "Füme"],
    ["mavi", "Mavi"],
    ["lacivert", "Lacivert"],
    ["indigo", "İndigo"],
    ["mint", "Mint"],
    ["yeşil", "Yeşil"],
    ["yesil", "Yeşil"],
    ["pembe", "Pembe"],
    ["lila", "Lila"],
    ["mor", "Mor"],
    ["gül kurusu", "Gül Kurusu"],
    ["gul kurusu", "Gül Kurusu"],
    ["kırmızı", "Kırmızı"],
    ["kirmizi", "Kırmızı"],
    ["bordo", "Bordo"],
    ["fusya", "Fuşya"],
    ["renkli", "Renkli"]
  ];
  return colors.find(([needle]) => source.includes(needle))?.[1] || "";
}

function subcategoryFromProduct(name = "", url = "", categoryPath = "") {
  const source = `${name} ${url} ${categoryPath}`.toLocaleLowerCase("tr-TR");
  const has = (...terms) => terms.some((term) => source.includes(term));
  if (has("sütyen", "sutyen", "bra")) return "Sütyen";
  if (has("bralet")) return "Bralet";
  if (has("büstiyer", "bustiyer")) return "Büstiyer";
  if (has("jartiyer")) return "Jartiyer";
  if (has("babydoll", "bodysuit")) return "Babydoll & Bodysuit";
  if (has("korse")) return "Korse";
  if (has("kombinezon", "jüpon", "jupon")) return "Kombinezon & Jüpon";
  if (has("atlet", "body")) return "Atlet & Body";
  if (has("boxer")) return "Boxer";
  if (has("külot", "kulot", "slip", "tanga", "brazilian", "hipster")) return "Külot";
  return "Diğer İç Giyim";
}

function sizeSetFor(subcategory = "", firstSize = "") {
  const normalized = cleanString(firstSize);
  const base = (() => {
    if (subcategory === "Sütyen") return ["75B", "80B", "85B", "90B"];
    if (subcategory === "Bralet" || subcategory === "Büstiyer" || subcategory === "Atlet & Body") return ["XS", "S", "M", "L", "XL"];
    if (subcategory === "Boxer") return ["S", "M", "L", "XL", "XXL"];
    if (subcategory === "Kombinezon & Jüpon" || subcategory === "Babydoll & Bodysuit" || subcategory === "Korse") return ["XS", "S", "M", "L", "XL"];
    if (subcategory === "Jartiyer") return ["S/M", "M/L"];
    return ["XS", "S", "M", "L", "XL"];
  })();
  return unique([normalized, ...base]).filter(Boolean);
}

function stockFromGtm(gtm = {}) {
  return Math.max(0, Math.round(toNumber(gtm.dimension21) || 0));
}

function imageExtension(url = "") {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext) ? ext : ".jpg";
  } catch {
    return ".jpg";
  }
}

async function downloadProductImages(slug, imageUrls) {
  fs.mkdirSync(ASSET_DIR, { recursive: true });
  const localPaths = [];
  const limitedUrls = IMAGE_LIMIT > 0 ? imageUrls.slice(0, IMAGE_LIMIT) : imageUrls;

  for (const [index, sourceUrl] of limitedUrls.entries()) {
    const ext = imageExtension(sourceUrl);
    const fileName = `${slug}-${String(index + 1).padStart(2, "0")}${ext}`;
    const localFile = path.join(ASSET_DIR, fileName);
    const publicFile = `${ASSET_PUBLIC_DIR}/${fileName}`;

    if (!fs.existsSync(localFile) || fs.statSync(localFile).size === 0) {
      try {
        const buffer = await fetchBuffer(sourceUrl, 1);
        fs.writeFileSync(localFile, buffer);
        await sleep(15);
      } catch (error) {
        console.warn(`Gorsel atlandi: ${sourceUrl} (${error.message})`);
        continue;
      }
    }
    localPaths.push(publicFile);
  }

  return localPaths;
}

function sentenceSummary(text = "", fallback = "", maxLength = 210) {
  const clean = cleanString(stripHtml(text) || fallback);
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength);
  return `${sliced.slice(0, Math.max(0, sliced.lastIndexOf(" ")))}...`;
}

function normalizeProduct(card, index, localImages) {
  const name = cleanString(card.name, `Penti İç Giyim Ürünü ${index + 1}`);
  const subcategory = subcategoryFromProduct(name, card.href, card.categoryPath);
  const code = cleanString(card.sourceCode || card.gtm.id || `PENTI-${index + 1}`);
  const slugBase = slugify(`${name}-${code}`);
  const slug = `penti-${slugBase || String(index + 1).padStart(5, "0")}`;
  const currentPrice = roundPrice(card.gtm.price || card.jsonProduct?.offers?.price || 0);
  const comparePrice = roundPrice(card.gtm.dimension16 || 0);
  const stock = stockFromGtm(card.gtm);
  const sizes = sizeSetFor(subcategory, card.gtm.dimension20);
  const colors = card.colors.length ? card.colors : [inferColor(name) || "Standart"];
  const gallery = localImages.length ? localImages : card.imageUrls;
  const description = sentenceSummary(
    card.jsonProduct?.description,
    `${name}, THREON iç giyim seçkisine eklenen konfor odaklı premium parçalardan biridir.`
  );

  return {
    id: slug,
    name,
    slug,
    category: "İç Giyim",
    subcategory,
    price: currentPrice ? String(currentPrice) : "0",
    comparePrice: comparePrice > currentPrice ? String(comparePrice) : "",
    currency: "TRY",
    stock: stock || 12,
    status: "active",
    featured: index < 48,
    badge: comparePrice > currentPrice ? "İndirim" : "",
    sku: code,
    image: gallery[0] || "assets/product-tee.png",
    gallery: gallery.length ? gallery : ["assets/product-tee.png"],
    collection: "",
    fit: subcategory === "Sütyen" ? "Destekli ve konforlu form" : "Günlük konfor kalıbı",
    modelInfo: "Beden ve stok bilgileri ürün tipine göre düzenlenmiştir.",
    shippingNote: "14:00'a kadar verilen siparişler aynı gün kargo hazırlığına alınır.",
    summary: description,
    description,
    sizes,
    colors,
    material: /pamuk/i.test(name) ? "Pamuk karışımlı konfor kumaşı" : "Yumuşak dokulu premium iç giyim kumaşı",
    care: "Etiket talimatına uygun hassas yıkama önerilir.",
    features: unique([
      "THREON iç giyim seçkisi",
      `İç Giyim / ${subcategory}`,
      colors[0] ? `${colors[0]} renk seçeneği` : "",
      stock > 0 ? "Stoklu ürün" : ""
    ]),
    specs: {
      Marka: "THREON",
      Kategori: `İç Giyim / ${subcategory}`,
      "Ürün kodu": code,
      "Kaynak stok": String(stock || 12),
      "Kaynak beden": cleanString(card.gtm.dimension20 || "")
    },
    variants: sizes.map((size, sizeIndex) => ({
      size,
      color: colors[0] || "Standart",
      stock: Math.max(1, Math.floor((stock || 12) / Math.max(1, sizeIndex + 2))),
      sku: `${code}-${slugify(size) || sizeIndex + 1}`,
      image: gallery[0] || "assets/product-tee.png"
    })),
    reviews: [],
    source: SOURCE_MARKER,
    sourceUrl: card.href,
    importedAt: new Date().toISOString()
  };
}

function importedProductRank(product = {}) {
  const subcategoryRank = {
    "Sütyen": 0,
    "Külot": 1,
    "Bralet": 2,
    "Büstiyer": 3,
    "Atlet & Body": 4,
    "Korse": 5,
    "Babydoll & Bodysuit": 6,
    "Jartiyer": 7,
    "Kombinezon & Jüpon": 8,
    "Boxer": 9
  };
  return [
    subcategoryRank[product.subcategory] ?? 20,
    product.featured ? 0 : 1,
    product.stock > 0 ? 0 : 1,
    toNumber(product.price),
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

async function readCategoryCards(categoryPath) {
  const firstUrl = categoryUrl(categoryPath);
  const firstHtml = await fetchText(firstUrl);
  const jsonProducts = new Map(
    parseJsonLdProducts(firstHtml)
      .map((product) => [normalizeUrl(product?.offers?.url || ""), product])
      .filter(([url]) => url)
  );
  const cards = parseProductCards(firstHtml, categoryPath, jsonProducts);
  const { maxPage, ajaxUrl } = parsePagination(firstHtml);

  for (let page = 1; page <= maxPage; page += 1) {
    const pageHtml = await fetchText(appendQuery(ajaxUrl, { page: String(page) }));
    cards.push(...parseProductCards(pageHtml, categoryPath));
    console.log(`${categoryPath} sayfa ${page}/${maxPage} okundu`);
    await sleep(REQUEST_DELAY_MS);
  }

  return cards;
}

async function readAllCards() {
  const allCards = [];
  for (const categoryPath of CATEGORY_PATHS) {
    try {
      const cards = await readCategoryCards(categoryPath);
      allCards.push(...cards);
      console.log(`${categoryPath} -> ${cards.length} kart`);
    } catch (error) {
      console.warn(`${categoryPath} atlandi: ${error.message}`);
    }
  }

  const byUrl = new Map();
  allCards.forEach((card) => {
    if (!card.href || !card.name) return;
    if (!byUrl.has(card.href)) byUrl.set(card.href, card);
  });

  const cards = [...byUrl.values()];
  return LIMIT ? cards.slice(0, LIMIT) : cards;
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

function compactText(value = "", maxLength = 500) {
  const text = cleanString(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function productMerchandisingScore(product = {}) {
  const source = String(product.source || product.vendor || product.brand || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();
  const category = String(product.category || "").toLowerCase();
  const subcategory = String(product.subcategory || "").toLowerCase();
  const price = Number(product.price) || 0;
  let score = 0;

  if (source.includes("vamos")) score += 130;
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
    collection: product.collection,
    fit: product.fit,
    summary: compactText(product.summary || product.description || product.fit || ""),
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    merchandisingScore: productMerchandisingScore(product)
  };
}

function publicData(data) {
  return {
    settings: data.settings,
    products: data.products
      .filter((product) => product.status === "active")
      .map((product, index) => ({ product, index, score: productMerchandisingScore(product) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ product }) => publicProductSummary(product))
  };
}

async function main() {
  const startedAt = Date.now();
  const cards = await readAllCards();
  if (!cards.length) throw new Error("Penti kategori sayfalarında ürün bulunamadı.");

  const failures = [];
  console.log(`Penti aktarimi basladi: ${cards.length} urun, concurrency=${CONCURRENCY}, imageLimit=${IMAGE_LIMIT || "all"}`);

  const results = await mapLimit(cards, CONCURRENCY, async (card, index) => {
    try {
      const slug = slugify(`${card.name}-${card.sourceCode || index + 1}`);
      const localImages = await downloadProductImages(slug || `penti-${index + 1}`, card.imageUrls);
      const product = normalizeProduct(card, index, localImages);
      if ((index + 1) % 25 === 0 || index === cards.length - 1) {
        console.log(`${String(index + 1).padStart(4, "0")}/${cards.length} ${product.name} -> ${product.gallery.length} gorsel`);
      }
      return product;
    } catch (error) {
      failures.push({ url: card.href, name: card.name, error: error.message });
      console.warn(`Atlandi: ${card.href} (${error.message})`);
      return null;
    }
  });

  const imported = sortImportedProducts(results.filter(Boolean));
  if (!imported.length) throw new Error(`Hiç Penti ürünü aktarılamadı. Hata sayısı: ${failures.length}`);

  imported.forEach((product, index) => {
    product.featured = index < 72;
  });

  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const currentProducts = Array.isArray(siteData.products) ? siteData.products : [];
  const keepProducts = currentProducts.filter((product) => product.source !== SOURCE_MARKER && !String(product.id || "").startsWith("penti-"));
  siteData.products = [...imported, ...keepProducts];
  siteData.settings = {
    ...(siteData.settings || {}),
    lastPentiImport: new Date().toISOString(),
    pentiProductCount: imported.length,
    pentiCategoryPaths: CATEGORY_PATHS
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  fs.writeFileSync(PUBLIC_DATA_FILE, JSON.stringify(publicData(siteData)));
  fs.writeFileSync(
    REPORT_FILE,
    `${JSON.stringify(
      {
        imported: imported.length,
        failures,
        sourceCards: cards.length,
        categoryPaths: CATEGORY_PATHS,
        imageLimit: IMAGE_LIMIT,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        categoryCounts: imported.reduce((counts, product) => {
          const key = `${product.category} / ${product.subcategory}`;
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        }, {})
      },
      null,
      2
    )}\n`
  );

  console.log(`Tamamlandi: ${imported.length}/${cards.length} Penti urunu THREON'a aktarildi.`);
  if (failures.length) console.log(`Hata raporu: data/penti-import-report.json (${failures.length} hata)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
