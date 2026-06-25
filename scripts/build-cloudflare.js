const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const ASSET_UPLOAD_DIR = path.join(ROOT, "assets", "uploads");
const DIST_DIR = path.join(ROOT, "dist");
const SITE_DATA_PATH = path.join(DATA_DIR, "site-data.json");
const SITE_PUBLIC_PATH = path.join(DATA_DIR, "site-public.json");
const PRODUCTS_INDEX_PATH = path.join(DATA_DIR, "products-index.json");
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PRODUCT_CHUNK_MAX_BYTES = 2_000_000;
const BUILD_VERSION = "cloudflare-split-20260625";

const PUBLIC_FILES = [
  "index.html",
  "products.html",
  "product.html",
  "collection.html",
  "lookbook.html",
  "about.html",
  "account.html",
  "checkout.html",
  "contact.html",
  "faq.html",
  "privacy.html",
  "returns.html",
  "shipping.html",
  "terms.html",
  "style-guide.html",
  "styles.css",
  "script.js",
  "service-worker.js",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml"
];

const STATIC_ROUTES = {
  "/magaza": "/products.html",
  "/shop": "/products.html",
  "/koleksiyon": "/collection.html",
  "/lookbook": "/lookbook.html",
  "/hakkimizda": "/about.html",
  "/marka-hikayesi": "/about.html",
  "/hesabim": "/account.html",
  "/odeme": "/checkout.html",
  "/musteri-destegi": "/contact.html",
  "/kargo-ve-teslimat": "/shipping.html",
  "/iade-ve-degisim": "/returns.html",
  "/kvkk-ve-gizlilik": "/privacy.html",
  "/mesafeli-satis": "/terms.html",
  "/sss": "/faq.html",
  "/stil-rehberi": "/style-guide.html"
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload, pretty = false) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, pretty ? 2 : 0));
  fs.renameSync(tempPath, filePath);
}

function slugify(value = "") {
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
    .slice(0, 80);
}

function cleanText(value = "", maxLength = 500) {
  const text = String(value || "")
    .replace(/ÜRÜN\s+ÖZELLİKLERİ[:：]?\s*/gi, "")
    .replace(/(?:MATERYAL|MANKEN\s*Ölçüler|Manken\s+Ölçüleri|YIKAMA\s*(?:\||&)\s*BAKIM|ÖLÇÜ\s+TABLOSU|BEDEN\s+TABLOSU)[\s\S]*$/gi, " ")
    .replace(/\bBolum\b/gi, "Bölüm")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function merchandisingScore(product = {}) {
  if (Number.isFinite(Number(product.merchandisingScore))) return Number(product.merchandisingScore);
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
  if (["takımlar", "üst giyim", "alt giyim", "dış giyim", "iç giyim", "kadın", "erkek"].some((item) => category.includes(item))) score += 18;
  if (/ceket|mont|kaban|gömlek|gomlek|yelek|pantolon|takım|takim|hoodie|sweat|cargo|triko|elbise|etek|sütyen|sutyen|külot|kulot|bralet|body|boxer/.test(`${name} ${subcategory}`)) score += 24;
  if (price > 0 && price <= 2500) score += 95;
  else if (price <= 4500) score += 75;
  else if (price <= 7500) score += 45;
  else if (price <= 12000) score += 20;
  else score -= 18;
  if (/gift card|hediye kart|aksesuar|çorap|corap/.test(name)) score -= 220;
  return score;
}

function extractDataImage(value, context, stats) {
  const match = String(value || "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return value;
  const ext = match[1].toLowerCase().replace("jpeg", "jpg");
  const base64 = match[2].replace(/\s+/g, "");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length) return value;
  const hash = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 12);
  const safeContext = slugify(context || "image").slice(0, 52) || "image";
  const filename = `${safeContext}-${hash}.${ext}`;
  const filePath = path.join(ASSET_UPLOAD_DIR, filename);
  fs.mkdirSync(ASSET_UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);
  stats.extractedImages += 1;
  stats.extractedImageBytes += buffer.length;
  return `assets/uploads/${filename}`;
}

