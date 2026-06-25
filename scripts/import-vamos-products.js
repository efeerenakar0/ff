const fs = require("fs");
const path = require("path");

const STORE_URL = "https://vamosclo.com";
const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const ASSET_DIR = path.join(process.cwd(), "assets", "vamosclo");
const ASSET_PUBLIC_DIR = "assets/vamosclo";
const SOURCE_MARKER = "vamosclo";
const REQUEST_TIMEOUT_MS = Number(process.env.VAMOS_TIMEOUT_MS || 22000);
const REQUEST_DELAY_MS = Number(process.env.VAMOS_DELAY_MS || 70);
const CONCURRENCY = Math.max(1, Number(process.env.VAMOS_CONCURRENCY || 8));
const IMAGE_LIMIT = Math.max(0, Number(process.env.VAMOS_IMAGE_LIMIT || 8));
const LIMIT = Math.max(0, Number(process.env.VAMOS_LIMIT || 0));

const TURKISH_ENTITY_MAP = {
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
          "User-Agent": "THREON VamosClo product import/1.0 (+owner requested local import)",
          Accept: "text/html,application/xhtml+xml,application/xml,image/avif,image/webp,image/*,*/*"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(350 + attempt * 600);
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
  return String(value).replace(/&([^;]+);/g, (match, entity) => {
    if (TURKISH_ENTITY_MAP[entity]) return TURKISH_ENTITY_MAP[entity];
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

function grossPrice(price, tax) {
  const base = toNumber(price);
  const vat = toNumber(tax);
  return base > 0 ? base + vat : 0;
}

function roundPrice(value) {
  return Math.round(toNumber(value));
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
  if (!url || /^(true|false|null|undefined)$/i.test(url) || /resim-hazirlaniyor/i.test(url)) return "";
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `${STORE_URL}${url}`;
  return url;
}

function extractJsObject(html, variableName) {
  const marker = `var ${variableName} = `;
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`${variableName} bulunamadı.`);
  const objectStart = html.indexOf("{", start + marker.length);
  if (objectStart < 0) throw new Error(`${variableName} JSON başlangıcı bulunamadı.`);

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return JSON.parse(html.slice(objectStart, index + 1));
    }
  }
  throw new Error(`${variableName} JSON sonu bulunamadı.`);
}

function parseJsonLd(html) {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .flatMap((match) => {
      try {
        const parsed = JSON.parse(match[1]);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return [];
      }
    })
    .filter(Boolean);
}

function jsonLdType(entry) {
  const type = entry && entry["@type"];
  return Array.isArray(type) ? type.join(" ") : String(type || "");
}

function productJsonLd(html) {
  return parseJsonLd(html).find((entry) => jsonLdType(entry).includes("Product")) || {};
}

function googleCategory(html) {
  const match = html.match(/ecomm_category:\s*['"]([^'"]+)['"]/i);
  return match ? decodeEntities(match[1]) : "";
}

function technicalDetails(model = {}) {
  const specs = {};
  (model.customTechnicalDetails || []).forEach((item) => {
    const key = cleanString(item.tanim);
    if (!key) return;
    const values = [
      ...(Array.isArray(item.degerler) ? item.degerler.map((value) => value?.tanim) : []),
      ...(Array.isArray(item.deger) ? item.deger.map((value) => value?.tanim || value) : []),
      item.deger && !Array.isArray(item.deger) ? item.deger : ""
    ]
      .map((value) => cleanString(value))
      .filter((value) => value && !/^girilmedi$/i.test(value));
    if (values.length) specs[key] = unique(values).join(", ");
  });
  return specs;
}

function materialFromSpecs(specs = {}) {
  return (
    specs["Malzeme Materyali"] ||
    specs["Malzeme Materyeli"] ||
    specs["Materyal"] ||
    specs["Kumaş"] ||
    "VamosClo ürün detayında belirtilmiştir."
  );
}

function careFromSpecs(specs = {}) {
  return specs["Yıkama Talimatı"] || specs["Yikama Talimati"] || "Etiket talimatına uygun hassas yıkama önerilir.";
}

