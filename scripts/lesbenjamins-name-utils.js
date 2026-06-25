function cleanString(value, fallback = "") {
  return String(value ?? fallback).replace(/\s+/g, " ").trim();
}

function titleCase(value = "") {
  return cleanString(value)
    .toLocaleLowerCase("tr-TR")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 1) return part.toLocaleUpperCase("tr-TR");
      return part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1);
    })
    .join(" ");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagsText(tags = "") {
  if (Array.isArray(tags)) return tags.join(" ");
  return String(tags || "");
}

function stripProductCodes(value = "") {
  return cleanString(value)
    .replace(/\bLB\d[\w-]*\b/gi, " ")
    .replace(/\b\d{3,6}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rawNameFromSourceUrl(value = "") {
  const source = cleanString(value);
  if (!source) return "";
  try {
    const parsed = new URL(source);
    const handle = decodeURIComponent(parsed.pathname.split("/products/")[1] || "");
    return cleanString(
      handle
        .replace(/-lb[a-z0-9][\w-]*$/i, "")
        .replace(/-/g, " ")
    );
  } catch {
    return "";
  }
}

const PRODUCT_REPLACEMENTS = [
  ["KNIT ZIPPED JACKET", "Fermuarlı Triko Ceket"],
  ["LONG PUFFER JACKET", "Uzun Şişme Mont"],
  ["PUFFER JACKET", "Şişme Mont"],
  ["BOMBER JACKET", "Bomber Ceket"],
  ["LEATHER JACKET", "Deri Ceket"],
  ["SUEDE JACKET", "Süet Ceket"],
  ["DENIM JACKET", "Denim Ceket"],
  ["TRACK JACKET", "Eşofman Üstü"],
  ["TRACKTOP", "Eşofman Üstü"],
  ["TRACK TOP", "Eşofman Üstü"],
  ["TRENCHCOAT", "Trençkot"],
  ["SHORT SLEEVE TEE", "Kısa Kollu T-Shirt"],
  ["LONG SLEEVE TEE", "Uzun Kollu T-Shirt"],
  ["OVERSIZED TEE", "Oversize T-Shirt"],
  ["RELAXED TEE", "Relaxed T-Shirt"],
  ["REGULAR TEE", "Regular T-Shirt"],
  ["FITTED TEE", "Fitted T-Shirt"],
  ["BOXED TEE", "Boxy T-Shirt"],
  ["POLO TEE", "Polo T-Shirt"],
  ["KNIT POLO TEE", "Triko Polo T-Shirt"],
  ["LONG SLEEVE POLO", "Uzun Kollu Polo"],
  ["SHORT SLEEVE SHIRT", "Kısa Kollu Gömlek"],
  ["DENIM SHIRT", "Denim Gömlek"],
  ["DENIM PANT", "Denim Pantolon"],
  ["LEATHER PANT", "Deri Pantolon"],
  ["UTILITY PANT", "Utility Pantolon"],
  ["TRACK PANT", "Eşofman Altı"],
  ["TRACKPANT", "Eşofman Altı"],
  ["SWEATPANT", "Eşofman Altı"],
  ["DENIM SHORT", "Denim Şort"],
  ["SWIMSHORT", "Deniz Şortu"],
  ["DENIM SKIRT", "Denim Etek"],
  ["LEATHER SKIRT", "Deri Etek"],
  ["KNIT VEST", "Triko Yelek"],
  ["TANK TOP", "Askılı Top"],
  ["DENIM TOP", "Denim Top"],
  ["ZIP HOODIES", "Fermuarlı Kapüşonlu Sweatshirt"],
  ["ZIP HOODIE", "Fermuarlı Kapüşonlu Sweatshirt"],
  ["HOODIES", "Kapüşonlu Sweatshirt"],
  ["HOODIE", "Kapüşonlu Sweatshirt"],
  ["SWEATSHIRT", "Sweatshirt"],
  ["CARDIGAN", "Hırka"],
  ["SWEATER", "Kazak"],
  ["KNITWEAR", "Triko"],
  ["KNIT", "Triko"],
  ["BLAZER", "Blazer"],
  ["JACKET", "Ceket"],
  ["COAT", "Kaban"],
  ["VEST", "Yelek"],
  ["SHORT", "Şort"],
  ["PANTS", "Pantolon"],
  ["PANT", "Pantolon"],
  ["SHIRT", "Gömlek"],
  ["BLOUSE", "Bluz"],
  ["DRESS", "Elbise"],
  ["SKIRT", "Etek"],
  ["TEE", "T-Shirt"],
  ["POLO", "Polo"],
  ["TOP", "Top"],
  ["BRALETTE", "Bralet"],
  ["BRA", "Sütyen"],
  ["PANTY", "Külot"],
  ["BOXER", "Boxer"],
  ["BIKINI BOTTOM", "Bikini Altı"],
  ["BIKINI TOP", "Bikini Üstü"],
  ["SWIMSUIT", "Mayo"],
  ["SWIMWEAR", "Mayo"],
  ["BUCKET HAT", "Bucket Şapka"],
  ["CAP", "Şapka"],
  ["HAT", "Şapka"],
  ["SOCKS", "Çorap"],
  ["SOCK", "Çorap"],
  ["EMBOSSED CARD HOLDER", "Kabartmalı Kartlık"],
  ["FOLDED CARD HOLDER", "Katlanır Kartlık"],
  ["CARD HOLDER", "Kartlık"],
  ["LULU BAG", "Lulu Çanta"],
  ["DEE BAG", "Dee Çanta"],
  ["MINI MONA BAG", "Mini Mona Çanta"],
  ["MONA BAG", "Mona Çanta"],
  ["MAGGIE BAG", "Maggie Çanta"],
  ["BAG", "Çanta"],
  ["WALLET", "Cüzdan"],
  ["RING", "Yüzük"],
  ["EARRING", "Küpe"],
  ["BRACELET", "Bileklik"],
  ["NECKLACE", "Kolye"],
  ["SUNGLASSES", "Güneş Gözlüğü"],
  ["GLASSES", "Gözlük"],
  ["SLIDE", "Terlik"],
  ["SLIPPER", "Terlik"],
  ["SNEAKER", "Sneaker"],
  ["SHOE", "Ayakkabı"]
].sort((left, right) => right[0].length - left[0].length);

const COLOR_REPLACEMENTS = [
  ["neutral nude", "Nude"],
  ["sunny x-ray wash", "Yıkamalı Sarı"],
  ["stone cold", "Soğuk Taş"],
  ["old maroon", "Bordo"],
  ["merlot fields", "Bordo"],
  ["army canvas", "Haki"],
  ["navy blue", "Lacivert"],
  ["black", "Siyah"],
  ["noir", "Siyah"],
  ["white", "Beyaz"],
  ["ecru", "Ekru"],
  ["beige", "Bej"],
  ["cream", "Krem"],
  ["navy", "Lacivert"],
  ["blue", "Mavi"],
  ["green", "Yeşil"],
  ["red", "Kırmızı"],
  ["maroon", "Bordo"],
  ["burgundy", "Bordo"],
  ["brown", "Kahverengi"],
  ["camel", "Camel"],
  ["khaki", "Haki"],
  ["olive", "Zeytin"],
  ["stone", "Taş"],
  ["indigo", "İndigo"],
  ["gray", "Gri"],
  ["grey", "Gri"],
  ["silver", "Gümüş"],
  ["gold", "Altın"],
  ["yellow", "Sarı"],
  ["orange", "Turuncu"],
  ["pink", "Pembe"],
  ["purple", "Mor"],
  ["allover", "Desenli"]
];

const CAPSULES = [
  ["socrates", "Socrates"],
  ["altaicana", "Altaicana"],
  ["eastern punk", "Eastern Punk"],
  ["classics", "Classics"],
  ["halo", "Halo"],
  ["core", "Core"],
  ["essential", "Essential"],
  ["buaisou", "Buaisou"],
  ["collab", "Collab"]
];

function polishWords(value = "") {
  return cleanString(value)
    .split(" ")
    .map((part) => {
      if (!part) return "";
      if (/[a-zığüşöç]/.test(part) || part.includes("-")) return part;
      if (part.length <= 2) return part;
      return titleCase(part);
    })
    .join(" ");
}

function translatedProductName(rawName = "", category = "", subcategory = "") {
  const stripped = stripProductCodes(rawName);
  const source = cleanString(stripped || subcategory || category || "Ürün").toUpperCase();
  let translated = ` ${source} `;

  PRODUCT_REPLACEMENTS.forEach(([from, to]) => {
    translated = translated.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"), to);
  });

  translated = cleanString(translated);
  if (!translated || translated === source) {
    translated = subcategory || category || source || "Ürün";
  }

  if (category === "Aksesuar" && subcategory === "Parfüm" && !/parfüm/i.test(translated)) {
    translated = `${polishWords(translated)} Parfüm`;
  }

  return polishWords(translated);
}

function translatedColor(colors = []) {
  const values = Array.isArray(colors) ? colors : [colors];
  const raw = values.find((color) => {
    const text = cleanString(color).toLowerCase();
    return text && !["standart", "standard", "default title"].includes(text);
  });
  if (!raw) return "";

  const text = cleanString(raw).toLowerCase();
  if (/allover|pattern|print|multi/.test(text)) return "Desenli";

  const match = COLOR_REPLACEMENTS.find(([from]) => text.includes(from));
  if (match) return match[1];
  return polishWords(raw);
}

function genderLabel(tags = "", category = "") {
  if (category === "Aksesuar") return "";
  const source = tagsText(tags).toLocaleLowerCase("tr-TR");
  if (/\b(women|woman|female)\b|kadın/.test(source)) return "Kadın";
  if (/\b(men|man|male)\b|erkek/.test(source)) return "Erkek";
  return "";
}

function capsuleLabel(tags = "", baseName = "") {
  const source = tagsText(tags).toLocaleLowerCase("tr-TR");
  const base = baseName.toLocaleLowerCase("tr-TR");
  const match = CAPSULES.find(([needle, label]) => source.includes(needle) && !base.includes(label.toLocaleLowerCase("tr-TR")));
  return match ? match[1] : "";
}

function uniqueNameParts(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const text = cleanString(part);
    if (!text) return false;
    const key = text.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function localizedLesBenjaminsName({ rawName, category, subcategory, colors, tags, type } = {}) {
  const base = translatedProductName(rawName || type, category, subcategory);
  const color = translatedColor(colors);
  const gender = genderLabel(tags, category);
  const capsule = capsuleLabel(tags, base);
  const lowerBase = base.toLocaleLowerCase("tr-TR");
  const safeColor = color && !lowerBase.includes(color.toLocaleLowerCase("tr-TR")) ? color : "";

  return cleanString(uniqueNameParts([capsule, gender, safeColor, base]).join(" "));
}

function localizedNameFromStoredProduct(product = {}) {
  return localizedLesBenjaminsName({
    rawName: rawNameFromSourceUrl(product.sourceUrl) || product.name,
    category: product.category,
    subcategory: product.subcategory,
    colors: product.colors,
    tags: product.specs?.Etiketler || product.tags,
    type: product.specs?.["Orijinal kategori"] || product.subcategory
  });
}

module.exports = {
  localizedLesBenjaminsName,
  localizedNameFromStoredProduct,
  rawNameFromSourceUrl,
  stripProductCodes,
  translatedProductName
};