function extractImagesDeep(value, context, stats) {
  if (typeof value === "string") return extractDataImage(value, context, stats);
  if (Array.isArray(value)) return value.map((item, index) => extractImagesDeep(item, `${context}-${index + 1}`, stats));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, extractImagesDeep(item, `${context}-${key}`, stats)])
    );
  }
  return value;
}

function publicProduct(product = {}) {
  const summary = cleanText(product.summary || product.description || product.fit || "", 240);
  const description = cleanText(product.description || product.summary || "", 420);
  const specs = Object.fromEntries(
    Object.entries(product.specs || {})
      .map(([key, value]) => [cleanText(key, 80), cleanText(value, 180)])
      .filter(([key, value]) => key && value)
      .slice(0, 8)
  );
  const features = Array.isArray(product.features)
    ? product.features.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 8)
    : [];
  return {
    id: product.id || product.slug || slugify(product.name),
    name: product.name,
    slug: product.slug || slugify(product.name),
    category: product.category,
    subcategory: product.subcategory,
    price: product.price,
    comparePrice: product.comparePrice,
    currency: product.currency || "TRY",
    stock: Number.isFinite(Number(product.stock)) ? Number(product.stock) : 0,
    status: "active",
    featured: Boolean(product.featured),
    badge: product.badge,
    sku: product.sku,
    image: product.image || "assets/threon-fashion-hero.png",
    imageFit: product.imageFit || "cover",
    imagePosition: product.imagePosition || "center center",
    imageRatio: product.imageRatio || "portrait",
    gallery: [],
    collection: product.collection,
    fit: product.fit,
    summary: summary || `${product.category || "THREON"} seçkisinden premium THREON parçası.`,
    description: description || `${product.name || "Bu ürün"} kapsül gardıroba uyum sağlayan premium bir parçadır.`,
    material: cleanText(product.material || "", 180),
    care: cleanText(product.care || "", 180),
    features,
    modelInfo: cleanText(product.modelInfo || "", 160),
    shippingNote: cleanText(product.shippingNote || "", 160),
    specs,
    sizes: Array.isArray(product.sizes) ? product.sizes.filter(Boolean) : [],
    colors: Array.isArray(product.colors) ? product.colors.filter(Boolean) : [],
    genderSections: Array.isArray(product.genderSections) ? [...new Set(product.genderSections.filter(Boolean))] : [],
    merchandisingScore: merchandisingScore(product)
  };
}