function fitFromSpecs(specs = {}, name = "") {
  const fit = specs.Fit || "";
  if (fit && !/^girilmedi$/i.test(fit)) return titleCaseTurkish(fit);
  if (/oversize/i.test(name)) return "Oversize";
  if (/regular/i.test(name)) return "Regular fit";
  if (/slim/i.test(name)) return "Slim fit";
  return "Premium regular fit";
}

function inferColor(name = "", specs = {}) {
  const source = `${name} ${Object.values(specs).join(" ")}`.toLocaleLowerCase("tr-TR");
  const colors = [
    ["antrasit", "Antrasit"],
    ["siyah", "Siyah"],
    ["black", "Siyah"],
    ["beyaz", "Beyaz"],
    ["white", "Beyaz"],
    ["ekru", "Ekru"],
    ["krem", "Krem"],
    ["bej", "Bej"],
    ["kahve", "Kahve"],
    ["brown", "Kahve"],
    ["haki", "Haki"],
    ["yeşil", "Yeşil"],
    ["yesil", "Yeşil"],
    ["okyanus", "Okyanus"],
    ["mavi", "Mavi"],
    ["blue", "Mavi"],
    ["lacivert", "Lacivert"],
    ["gri", "Gri"],
    ["gray", "Gri"],
    ["grey", "Gri"],
    ["füme", "Füme"],
    ["fume", "Füme"],
    ["kırmızı", "Kırmızı"],
    ["kirmizi", "Kırmızı"],
    ["bordo", "Bordo"],
    ["camel", "Camel"],
    ["vizon", "Vizon"]
  ];
  return colors.find(([needle]) => source.includes(needle))?.[1] || "Standart";
}

function categoryFromProduct({ name, slug, breadcrumbs, sourceCategory, specs }) {
  const source = unique([...breadcrumbs, sourceCategory, ...Object.values(specs || {}), name, slug])
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const has = (...terms) => terms.some((term) => source.includes(term));

  if (has("takım elbise", "takim elbise", "suit")) {
    return { category: "Takımlar", subcategory: "Takım Elbise" };
  }
  if (has("şort takım", "sort takim", "bermuda takım", "bermuda takim")) {
    return { category: "Takımlar", subcategory: "Şort Takım" };
  }
  if (has("takım", "takim", "alt üst", "alt-ust", "eşofman takım", "esofman takim", "alt üst takım", "alt ust takim")) {
    return {
      category: "Takımlar",
      subcategory: has("eşofman", "esofman") ? "Eşofman Takımı" : "Alt Üst Takım"
    };
  }
  if (has("kaban", "mont", "trençkot", "trenc", "palto", "dış giyim", "dis giyim", "kaşe", "kase")) {
    if (has("mont")) return { category: "Dış Giyim", subcategory: "Mont" };
    if (has("palto", "trençkot", "trenc")) return { category: "Dış Giyim", subcategory: "Palto | Trençkot" };
    if (has("ceket")) return { category: "Dış Giyim", subcategory: "Ceket" };
    if (has("yelek")) return { category: "Dış Giyim", subcategory: "Yelek" };
    return { category: "Dış Giyim", subcategory: "Kaban" };
  }
  if (has("boxer")) return { category: "Alt Giyim", subcategory: "Boxer" };
  if (has("çorap", "corap")) return { category: "Alt Giyim", subcategory: "Çorap" };
  if (has("terlik", "sandalet")) return { category: "Alt Giyim", subcategory: "Terlik" };
  if (has("jeans", "denim", "jean")) return { category: "Alt Giyim", subcategory: "Jeans" };
  if (has("pantolon", "şort", "sort", "bermuda", "eşofman altı", "esofman alti")) {
    if (has("şort", "sort", "bermuda")) return { category: "Alt Giyim", subcategory: "Şort" };
    if (has("kargo")) return { category: "Alt Giyim", subcategory: "Kargo Pantolon" };
    if (has("eşofman", "esofman")) return { category: "Alt Giyim", subcategory: "Eşofman Altı" };
    return { category: "Alt Giyim", subcategory: "Pantolon" };
  }
  if (has("sweatshirt", "sweat", "hoodie", "kapüşon", "kapuson")) return { category: "Üst Giyim", subcategory: "Sweatshirt" };
  if (has("t-shirt", "t shirt", "tişört", "tisort")) return { category: "Üst Giyim", subcategory: "T-Shirt" };
  if (has("gömlek", "gomlek", "shirt")) return { category: "Üst Giyim", subcategory: "Gömlek" };
  if (has("triko", "kazak")) return { category: "Üst Giyim", subcategory: "Triko | Kazak" };
  if (has("yelek")) return { category: "Üst Giyim", subcategory: "Yelek" };
  if (has("ceket")) return { category: "Üst Giyim", subcategory: "Ceket" };

  const leaf = breadcrumbs[0] || sourceCategory || "Yeni Sezon";
  return { category: "Üst Giyim", subcategory: titleCaseTurkish(leaf) };
}

