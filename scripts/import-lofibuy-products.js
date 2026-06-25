const fs = require("fs");
const path = require("path");

const STORE_URL = "https://lofibuy.com";
const PRODUCTS_SITEMAP = `${STORE_URL}/products.xml`;
const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const ASSET_DIR = path.join(process.cwd(), "assets", "lofibuy");
const ASSET_PUBLIC_DIR = "assets/lofibuy";
const SOURCE_MARKER = "lofibuy";
const REQUEST_DELAY_MS = 120;

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
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "THREON product import/1.0 (+local owner requested import)"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(300 + attempt * 400);
    }
  }
  throw lastError;
}

async function fetchText(url) {
  return (await fetchBuffer(url)).toString("utf8");
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
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
    .replace(/^-+|-+$/g, "");
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

function sentenceSummary(text = "", maxLength = 180) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= maxLength) return clean;
  const sliced = clean.slice(0, maxLength);
  return `${sliced.slice(0, Math.max(0, sliced.lastIndexOf(" ")))}...`;
}

function sectionAfter(text = "", labelRegex, stopRegex) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  const label = normalized.match(labelRegex);
  if (!label) return "";
  const start = label.index + label[0].length;
  const rest = normalized.slice(start).trim();
  const stop = stopRegex ? rest.search(stopRegex) : -1;
  return (stop >= 0 ? rest.slice(0, stop) : rest).trim();
}

function parseNextData(html) {
  const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("NEXT_DATA bulunamadı");
  return JSON.parse(match[1]);
}