function isDemoProduct(product = {}) {
  const haystack = [product.id, product.slug, product.name, product.source, product.collection, product.summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\b(demo|mock|placeholder|test ürünü|test urunu|lorem ipsum)\b/.test(haystack);
}

function productQualityScore(product = {}) {
  return (
    merchandisingScore(product) +
    (product.image && !String(product.image).includes("threon-fashion-hero") ? 200 : 0) +
    (Array.isArray(product.gallery) ? product.gallery.length * 8 : 0) +
    (Number(product.stock) > 0 ? 30 : 0) +
    (product.description ? 10 : 0)
  );
}

function cleanPublicProducts(products = []) {
  const report = { source: products.length, removedInactive: 0, removedDemo: 0, removedBroken: 0, removedDuplicates: 0 };
  const kept = new Map();
  products.forEach((product) => {
    if (!product || product.status === "draft" || product.status === "inactive") {
      report.removedInactive += 1;
      return;
    }
    if (!product.name || !(product.slug || product.id)) {
      report.removedBroken += 1;
      return;
    }
    if (isDemoProduct(product)) {
      report.removedDemo += 1;
      return;
    }
    const compact = publicProduct(product);
    const exactKey = compact.slug || `${slugify(compact.name)}-${slugify(compact.category)}-${slugify(compact.subcategory)}-${compact.price}`;
    const duplicateKey = `${slugify(compact.name)}-${slugify(compact.category)}-${slugify(compact.subcategory)}-${compact.price}-${compact.image}`;
    const key = exactKey || duplicateKey;
    const current = kept.get(key);
    if (!current || productQualityScore(compact) > productQualityScore(current)) {
      if (current) report.removedDuplicates += 1;
      kept.set(key, compact);
    } else {
      report.removedDuplicates += 1;
    }
  });
  const cleaned = [...kept.values()].sort((a, b) => merchandisingScore(b) - merchandisingScore(a));
  report.publicProducts = cleaned.length;
  return { products: cleaned, report };
}

function chunkProducts(products = []) {
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

function removeGeneratedProductData() {
  fs.readdirSync(DATA_DIR)
    .filter((file) => /^products-\d+\.json$/.test(file) || file === "products-index.json")
    .forEach((file) => fs.unlinkSync(path.join(DATA_DIR, file)));
}

function writePublicData(data, products) {
  removeGeneratedProductData();
  const chunks = chunkProducts(products);
  const productChunks = chunks.map((chunk, index) => {
    const file = `products-${index + 1}.json`;
    const filePath = path.join(DATA_DIR, file);
    writeJson(filePath, { products: chunk });
    return { file, count: chunk.length, bytes: fs.statSync(filePath).size };
  });
  const indexPayload = {
    version: BUILD_VERSION,
    productCount: products.length,
    generatedAt: new Date().toISOString(),
    productChunks
  };
  writeJson(PRODUCTS_INDEX_PATH, indexPayload, true);
  writeJson(
    SITE_PUBLIC_PATH,
    {
      settings: data.settings || {},
      productsIndex: "data/products-index.json",
      productCount: products.length,
      productChunks
    },
    true
  );
  return indexPayload;
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
    fs.linkSync(source, target);
  } catch {
    fs.copyFileSync(source, target);
  }
}

function copyDirectory(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    const stat = fs.lstatSync(sourcePath);
    if (stat.isSymbolicLink()) {
      const realPath = fs.realpathSync(sourcePath);
      const realStat = fs.statSync(realPath);
      if (realStat.isDirectory()) copyDirectory(realPath, targetPath);
      else if (realStat.isFile()) copyFile(realPath, targetPath);
      continue;
    }
    if (stat.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (stat.isFile()) copyFile(sourcePath, targetPath);
  }
}

function collectionRoutesFromServer() {
  const serverPath = path.join(ROOT, "server.js");
  const source = fs.existsSync(serverPath) ? fs.readFileSync(serverPath, "utf8") : "";
  const match = source.match(/const CLEAN_COLLECTION_ROUTES = new Set\(\[([\s\S]*?)\]\);/);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
}

function writeCloudflareRoutes() {
  const redirects = [
    "/urun/* /product.html 200",
    ...Object.entries(STATIC_ROUTES).map(([from, to]) => `${from} ${to} 200`),
    ...collectionRoutesFromServer().map((route) => `${route} /collection.html 200`)
  ];
  fs.writeFileSync(path.join(DIST_DIR, "_redirects"), `${[...new Set(redirects)].join("\n")}\n`);
  fs.writeFileSync(
    path.join(DIST_DIR, "_headers"),
    [
      "/data/*.json",
      "  Cache-Control: public, max-age=300, stale-while-revalidate=3600",
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable"
    ].join("\n")
  );
}

function collectAssetReferences(value, refs = new Set()) {
  if (typeof value === "string") {
    const matches = value.match(/assets\/[^\s"'`)<>]+/g) || [];
    matches.forEach((match) => refs.add(match.replace(/[),.;]+$/g, "")));
    if (value.startsWith("assets/")) refs.add(value);
    return refs;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectAssetReferences(item, refs));
    return refs;
  }
  if (value && typeof value === "object") {
    Object.values(value).forEach((item) => collectAssetReferences(item, refs));
  }
  return refs;
}

function linkedAssetDirectory(ref, linkedDirs) {
  const parts = String(ref || "").split("/");
  if (parts.length < 3 || parts[0] !== "assets") return "";
  const top = parts.slice(0, 2).join("/");
  if (linkedDirs.has(top)) return top;
  const sourceTop = path.join(ROOT, top);
  try {
    const stat = fs.lstatSync(sourceTop);
    if (!stat.isSymbolicLink()) return "";
    const targetTop = path.join(DIST_DIR, top);
    fs.mkdirSync(path.dirname(targetTop), { recursive: true });
    if (fs.existsSync(targetTop)) fs.rmSync(targetTop, { recursive: true, force: true });
    fs.symlinkSync(fs.realpathSync(sourceTop), targetTop, "dir");
    linkedDirs.add(top);
    return top;
  } catch {
    return "";
  }
}

function copyReferencedAsset(ref, missing, linkedDirs) {
  if (!ref || /^(?:https?:)?\/\//i.test(ref) || ref.startsWith("/")) return;
  const safeRef = ref.split("?")[0].replace(/^\/+/, "");
  if (!safeRef.startsWith("assets/")) return;
  if (linkedAssetDirectory(safeRef, linkedDirs)) return;
  const sourcePath = path.join(ROOT, safeRef);
  const targetPath = path.join(DIST_DIR, safeRef);
  try {
    const stat = fs.statSync(sourcePath);
    if (stat.isFile()) copyFile(sourcePath, targetPath);
  } catch {
    missing.add(safeRef);
  }
}

function prepareDist(data, products) {
  fs.rmSync(DIST_DIR, { recursive: true, force: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });
  PUBLIC_FILES.forEach((file) => {
    const source = path.join(ROOT, file);
    if (fs.existsSync(source)) copyFile(source, path.join(DIST_DIR, file));
  });
  fs.mkdirSync(path.join(DIST_DIR, "data"), { recursive: true });
  ["site-public.json", "products-index.json", ...fs.readdirSync(DATA_DIR).filter((file) => /^products-\d+\.json$/.test(file))].forEach((file) => {
    copyFile(path.join(DATA_DIR, file), path.join(DIST_DIR, "data", file));
  });
  const refs = collectAssetReferences({ settings: data.settings || {}, products });
  PUBLIC_FILES.forEach((file) => {
    const source = path.join(ROOT, file);
    if (fs.existsSync(source)) collectAssetReferences(fs.readFileSync(source, "utf8"), refs);
  });
  const missingAssets = new Set();
  const linkedDirs = new Set();
  refs.forEach((ref) => copyReferencedAsset(ref, missingAssets, linkedDirs));
  writeCloudflareRoutes();
  return { assetCount: refs.size - missingAssets.size, linkedAssetDirs: [...linkedDirs], missingAssets: [...missingAssets].slice(0, 50) };
}

function walkFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink()) files.push(filePath);
    else if (entry.isDirectory()) files.push(...walkFiles(filePath));
    else files.push(filePath);
  }
  return files;
}

