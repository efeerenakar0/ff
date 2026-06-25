const fs = require("fs");
const path = require("path");
const { localizedLesBenjaminsName } = require("./lesbenjamins-name-utils");

const STORE_URL = "https://lesbenjamins.com";
const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const REPORT_FILE = path.join(process.cwd(), "data", "lesbenjamins-import-report.json");
const ASSET_DIR = path.join(process.cwd(), "assets", "lesbenjamins");
const ASSET_PUBLIC_DIR = "assets/lesbenjamins";
const SOURCE_MARKER = "lesbenjamins";
const REQUEST_TIMEOUT_MS = Number(process.env.LES_TIMEOUT_MS || 24000);
const REQUEST_DELAY_MS = Number(process.env.LES_DELAY_MS || 180);
const CONCURRENCY = Math.max(1, Number(process.env.LES_CONCURRENCY || 3));
const IMAGE_LIMIT = Math.max(0, Number(process.env.LES_IMAGE_LIMIT || 8));
const LIMIT = Math.max(0, Number(process.env.LES_LIMIT || 0));

const ENTITY_MAP = {
  amp: "&",
  quot: '"',
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
          "User-Agent": "THREON Les Benjamins product import/1.0 (+owner requested local import)",
          Accept: "application/json,text/html,application/xhtml+xml,application/xml,image/avif,image/webp,image/*,*/*"
        }
      });
      if (!response.ok) {
        if (response.status === 429 && attempt < retries) {
          await sleep(4000 + attempt * 5000);
        }
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(400 + attempt * 650);
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

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function decodeEntities(value = "") {
  return String(value).replace(/&([^;]+);/g, (match, entity) => {
    if (ENTITY_MAP[entity]) return ENTITY_MAP[entity];
    if (entity.startsWith("#x")) return String.fromCharCode(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCharCode(parseInt(entity.slice(1), 10));
    return match;
  });
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
    .slice(0, 78);
}

function titleCase(value = "") {
  return cleanString(value)
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function sentenceSummary(text = "", maxLength = 190) {
  const clean = cleanString(text);
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength);
  return `${sliced.slice(0, Math.max(0, sliced.lastIndexOf(" ")))}...`;
}

function normalizeUrl(value = "") {
  if (typeof value !== "string") return "";
  const url = cleanString(value);
  if (!url || /^(true|false|null|undefined)$/i.test(url)) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${STORE_URL}${url}`;
  return url;
}

function centsToPrice(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  return String(Math.round(amount / 100));
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

function baseSku(product = {}) {
  const sku = cleanString(product.variants?.find((variant) => cleanString(variant.sku))?.sku);
  return cleanString(sku.split("/")[0], `LES-${product.id || product.handle || "PRODUCT"}`);
}

function sourceText(product = {}) {
  return unique([product.title, product.handle, product.type, ...(product.tags || [])])
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function has(source, ...terms) {
  return terms.some((term) => source.includes(term));
}

function matches(source, pattern) {
  return pattern.test(source);
}

function categoryFromProduct(product = {}) {
  const source = sourceText(product);
  const type = cleanString(product.type).toLocaleLowerCase("tr-TR");

  if (has(source, "fragrance", "perfume", "parfum", "oud", "amber", "vanilla", "scent")) {
    return { category: "Aksesuar", subcategory: "Parfüm" };
  }
  if (has(source, "swimshort", "swim short")) {
    return { category: "Plaj Giyim", subcategory: "Deniz Şortu" };
  }
  if (has(source, "bikini top")) {
    return { category: "Plaj Giyim", subcategory: "Bikini Üst" };
  }
  if (has(source, "bikini bottom")) {
    return { category: "Plaj Giyim", subcategory: "Bikini Alt" };
  }
  if (has(source, "swimsuit", "swimwear", "bikini", "beachwear")) {
    return { category: "Plaj Giyim", subcategory: "Mayo" };
  }
  if (has(source, "cover-up", "cover up")) {
    return { category: "Plaj Giyim", subcategory: "Plaj Üstü" };
  }
  if (has(source, "wallet", "card holder", "card-holder")) {
    return { category: "Aksesuar", subcategory: "Cüzdan" };
  }
  if (has(source, "sunglasses", "eyewear", "glasses")) {
    return { category: "Aksesuar", subcategory: "Gözlük" };
  }
  if (has(source, "ring", "earring", "bracelet", "necklace", "jewelry", "jewellery")) {
    return { category: "Aksesuar", subcategory: "Takı" };
  }
  if (has(source, "bag", "pouch", "tote", "backpack")) {
    return { category: "Aksesuar", subcategory: "Çanta" };
  }
  if (has(source, "cap", "hat", "beanie", "headwear")) {
    return { category: "Aksesuar", subcategory: "Şapka" };
  }
  if (has(source, "belt", "keychain", "shoelace", "pin", "scarf", "glove", "accessories", "accessory")) {
    return { category: "Aksesuar", subcategory: "Aksesuar" };
  }
  if (has(source, "socks", "sock")) {
    return { category: "Alt Giyim", subcategory: "Çorap" };
  }
  if (has(source, "panty", "underwear", "boxer", "brief")) {
    if (has(source, "panty")) return { category: "İç Giyim", subcategory: "Külot" };
    if (has(source, "boxer")) return { category: "İç Giyim", subcategory: "Boxer" };
    return { category: "İç Giyim", subcategory: "Külot" };
  }
  if (has(source, "bra", "bralette")) {
    return { category: "İç Giyim", subcategory: "Sütyen" };
  }
  if (has(source, "shoe", "sneaker", "boot", "slide", "slipper", "sandals")) {
    return { category: "Alt Giyim", subcategory: "Ayakkabı" };
  }
  if (has(source, "jean", "denim")) return { category: "Alt Giyim", subcategory: "Jeans" };
  if (has(source, "sweatpant", "jogger")) return { category: "Alt Giyim", subcategory: "Eşofman Altı" };
  if (has(source, "cargo")) return { category: "Alt Giyim", subcategory: "Kargo Pantolon" };
  if (has(source, "short")) return { category: "Alt Giyim", subcategory: "Şort" };
  if (has(source, "skirt")) return { category: "Alt Giyim", subcategory: "Etek" };
  if (has(source, "pant", "trouser", "bottom")) return { category: "Alt Giyim", subcategory: "Pantolon" };
  if (matches(source, /\b(suit|sets?|tracksuit|co[-\s]?ord|takim|takım)\b/)) {
    if (has(source, "short")) return { category: "Takımlar", subcategory: "Şort Takım" };
    if (has(source, "suit", "blazer")) return { category: "Takımlar", subcategory: "Takım Elbise" };
    return { category: "Takımlar", subcategory: "Kapsül Set" };
  }
  if (has(source, "outerwear", "coat", "parka", "trench", "puffer", "down jacket", "windbreaker")) {
    if (has(source, "bomber")) return { category: "Dış Giyim", subcategory: "Bomber" };
    if (has(source, "jacket", "windbreaker")) return { category: "Dış Giyim", subcategory: "Ceket" };
    if (has(source, "puffer", "parka")) return { category: "Dış Giyim", subcategory: "Mont" };
    if (has(source, "trench")) return { category: "Dış Giyim", subcategory: "Palto | Trençkot" };
    return { category: "Dış Giyim", subcategory: "Kaban" };
  }
  if (has(source, "bomber")) return { category: "Dış Giyim", subcategory: "Bomber" };
  if (type.includes("jacket") || has(source, "jacket", "blazer")) return { category: "Dış Giyim", subcategory: "Ceket" };
  if (has(source, "hoodie", "hooded")) return { category: "Üst Giyim", subcategory: "Kapüşonlu" };
  if (has(source, "sweatshirt", "sweat shirt")) return { category: "Üst Giyim", subcategory: "Sweatshirt" };
  if (has(source, "tee", "t-shirt", "t shirt", "polo")) return { category: "Üst Giyim", subcategory: "T-Shirt" };
  if (has(source, "shirt", "blouse")) return { category: "Üst Giyim", subcategory: "Gömlek" };
  if (has(source, "knit", "sweater", "cardigan", "jumper")) return { category: "Üst Giyim", subcategory: "Triko | Kazak" };
  if (has(source, "vest")) return { category: "Üst Giyim", subcategory: "Yelek" };
  if (has(source, "dress")) return { category: "Üst Giyim", subcategory: "Elbise" };
  if (has(source, "top", "bodysuit")) return { category: "Üst Giyim", subcategory: "T-Shirt" };

  return { category: "Aksesuar", subcategory: titleCase(product.type || "Aksesuar") };
}

function fitFromProduct(product = {}) {
  const source = sourceText(product);
  if (has(source, "oversize", "oversized")) return "Oversize";
  if (has(source, "relaxed")) return "Relaxed fit";
  if (has(source, "regular")) return "Regular fit";
  if (has(source, "slim")) return "Slim fit";
  if (has(source, "loose")) return "Loose fit";
  return "Premium regular fit";
}

function optionIndex(product = {}, pattern) {
  const options = Array.isArray(product.options) ? product.options : [];
  return options.findIndex((option) => {
    const name = typeof option === "string" ? option : option?.name;
    return pattern.test(cleanString(name));
  });
}

function variantValue(variant = {}, product = {}, pattern, fallback = "") {
  const index = optionIndex(product, pattern);
  if (index >= 0) {
    const value = Array.isArray(variant.options) ? variant.options[index] : variant[`option${index + 1}`];
    return cleanString(value, fallback);
  }
  return fallback;
}

function colorValues(product = {}, variants = []) {
  const colors = unique(variants.map((variant) => variant.color).filter((color) => color && color !== "Standart"));
  if (colors.length) return colors;
  const option = (product.options || []).find((item) => /color|renk/i.test(typeof item === "string" ? item : item?.name));
  const values = Array.isArray(option?.values) ? option.values : [];
  return values.length ? values.map((value) => cleanString(value)).filter(Boolean) : ["Standart"];
}

function productVariants(product = {}, localImages = []) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!variants.length) {
    return [
      {
        size: "Standart",
        color: "Standart",
        stock: product.available ? 1 : 0,
        sku: baseSku(product),
        image: localImages[0] || ""
      }
    ];
  }

  return uniqueBy(
    variants.map((variant, index) => {
      const size = variantValue(variant, product, /size|beden/i, "");
      const color = variantValue(variant, product, /color|renk/i, "");
      const stock =
        typeof variant.inventory_quantity === "number"
          ? Math.max(0, variant.inventory_quantity)
          : variant.available
            ? 1
            : 0;
      return {
        size: size || (variant.title && variant.title !== "Default Title" ? variant.title : "Standart"),
        color: color || "Standart",
        stock,
        sku: cleanString(variant.sku, `${baseSku(product)}-${index + 1}`),
        barcode: cleanString(variant.barcode),
        price: centsToPrice(variant.price),
        image: localImages[0] || ""
      };
    }),
    (variant) => `${variant.sku}|${variant.size}|${variant.color}`
  );
}

function productImageSources(product = {}) {
  const mediaImages = (product.media || []).flatMap((media) => [
    media?.src,
    media?.preview_image?.src,
    media?.preview_image?.url
  ]);
  return unique([
    product.featured_image,
    ...(Array.isArray(product.images) ? product.images : []),
    ...mediaImages
  ].map(normalizeUrl));
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
        await sleep(20);
      } catch (error) {
        console.warn(`Gorsel atlandi: ${sourceUrl} (${error.message})`);
        continue;
      }
    }
    localPaths.push(publicFile);
  }

  return localPaths;
}

function normalizeProduct(product = {}, url, index, localImages) {
  const cleanSlug = slugify(product.handle || new URL(url).pathname.replace(/^\/products\//, "") || `les-${product.id || index + 1}`);
  const category = categoryFromProduct(product);
  const text = stripHtml(product.description || product.content || product.body_html || "");
  const variants = productVariants(product, localImages);
  const sizes = unique(variants.map((variant) => variant.size).filter(Boolean));
  const colors = colorValues(product, variants);
  const name = localizedLesBenjaminsName({
    rawName: cleanString(product.title || cleanSlug),
    category: category.category,
    subcategory: category.subcategory,
    colors,
    tags: product.tags,
    type: product.type || product.product_type
  });
  const stock = variants.reduce((sum, variant) => sum + toNumber(variant.stock), 0);
  const price = centsToPrice(product.price_min || product.price || variants.find((variant) => variant.price)?.price * 100);
  const comparePrice = toNumber(product.compare_at_price || product.compare_at_price_min) > toNumber(product.price || product.price_min)
    ? centsToPrice(product.compare_at_price || product.compare_at_price_min)
    : "";
  const fit = fitFromProduct(product);
  const sku = baseSku(product);
  const materialTag = (product.tags || []).find((tag) => /cotton|wool|leather|denim|linen|polyester|jersey|canvas|silk/i.test(tag));
  const material = materialTag ? titleCase(materialTag) : "Les Benjamins ürün detayında belirtilmiştir.";
  const sourceCategory = cleanString(product.type || product.product_type || category.subcategory);

  return {
    id: `lesbenjamins-${cleanSlug}`,
    name,
    slug: `lesbenjamins-${cleanSlug}`,
    category: category.category,
    subcategory: category.subcategory,
    price,
    comparePrice,
    currency: "TRY",
    stock,
    status: product.published_at === null ? "draft" : "active",
    featured: false,
    badge: comparePrice ? "İndirim" : "Yeni",
    sku,
    image: localImages[0] || "assets/threon-fashion-hero.png",
    gallery: localImages.length ? localImages : ["assets/threon-fashion-hero.png"],
    collection: "",
    fit,
    modelInfo: "Beden, renk ve stok bilgileri ürün varyantlarına göre gösterilir.",
    shippingNote: "THREON sipariş akışında seçilen teslimat yöntemine göre hazırlanır.",
    summary: sentenceSummary(text || `${name} THREON kataloğuna eklenen premium sezon parçası.`),
    description: text || `${name} THREON kataloğuna eklenen premium sezon ürünü.`,
    sizes: sizes.length ? sizes : ["Standart"],
    colors: colors.length ? colors : ["Standart"],
    material: material === "Les Benjamins ürün detayında belirtilmiştir." ? "Ürün detayında belirtilmiştir." : material,
    care: "Etiket talimatına uygun hassas yıkama ve bakım önerilir.",
    features: unique([
      "THREON premium sezon ürünü",
      `${category.category} / ${category.subcategory}`,
      fit,
      material === "Les Benjamins ürün detayında belirtilmiştir." ? "Ürün detayında belirtilmiştir." : material,
      stock > 0 ? "Stoklu varyant bilgisi aktarıldı" : "Stok durumu kaynak üründen aktarıldı"
    ]),
    specs: {
      Marka: "THREON",
      Kategori: `${category.category} / ${category.subcategory}`,
      "Ürün kodu": sku,
      "Toplam stok": String(stock)
    },
    variants,
    reviews: [],
    source: SOURCE_MARKER,
    sourceUrl: url,
    importedAt: new Date().toISOString()
  };
}

function importedProductRank(product = {}) {
  const categoryRank = {
    "Takımlar": 0,
    "Dış Giyim": 1,
    "Üst Giyim": 2,
    "Alt Giyim": 3,
    "Aksesuar": 4
  };
  const subcategoryRank = {
    "Kapsül Set": 0,
    "Eşofman Takımı": 1,
    "Şort Takım": 2,
    "Takım Elbise": 3,
    "Ceket": 4,
    "Bomber": 5,
    "Mont": 6,
    "Kaban": 7,
    "Kapüşonlu": 8,
    "Sweatshirt": 9,
    "T-Shirt": 10,
    "Gömlek": 11,
    "Triko | Kazak": 12,
    "Pantolon": 13,
    "Jeans": 14,
    "Şort": 15,
    "Etek": 16,
    "Ayakkabı": 17,
    "Çorap": 18,
    "Çanta": 19,
    "Şapka": 20,
    "Parfüm": 21
  };
  return [
    categoryRank[product.category] ?? 9,
    subcategoryRank[product.subcategory] ?? 40,
    product.stock > 0 ? 0 : 1,
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

async function readProductUrls() {
  const sitemapXml = await fetchText(`${STORE_URL}/sitemap.xml`);
  const sitemapUrls = unique(
    [...sitemapXml.matchAll(/<loc>(https:\/\/lesbenjamins\.com\/sitemap_products_[^<]+)<\/loc>/g)]
      .map((match) => decodeEntities(match[1]))
  );
  if (!sitemapUrls.length) throw new Error("Les Benjamins ürün sitemap adresleri bulunamadı.");

  const allUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    const urls = [...xml.matchAll(/<loc>(https:\/\/lesbenjamins\.com\/products\/[^<]+)<\/loc>/g)]
      .map((match) => decodeEntities(match[1]))
      .filter((url) => !/-[a-f0-9]{8}-remote$/i.test(new URL(url).pathname));
    allUrls.push(...urls);
    await sleep(REQUEST_DELAY_MS);
  }
  return unique(allUrls);
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

async function importOneProduct(url, index, total) {
  const product = JSON.parse(await fetchText(`${url}.js`, 4));
  const sourceSlug = slugify(product.handle || new URL(url).pathname.replace(/^\/products\//, "") || `les-${index + 1}`);
  const imageUrls = productImageSources(product);
  const localImages = await downloadProductImages(sourceSlug, imageUrls);
  const normalized = normalizeProduct(product, url, index, localImages);
  console.log(`${String(index + 1).padStart(4, "0")}/${total} ${sourceSlug} -> ${localImages.length} gorsel`);
  await sleep(REQUEST_DELAY_MS);
  return normalized;
}

async function main() {
  const allProductUrls = await readProductUrls();
  const productUrls = LIMIT ? allProductUrls.slice(0, LIMIT) : allProductUrls;
  if (!productUrls.length) throw new Error("Les Benjamins sitemap içinde ürün bulunamadı.");

  const imported = [];
  const failures = [];
  const startedAt = Date.now();
  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  console.log(`Les Benjamins aktarimi basladi: ${productUrls.length}/${allProductUrls.length} urun, concurrency=${CONCURRENCY}, imageLimit=${IMAGE_LIMIT || "all"}`);

  const results = await mapLimit(productUrls, CONCURRENCY, async (url, index) => {
    try {
      return await importOneProduct(url, index, productUrls.length);
    } catch (error) {
      failures.push({ url, error: error.message });
      console.warn(`Atlandi: ${url} (${error.message})`);
      return null;
    }
  });

  imported.push(...results.filter(Boolean));
  if (!imported.length) {
    throw new Error(`Hiç Les Benjamins ürünü aktarılamadı. Hata sayısı: ${failures.length}`);
  }

  const sortedImported = sortImportedProducts(imported);
  sortedImported.forEach((product, index) => {
    product.featured = index < 48 && product.stock > 0 && product.category !== "Aksesuar";
    if (!product.comparePrice && product.badge === "Les Benjamins" && index < 48) product.badge = "Yeni";
  });

  const currentProducts = Array.isArray(siteData.products) ? siteData.products : [];
  const keepProducts = currentProducts.filter((product) => product.source !== SOURCE_MARKER && !String(product.id || "").startsWith("lesbenjamins-"));
  siteData.products = [...sortedImported, ...keepProducts];
  siteData.settings = {
    ...(siteData.settings || {}),
    lastLesBenjaminsImport: new Date().toISOString(),
    lesBenjaminsProductCount: sortedImported.length,
    lesBenjaminsSourceProductCount: allProductUrls.length
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  fs.writeFileSync(
    REPORT_FILE,
    `${JSON.stringify(
      {
        imported: sortedImported.length,
        failures,
        urls: productUrls.length,
        sourceUrls: allProductUrls.length,
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
        categoryCounts: sortedImported.reduce((counts, product) => {
          const key = `${product.category} / ${product.subcategory}`;
          counts[key] = (counts[key] || 0) + 1;
          return counts;
        }, {})
      },
      null,
      2
    )}\n`
  );

  console.log(`Tamamlandi: ${sortedImported.length}/${productUrls.length} Les Benjamins urunu THREON'a aktarildi.`);
  if (failures.length) console.log(`Hata raporu: data/lesbenjamins-import-report.json (${failures.length} hata)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