function parseJsonLd(html) {
  return [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function jsonLdType(entry) {
  const type = entry && entry["@type"];
  return Array.isArray(type) ? type.join(" ") : String(type || "");
}

function breadcrumbNames(jsonLd = [], productName = "") {
  const list = jsonLd.find((entry) => jsonLdType(entry).includes("BreadcrumbList"));
  const items = Array.isArray(list?.itemListElement) ? list.itemListElement : [];
  return items
    .map((item) => String(item?.name || "").trim())
    .filter((name) => name && !/^lofibuy$/i.test(name) && name !== productName && name !== "Tüm Ürünler");
}

function variantTypeNameMap(product = {}) {
  const map = new Map();
  (product.variantTypes || []).forEach((entry) => {
    const type = entry.variantType || {};
    if (type.id) map.set(type.id, String(type.name || ""));
  });
  return map;
}

function titleCaseTurkish(value = "") {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function inferColor(name = "", text = "") {
  const colorLine = String(text).match(/(?:^|\s)Renk\s*,?\s*([^\n.]+)/i);
  if (colorLine?.[1]) {
    const color = colorLine[1]
      .replace(/\b(Relaxid|Relaxed|Regular|Oversize|Rahat|Dökümlü|Dokumlu|MATERYAL|MANKEN)\b.*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    if (color && color.length <= 40) return titleCaseTurkish(color);
  }

  const value = String(name).toLocaleLowerCase("tr-TR");
  const colors = [
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
    ["kahve", "Kahverengi"],
    ["brown", "Kahverengi"],
    ["haki", "Haki"],
    ["olive", "Haki"],
    ["gri", "Gri"],
    ["gray", "Gri"],
    ["grey", "Gri"],
    ["antrasit", "Antrasit"],
    ["lacivert", "Lacivert"],
    ["navy", "Lacivert"],
    ["camel", "Camel"],
    ["vizon", "Vizon"],
    ["horizon", "Horizon"]
  ];
  return colors.find(([needle]) => value.includes(needle))?.[1] || "Standart";
}

function categoryFromProduct({ name, slug, breadcrumbs, categories }) {
  const source = unique([...breadcrumbs, ...categories, name, slug]).join(" ").toLocaleLowerCase("tr-TR");

  const has = (...terms) => terms.some((term) => source.includes(term));

  if (has("gift card", "hediye kart")) {
    return { category: "Gift Cards", subcategory: "Hediye Kartı" };
  }

  if (has("takım", "takim", "alt üst", "alt-ust", "eşofman takımı", "esofman takimi")) {
    return { category: "Takımlar", subcategory: has("eşofman", "esofman") ? "Eşofman Takımı" : "Alt Üst Takım" };
  }

  if (has("kaban", "mont", "palto", "trençkot", "trenc", "kaşe", "kase", "dış giyim", "dis-giyim")) {
    if (has("mont")) return { category: "Dış Giyim", subcategory: "Mont" };
    if (has("palto", "trençkot", "trenc")) return { category: "Dış Giyim", subcategory: "Palto | Trençkot" };
    if (has("ceket")) return { category: "Dış Giyim", subcategory: "Ceket" };
    if (has("yelek")) return { category: "Dış Giyim", subcategory: "Yelek" };
    return { category: "Dış Giyim", subcategory: "Kaban" };
  }

  if (has("pantolon", "şort", "sort", "eşofman altı", "esofman alti")) {
    if (has("şort", "sort")) return { category: "Alt Giyim", subcategory: "Şort" };
    if (has("kargo")) return { category: "Alt Giyim", subcategory: "Kargo Pantolon" };
    if (has("eşofman", "esofman")) return { category: "Alt Giyim", subcategory: "Eşofman Altı" };
    return { category: "Alt Giyim", subcategory: "Pantolon" };
  }

  if (has("sweatshirt", "hoodie", "kapüşon", "kapuson")) return { category: "Üst Giyim", subcategory: "Sweatshirt" };
  if (has("t-shirt", "t shirt", "tişört", "tisort")) return { category: "Üst Giyim", subcategory: "T-Shirt" };
  if (has("gömlek", "gomlek")) return { category: "Üst Giyim", subcategory: "Gömlek" };
  if (has("yelek")) return { category: "Üst Giyim", subcategory: "Yelek" };
  if (has("triko", "kazak")) return { category: "Üst Giyim", subcategory: "Triko | Kazak" };
  if (has("ceket")) return { category: "Üst Giyim", subcategory: "Ceket" };

  const leaf = breadcrumbs.find((item) => item && item !== "Üst Giyim") || categories[0] || "";
  return { category: "Üst Giyim", subcategory: leaf || "Yeni Sezon" };
}

function imageUrlFromIkas(image, config = {}) {
  const imageId = image?.imageId || image?.image?.id || image?.id;
  const fileName = image?.fileName || image?.name;
  const merchantId = config.merchantSettings?.merchantId || config.merchantId;
  const cdnUrl = config.cdnUrl || "https://cdn.myikas.com/";
  if (!imageId || !fileName || !merchantId) return "";
  const cleanCdn = cdnUrl.endsWith("/") ? cdnUrl : `${cdnUrl}/`;
  return `${cleanCdn}images/${merchantId}/${imageId}/1080/${fileName}.webp`;
}

function productImageSources(product = {}, jsonProduct = {}, config = {}) {
  const fromVariants = (product.variants || [])
    .flatMap((variant) => variant.images || [])
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((image) => imageUrlFromIkas(image, config));
  const fromJson = Array.isArray(jsonProduct.image) ? jsonProduct.image : [jsonProduct.image].filter(Boolean);
  return unique([...fromVariants, ...fromJson]);
}

function imageExtension(url = "") {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(ext) ? ext : ".webp";
}

async function downloadProductImages(slug, imageUrls) {
  const localPaths = [];
  fs.mkdirSync(ASSET_DIR, { recursive: true });

  for (const [index, sourceUrl] of imageUrls.entries()) {
    const ext = imageExtension(sourceUrl);
    const fileName = `${slug}-${String(index + 1).padStart(2, "0")}${ext}`;
    const localFile = path.join(ASSET_DIR, fileName);
    const publicFile = `${ASSET_PUBLIC_DIR}/${fileName}`;

    if (!fs.existsSync(localFile) || fs.statSync(localFile).size === 0) {
      let buffer;
      try {
        buffer = await fetchBuffer(sourceUrl, 1);
      } catch (error) {
        if (sourceUrl.endsWith(".webp")) {
          buffer = await fetchBuffer(sourceUrl.replace(/\.webp($|\?)/, ".jpg$1"), 1);
        } else {
          throw error;
        }
      }
      fs.writeFileSync(localFile, buffer);
      await sleep(35);
    }

    localPaths.push(publicFile);
  }

  return localPaths;
}

function variantPriceInfo(variant = {}) {
  const price = Array.isArray(variant.prices) ? variant.prices[0] || {} : variant.price || {};
  const sell = Number(price.sellPrice || 0);
  const saleCandidates = [price.discountPrice, price.campaignPrice].map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const current = saleCandidates.length ? Math.min(sell || Infinity, ...saleCandidates) : sell;
  return {
    price: Number.isFinite(current) && current > 0 ? current : sell,
    comparePrice: sell && current && current < sell ? sell : 0,
    currency: price.currencyCode || price.currency || "TRY"
  };
}

function productVariants(product = {}, localImages = [], descriptionText = "") {
  const typeNames = variantTypeNameMap(product);
  const fallbackColor = inferColor(product.name || product.metaData?.pageTitle || "", descriptionText);

  return (product.variants || [])
    .filter((variant) => !variant.deleted && variant.isActive !== false)
    .map((variant, index) => {
      const values = Array.isArray(variant.variantValues) ? variant.variantValues : [];
      const namedValues = values.map((value) => ({
        name: String(value.name || "").trim(),
        typeName: String(typeNames.get(value.variantTypeId) || "").toLocaleLowerCase("tr-TR")
      }));
      const sizeValue = namedValues.find((value) => /beden|size/.test(value.typeName)) || namedValues[0];
      const colorValue = namedValues.find((value) => /renk|color/.test(value.typeName));
      const stock = Array.isArray(variant.stocks)
        ? variant.stocks.reduce((sum, item) => sum + (Number(item.stockCount) || 0), 0)
        : Number(variant.stock || 0);
      return {
        size: sizeValue?.name || "Standart",
        color: colorValue?.name || fallbackColor,
        stock: Math.max(0, stock),
        sku: variant.sku || `LOFI-${slugify(product.metaData?.slug || product.name)}-${index + 1}`,
        image: localImages[0] || ""
      };
    });
}

function normalizeProduct(url, html, index, localImages) {
  const data = parseNextData(html);
  const pageProps = data.props?.pageProps || {};
  const product = pageProps.pageSpecificData || {};
  const config = pageProps.configJson || {};
  const jsonLd = parseJsonLd(html);
  const jsonProduct = jsonLd.find((entry) => jsonLdType(entry).includes("Product")) || {};
  const sourceSlug = product.metaData?.slug || data.query?.slug || new URL(url).pathname.replace(/^\//, "");
  const cleanSlug = slugify(sourceSlug || product.name || `lofibuy-${index + 1}`);
  const name = String(product.name || jsonProduct.name || cleanSlug)
    .replace(/^lofibuy\s*\|\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const text = stripHtml(product.description || product.metaData?.description || jsonProduct.description || "");
  const breadcrumbs = breadcrumbNames(jsonLd, name);
  const categoryNames = (product.categories || []).map((category) => String(category.name || "").trim()).filter(Boolean);
  const category = categoryFromProduct({ name, slug: cleanSlug, breadcrumbs, categories: categoryNames });
  const variants = productVariants(product, localImages, text);
  const sizes = unique(variants.map((variant) => variant.size));
  const colors = unique(variants.map((variant) => variant.color));
  const priceInfos = (product.variants || []).map(variantPriceInfo).filter((item) => item.price > 0);
  const minPrice = Math.min(...priceInfos.map((item) => item.price));
  const maxCompare = Math.max(...priceInfos.map((item) => item.comparePrice || 0));
  const stock = variants.reduce((sum, variant) => sum + variant.stock, 0);
  const material = sectionAfter(text, /MATERYAL/i, /MANKEN|YIKAMA|BAKIM|ÖLÇÜ|OLCU/i);
  const modelInfo = sectionAfter(text, /MANKEN|MODEL/i, /YIKAM|YIKAMA|BAKIM/i);
  const care = sectionAfter(text, /YIKAMA\s*\|\s*BAKIM|YIKAMA|BAKIM/i, /ÖLÇÜ|OLCU/i);
  const isSale = maxCompare > minPrice;

  return {
    id: `lofibuy-${cleanSlug}`,
    name,
    slug: cleanSlug,
    category: category.category,
    subcategory: category.subcategory,
    price: Number.isFinite(minPrice) ? String(Math.round(minPrice)) : String(jsonProduct.offers?.[0]?.price || "0"),
    comparePrice: isSale ? String(Math.round(maxCompare)) : "",
    currency: priceInfos[0]?.currency || jsonProduct.offers?.[0]?.priceCurrency || "TRY",
    stock,
    status: product.deleted ? "draft" : "active",
    featured: index < 18,
    badge: isSale ? "İndirim" : index < 18 ? "Yeni" : "Premium",
    sku: `LOFI-${cleanSlug.toUpperCase().slice(0, 44)}`,
    image: localImages[0] || "assets/threon-fashion-hero.png",
    gallery: localImages.length ? localImages : ["assets/threon-fashion-hero.png"],
    collection: "",
    fit: /oversize|oversized/i.test(`${name} ${text}`) ? "Oversize rahat kalıp" : /relax|rahat/i.test(text) ? "Relaxed fit" : "Premium regular fit",
    modelInfo: modelInfo || "Model ölçüleri ürün açıklamasında belirtilmiştir.",
    shippingNote: "14:00'a kadar verilen siparişler aynı gün kargo hazırlığına alınır.",
    summary: sentenceSummary(product.shortDescription || product.metaData?.description || text || `${name} THREON kataloğuna eklenen premium sezon parçası.`),
    description: text || `${name} THREON kataloğuna eklenen premium sezon ürünü.`,
    sizes: sizes.length ? sizes : ["Standart"],
    colors: colors.length ? colors : [inferColor(name, text)],
    material: material || "Ürün açıklamasında belirtilmiştir.",
    care: care || "Etiket talimatına uygun hassas yıkama önerilir.",
    features: unique([
      "THREON premium sezon ürünü",
      `${category.category} / ${category.subcategory}`,
      material ? "Materyal bilgisi ürün açıklamasından aktarıldı" : "Premium sezon parçası",
      "Varyant ve stok bilgisi ürün sayfasından eşlendi"
    ]),
    specs: {
      Marka: "THREON",
      Kategori: `${category.category} / ${category.subcategory}`,
      "Toplam stok": String(stock)
    },
    variants,
    reviews: [],
    source: SOURCE_MARKER,
    sourceUrl: url,
    importedAt: new Date().toISOString()
  };
}

async function readProductUrls() {
  const xml = await fetchText(PRODUCTS_SITEMAP);
  const urls = [...xml.matchAll(/<loc>(https:\/\/lofibuy\.com\/[^<]+)<\/loc>/g)].map((match) => match[1]);
  return unique(urls);
}

async function main() {
  const productUrls = await readProductUrls();
  if (!productUrls.length) throw new Error("Lofibuy products.xml icinde urun bulunamadi.");

  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const imported = [];
  const failures = [];

  for (const [index, url] of productUrls.entries()) {
    try {
      const html = await fetchText(url);
      const data = parseNextData(html);
      const pageProps = data.props?.pageProps || {};
      const product = pageProps.pageSpecificData || {};
      const jsonLd = parseJsonLd(html);
      const jsonProduct = jsonLd.find((entry) => jsonLdType(entry).includes("Product")) || {};
      const slug = slugify(product.metaData?.slug || data.query?.slug || new URL(url).pathname.replace(/^\//, ""));
      const imageUrls = productImageSources(product, jsonProduct, pageProps.configJson || {});
      const localImages = await downloadProductImages(slug, imageUrls);
      imported.push(normalizeProduct(url, html, index, localImages));
      console.log(`${String(index + 1).padStart(2, "0")}/${productUrls.length} ${slug} -> ${localImages.length} gorsel`);
    } catch (error) {
      failures.push({ url, error: error.message });
      console.warn(`Atlandi: ${url} (${error.message})`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (!imported.length) {
    throw new Error(`Hic urun ice aktarilamadi. Hata sayisi: ${failures.length}`);
  }

  const currentProducts = Array.isArray(siteData.products) ? siteData.products : [];
  const keepProducts = currentProducts.filter((product) => product.source !== SOURCE_MARKER && !String(product.id || "").startsWith("lofibuy-"));
  siteData.products = [...imported, ...keepProducts];
  siteData.settings = {
    ...(siteData.settings || {}),
    lastLofibuyImport: new Date().toISOString(),
    lofibuyProductCount: imported.length
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  fs.writeFileSync(
    path.join(process.cwd(), "data", "lofibuy-import-report.json"),
    `${JSON.stringify({ imported: imported.length, failures, urls: productUrls.length }, null, 2)}\n`
  );

  console.log(`Tamamlandi: ${imported.length}/${productUrls.length} urun ice aktarildi.`);
  if (failures.length) console.log(`Hata raporu: data/lofibuy-import-report.json (${failures.length} hata)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