function productImageSources(model = {}, jsonProduct = {}) {
  const productImages = Array.isArray(model.productImages) ? model.productImages : [];
  const gallery = productImages
    .sort((a, b) => Number(a.imageOrder || a.sira || 0) - Number(b.imageOrder || b.sira || 0))
    .flatMap((image) => [
      image.bigImagePath,
      image.imagePath,
      image.imageUrl,
      image.imageOriginalPath,
      image.thumbImagePath
    ]);
  const variants = (model.products || []).flatMap((product) => [
    product.spotResimBuyukYolu,
    product.spotResimYolu,
    product.spotResimThumbYolu
  ]);
  const jsonImages = Array.isArray(jsonProduct.image) ? jsonProduct.image : [jsonProduct.image];
  return unique([...gallery, ...variants, model.mainProductImage, ...jsonImages].map(normalizeUrl));
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

function variantOptionMap(model = {}) {
  const map = new Map();
  (model.productVariantData || []).forEach((row) => {
    const productId = cleanString(row.urunID);
    const value = cleanString(row.tanim);
    if (!productId || !value || row.aktif === false || row.urunAktif === false) return;
    const entry = map.get(productId) || { size: "", color: "", stock: 0 };
    const type = cleanString(row.ekSecenekTipiTanim).toLocaleLowerCase("tr-TR");
    if (/beden|size/.test(type)) entry.size = value;
    if (/renk|color/.test(type)) entry.color = titleCaseTurkish(value);
    entry.stock = Math.max(entry.stock, toNumber(row.stokAdedi));
    map.set(productId, entry);
  });
  return map;
}

function productVariants(model = {}, localImages = [], specs = {}) {
  const byVariant = variantOptionMap(model);
  const fallbackColor = inferColor(model.productName, specs);
  const variantProducts = (model.products || []).filter((product) => product.aktif !== false);

  if (variantProducts.length) {
    return uniqueBy(
      variantProducts.map((variant, index) => {
        const variantId = cleanString(variant.id);
        const option = byVariant.get(variantId) || {};
        const stock = Math.max(toNumber(variant.stokAdedi), toNumber(option.stock));
        return {
          size: option.size || "Standart",
          color: option.color || fallbackColor,
          stock,
          sku: cleanString(variant.stokKodu, `${model.stockCode || "VAMOS"}-${index + 1}`),
          barcode: cleanString(variant.barkod),
          image: localImages[0] || ""
        };
      }),
      (variant) => `${variant.sku}|${variant.size}|${variant.color}`
    );
  }

  const sizeRows = (model.productVariantData || []).filter((row) => /beden|size/i.test(row.ekSecenekTipiTanim || ""));
  if (!sizeRows.length) {
    return [
      {
        size: "Standart",
        color: fallbackColor,
        stock: toNumber(model.totalStockAmount),
        sku: cleanString(model.stockCode, `VAMOS-${model.productId}`),
        image: localImages[0] || ""
      }
    ];
  }
  return uniqueBy(
    sizeRows.map((row, index) => ({
      size: cleanString(row.tanim, "Standart"),
      color: fallbackColor,
      stock: toNumber(row.stokAdedi),
      sku: `${cleanString(model.stockCode, `VAMOS-${model.productId}`)}-${index + 1}`,
      image: localImages[0] || ""
    })),
    (variant) => `${variant.sku}|${variant.size}|${variant.color}`
  );
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

function normalizeCurrency(value = "") {
  const text = cleanString(value).toUpperCase();
  if (!text || text === "TL" || text === "TRY" || text.includes("TURK")) return "TRY";
  return text;
}

function priceInfo(model = {}, jsonProduct = {}) {
  const offer = Array.isArray(jsonProduct.offers) ? jsonProduct.offers[0] : jsonProduct.offers || {};
  const currentCandidates = [
    model.productPriceKDVIncluded,
    model.productPriceStr,
    offer.price,
    model.productPrice
  ]
    .map(toNumber)
    .filter((value) => value > 0);
  const current = currentCandidates[0] || 0;
  const baseProduct = model.product || (model.products || [])[0] || {};
  const sellGross = grossPrice(baseProduct.satisFiyati, baseProduct.satisKDV);
  const discountGross = grossPrice(baseProduct.indirimliFiyati, baseProduct.indirimliKDV);
  const compare =
    discountGross > 0 && sellGross > discountGross + 1
      ? sellGross
      : sellGross > current + 1
        ? sellGross
        : 0;
  return {
    price: String(roundPrice(current)),
    comparePrice: compare ? String(roundPrice(compare)) : "",
    currency: normalizeCurrency(model.productCurrency || offer.priceCurrency || "TRY")
  };
}

function normalizeProduct(url, html, index, localImages) {
  const model = extractJsObject(html, "productDetailModel");
  const jsonProduct = productJsonLd(html);
  const sourceSlug = new URL(url).pathname.replace(/^\//, "");
  const cleanSlug = slugify(sourceSlug || model.productUrl || model.productName || `vamos-${model.productId || index + 1}`);
  const name = cleanString(model.productName || jsonProduct.name || cleanSlug);
  const specs = technicalDetails(model);
  const breadcrumbs = (model.breadCrumb || []).map((item) => cleanString(item.tanim)).filter(Boolean);
  const sourceCategory = googleCategory(html) || breadcrumbs[0] || "";
  const category = categoryFromProduct({ name, slug: cleanSlug, breadcrumbs, sourceCategory, specs });
  const text = stripHtml(model.productShortDescription || jsonProduct.description || "");
  const variants = productVariants(model, localImages, specs);
  const sizes = unique(variants.map((variant) => variant.size));
  const colors = unique(variants.map((variant) => variant.color));
  const price = priceInfo(model, jsonProduct);
  const stock = variants.reduce((sum, variant) => sum + toNumber(variant.stock), 0) || toNumber(model.totalStockAmount);
  const hasSale = Boolean(price.comparePrice && toNumber(price.comparePrice) > toNumber(price.price));
  const material = materialFromSpecs(specs);
  const fit = fitFromSpecs(specs, name);
  const sourceSpecs = {
    Marka: "THREON",
    Kategori: `${category.category} / ${category.subcategory}`,
    "Ürün kodu": cleanString(model.stockCode, `VAMOS-${model.productId || index + 1}`),
    "Toplam stok": String(stock),
    ...specs
  };

  return {
    id: `vamosclo-${cleanSlug}`,
    name,
    slug: `vamosclo-${cleanSlug}`,
    category: category.category,
    subcategory: category.subcategory,
    price: price.price,
    comparePrice: price.comparePrice,
    currency: price.currency,
    stock,
    status: model.productActive === false ? "draft" : "active",
    featured: false,
    badge: hasSale ? "İndirim" : "Premium",
    sku: cleanString(model.stockCode, `VAMOS-${String(model.productId || index + 1).padStart(5, "0")}`),
    image: localImages[0] || "assets/threon-fashion-hero.png",
    gallery: localImages.length ? localImages : ["assets/threon-fashion-hero.png"],
    collection: "",
    fit,
    modelInfo: "Beden, renk ve stok bilgileri ürün varyantlarına göre gösterilir.",
    shippingNote: "14:00'a kadar verilen siparişler aynı gün kargo hazırlığına alınır.",
    summary: sentenceSummary(text || `${name} THREON kataloğuna eklenen premium sezon parçası.`),
    description: text || `${name} THREON kataloğuna eklenen premium sezon ürünü.`,
    sizes: sizes.length ? sizes : ["Standart"],
    colors: colors.length ? colors : [inferColor(name, specs)],
    material,
    care: careFromSpecs(specs),
    features: unique([
      "THREON premium sezon ürünü",
      `${category.category} / ${category.subcategory}`,
      fit,
      material,
      stock > 0 ? "Stoklu varyant bilgisi aktarıldı" : "Stok durumu kaynak sayfadan aktarıldı"
    ]),
    specs: sourceSpecs,
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
    "Alt Giyim": 3
  };
  const subcategoryRank = {
    "Alt Üst Takım": 0,
    "Eşofman Takımı": 1,
    "Takım Elbise": 2,
    "Gömlek": 3,
    "T-Shirt": 4,
    "Sweatshirt": 5,
    "Ceket": 6,
    "Mont": 7,
    "Kaban": 8,
    "Pantolon": 9,
    "Jeans": 10,
    "Şort": 11,
    "Boxer": 30,
    "Çorap": 31,
    "Terlik": 32
  };
  return [
    categoryRank[product.category] ?? 9,
    subcategoryRank[product.subcategory] ?? 20,
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
    [...sitemapXml.matchAll(/<loc>(https:\/\/vamosclo\.com\/sitemap\/products\/[^<]+\.xml)<\/loc>/g)].map((match) => match[1])
  );
  if (!sitemapUrls.length) throw new Error("VamosClo ürün sitemap adresleri bulunamadı.");

  const allUrls = [];
  for (const sitemapUrl of sitemapUrls) {
    const xml = await fetchText(sitemapUrl);
    allUrls.push(...[...xml.matchAll(/<loc>(https:\/\/vamosclo\.com\/[^<]+)<\/loc>/g)].map((match) => match[1]));
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
  const html = await fetchText(url, 2);
  const model = extractJsObject(html, "productDetailModel");
  const jsonProduct = productJsonLd(html);
  const sourceSlug = slugify(new URL(url).pathname.replace(/^\//, "") || model.productName || `vamos-${index + 1}`);
  const imageUrls = productImageSources(model, jsonProduct);
  const localImages = await downloadProductImages(sourceSlug, imageUrls);
  const product = normalizeProduct(url, html, index, localImages);
  console.log(`${String(index + 1).padStart(4, "0")}/${total} ${sourceSlug} -> ${localImages.length} gorsel`);
  await sleep(REQUEST_DELAY_MS);
  return product;
}

async function main() {
  const allProductUrls = await readProductUrls();
  const productUrls = LIMIT ? allProductUrls.slice(0, LIMIT) : allProductUrls;
  if (!productUrls.length) throw new Error("VamosClo sitemap içinde ürün bulunamadı.");

  const imported = [];
  const failures = [];
  const startedAt = Date.now();
  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

  console.log(`VamosClo aktarimi basladi: ${productUrls.length}/${allProductUrls.length} urun, concurrency=${CONCURRENCY}, imageLimit=${IMAGE_LIMIT || "all"}`);

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
    throw new Error(`Hiç VamosClo ürünü aktarılamadı. Hata sayısı: ${failures.length}`);
  }

  const sortedImported = sortImportedProducts(imported);
  sortedImported.forEach((product, index) => {
    product.featured = index < 42 && !["Boxer", "Çorap", "Terlik"].includes(product.subcategory);
    if (!product.comparePrice && product.badge === "Vamos" && index < 42) product.badge = "Yeni";
  });

  const currentProducts = Array.isArray(siteData.products) ? siteData.products : [];
  const keepProducts = currentProducts.filter((product) => product.source !== SOURCE_MARKER && !String(product.id || "").startsWith("vamosclo-"));
  siteData.products = [...sortedImported, ...keepProducts];
  siteData.settings = {
    ...(siteData.settings || {}),
    lastVamosImport: new Date().toISOString(),
    vamosProductCount: sortedImported.length,
    vamosSourceProductCount: allProductUrls.length
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  fs.writeFileSync(
    path.join(process.cwd(), "data", "vamos-import-report.json"),
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

  console.log(`Tamamlandi: ${sortedImported.length}/${productUrls.length} VamosClo urunu THREON'a aktarildi.`);
  if (failures.length) console.log(`Hata raporu: data/vamos-import-report.json (${failures.length} hata)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
