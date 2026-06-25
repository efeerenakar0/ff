const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(process.cwd(), "data", "site-data.json");
const SOURCE_MARKER = /les\s*benjamins|lofibuy|vamos\s*clo|vamosclo|vamos/i;
const SOURCE_LABEL = /(Les\s*Benjamins|LOFIBUY|Lofibuy|VAMOS\s*CLO|VamosClo|Vamos)/gi;
const HIDDEN_SPEC_KEYS = new Set(["Kaynak", "Orijinal kategori", "Shopify ID", "Yayın tarihi", "Etiketler"]);

function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function categoryDisplay(product = {}) {
  return [product.category, product.subcategory].map(cleanString).filter(Boolean).join(" / ") || "THREON";
}

function isImportedSource(product = {}) {
  return ["lesbenjamins", "lofibuy", "vamosclo"].includes(product.source) || SOURCE_MARKER.test(product.collection || "");
}

function cleanCustomerText(value = "", product = {}) {
  const fallback = `${product.name || "Bu ürün"} THREON kataloğuna eklenen premium sezon parçası.`;
  const raw = cleanString(value);
  if (!raw) return fallback;
  return raw
    .replace(/(?:Les\s*Benjamins|LOFIBUY|Lofibuy|VAMOS\s*CLO|VamosClo|Vamos)\s+seçkisinden\s+THREON\s+kataloğuna\s+eklenen\s+premium\s+(?:parça|ürün)\.?/gi, "THREON kataloğuna eklenen premium sezon parçası.")
    .replace(/(?:Les\s*Benjamins|LOFIBUY|Lofibuy|VAMOS\s*CLO|VamosClo|Vamos)\s+seçkisinden/gi, "THREON kataloğundan")
    .replace(SOURCE_LABEL, "THREON")
    .replace(/\bTHREON\s+THREON\b/g, "THREON")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanProductName(value = "") {
  return cleanString(value)
    .replace(/^(?:Les\s*Benjamins|LOFIBUY|Lofibuy|VAMOS\s*CLO|VamosClo|Vamos|THREON)\s*\|\s*/i, "")
    .replace(SOURCE_LABEL, "THREON")
    .replace(/^THREON\s*\|\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanImportedSpecs(product = {}) {
  const next = {};
  Object.entries(product.specs || {}).forEach(([key, value]) => {
    if (HIDDEN_SPEC_KEYS.has(key)) return;
    if (/^https?:\/\//i.test(cleanString(value))) return;
    const cleanKey = key === "Marka" ? "Marka" : key;
    const cleanValue = key === "Marka" ? "THREON" : cleanCustomerText(value, product);
    if (cleanKey && cleanValue) next[cleanKey] = cleanValue;
  });
  next.Marka = "THREON";
  next.Kategori = categoryDisplay(product);
  next["Ürün kodu"] = cleanString(next["Ürün kodu"] || product.sku || product.id);
  next["Toplam stok"] = cleanString(next["Toplam stok"] || product.stock || "0");
  return next;
}

function cleanFeatures(product = {}) {
  const base = Array.isArray(product.features) ? product.features : [];
  const kept = base
    .map((feature) => cleanCustomerText(feature, product))
    .filter((feature) => feature && !/seçkisi|koleksiyon ürünü/i.test(feature));
  return [...new Set(["THREON premium sezon ürünü", categoryDisplay(product), ...kept])];
}

function isSeedReview(review = {}) {
  const email = cleanString(review.email).toLowerCase();
  const author = cleanString(review.author).toLocaleLowerCase("tr-TR");
  return email.endsWith("@threon.local") || ["doğrulanmış üye", "threon club", "tekrar alışveriş", "outerwear müşteri"].includes(author);
}

function main() {
  const siteData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  let cleanedCollections = 0;
  let cleanedReviews = 0;
  let cleanedImportedProducts = 0;

  siteData.products = (siteData.products || []).map((product) => {
    const next = { ...product };
    const imported = isImportedSource(next);

    if (Array.isArray(next.reviews)) {
      const before = next.reviews.length;
      next.reviews = next.reviews.filter((review) => !isSeedReview(review));
      cleanedReviews += before - next.reviews.length;
    } else {
      next.reviews = [];
    }

    if (imported) {
      cleanedImportedProducts += 1;
      next.name = cleanProductName(next.name);
      if (next.collection) cleanedCollections += 1;
      next.collection = "";
      if (/^(Les\s*Benjamins|LOFIBUY|Lofibuy|VAMOS\s*CLO|VamosClo|Vamos|Sale)$/i.test(cleanString(next.badge))) {
        next.badge = next.comparePrice ? "İndirim" : "Premium";
      }
      next.modelInfo = SOURCE_MARKER.test(next.modelInfo || "")
        ? "Beden, renk ve stok bilgileri ürün varyantlarına göre gösterilir."
        : cleanCustomerText(next.modelInfo, next);
      next.summary = cleanCustomerText(next.summary, next);
      next.description = cleanCustomerText(next.description, next);
      next.material = cleanCustomerText(next.material || "Ürün detayında belirtilmiştir.", next);
      next.features = cleanFeatures(next);
      next.specs = cleanImportedSpecs(next);
    }

    return next;
  });

  siteData.settings = {
    ...(siteData.settings || {}),
    lastProductDisplayCleanup: new Date().toISOString()
  };

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(siteData, null, 2)}\n`);
  console.log(JSON.stringify({ cleanedImportedProducts, cleanedCollections, cleanedReviews }, null, 2));
}

main();