function assertFileSizes(directory) {
  const oversized = walkFiles(directory)
    .map((file) => ({ file, bytes: fs.lstatSync(file).size }))
    .filter((item) => item.bytes > MAX_FILE_BYTES);
  if (oversized.length) {
    throw new Error(`25 MB üstü dosya kaldı: ${oversized.map((item) => path.relative(directory, item.file)).join(", ")}`);
  }
}

function main() {
  const stats = { extractedImages: 0, extractedImageBytes: 0 };
  const data = readJson(SITE_DATA_PATH);
  const imageCleanData = extractImagesDeep(data, "site-data", stats);
  writeJson(SITE_DATA_PATH, imageCleanData, true);
  const { products, report } = cleanPublicProducts(imageCleanData.products || []);
  const indexPayload = writePublicData(imageCleanData, products);
  const assetReport = prepareDist(imageCleanData, products);
  assertFileSizes(DIST_DIR);
  const outputReport = {
    generatedAt: new Date().toISOString(),
    version: BUILD_VERSION,
    privateSourceKept: "data/site-data.json kaynakta tutuldu, dist klasörüne dahil edilmedi.",
    removedPrivatePublicFields: ["customers", "orders", "messages"],
    extractedImages: stats.extractedImages,
    extractedImageBytes: stats.extractedImageBytes,
    productCleanup: report,
    productChunks: indexPayload.productChunks,
    copiedAssets: assetReport.assetCount,
    linkedAssetDirs: assetReport.linkedAssetDirs,
    missingAssets: assetReport.missingAssets,
    maxDistFileBytes: Math.max(...walkFiles(DIST_DIR).map((file) => fs.lstatSync(file).size)),
    dist: path.relative(ROOT, DIST_DIR)
  };
  writeJson(path.join(DATA_DIR, "cloudflare-build-report.json"), outputReport, true);
  console.log(JSON.stringify(outputReport, null, 2));
}

main();
