const STORAGE_KEYS = {
  siteData: "threonSiteData",
  adminMode: "threonAdminMode",
  cart: "threonCart",
  wishlist: "threonWishlist",
  compare: "threonCompare",
  notifyRequests: "threonNotifyRequests",
  addressBook: "threonAddressBook",
  recentProducts: "threonRecentProducts",
  cookieConsent: "threonCookieConsent",
  customerToken: "threonCustomerToken",
  customer: "threonCustomer"
};

const SITE_DATA_CACHE_VERSION = "site-lite-39";
const SITE_DATA_CACHE_TTL = 5 * 60 * 1000;
const TURKISH_MOBILE_INPUT_PREFIX = "+90 5";
const GLOBAL_IMAGE_FALLBACK = "assets/threon-fashion-hero.png";
const TRANSPARENT_IMAGE =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const INITIAL_PRODUCT_PAGE_SIZE =
  typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? 24 : 48;

const state = {
  site: null,
  sitePromise: null,
  productDetails: {},
  activeCategory: "all",
  activeSubcategory: "all",
  productSort: "featured",
  catalogPageSize: INITIAL_PRODUCT_PAGE_SIZE,
  catalogVisible: INITIAL_PRODUCT_PAGE_SIZE,
  catalogFilters: {
    saleOnly: false,
    inStock: true,
    size: "all",
    color: "all",
    gender: "all",
    maxPrice: 0
  },
  checkout: {
    couponCode: "",
    shippingMethod: "standard"
  },
  admin: {
    token: sessionStorage.getItem("threonAdminToken") || "",
    mode: sessionStorage.getItem(STORAGE_KEYS.adminMode) || "api",
    data: null,
    editingProductId: "",
    editingVisualId: "",
    editingShelfId: "",
    editingCouponId: "",
    productSearch: "",
    statusFilter: "all",
    visualSearch: "",
    visualPlacementFilter: "all",
    productVisible: 120
  },
  accountOtp: {
    timer: null,
    remaining: 0
  },
  collectionVisible: INITIAL_PRODUCT_PAGE_SIZE,
  cart: [],
  wishlist: [],
  compare: [],
  customerToken: localStorage.getItem("threonCustomerToken") || "",
  customer: null
};

function setupGlobalImageFallback() {
  if (typeof document === "undefined") return;
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!image || image.tagName !== "IMG") return;
      const currentSource = image.getAttribute("src") || "";
      if (image.dataset.fallbackApplied === "true" || currentSource.includes(GLOBAL_IMAGE_FALLBACK)) return;
      image.dataset.fallbackApplied = "true";
      image.src = GLOBAL_IMAGE_FALLBACK;
    },
    true
  );
}

function setupDeferredProductHoverImages() {
  if (typeof document === "undefined" || document.documentElement.dataset.hoverImagesReady === "true") return;
  document.documentElement.dataset.hoverImagesReady = "true";
  const loadHoverImage = (target) => {
    const card = target?.closest?.("[data-product-card]");
    if (!card) return;
    const image = qs("[data-hover-image][data-hover-src]", card);
    if (!image) return;
    const nextSource = image.dataset.hoverSrc;
    if (!nextSource) return;
    image.removeAttribute("data-hover-src");
    image.addEventListener("load", () => card.classList.add("is-hover-ready"), { once: true });
    image.src = nextSource;
    if (image.complete && image.naturalWidth > 0) card.classList.add("is-hover-ready");
  };
  document.addEventListener("pointerover", (event) => loadHoverImage(event.target), { passive: true });
  document.addEventListener("focusin", (event) => loadHoverImage(event.target));
  document.addEventListener("touchstart", (event) => loadHoverImage(event.target), { passive: true });
}

const TURKEY_LOCATIONS = {
  İstanbul: {
    Kadıköy: ["Caferağa", "Moda", "Fenerbahçe", "Koşuyolu", "Suadiye"],
    Beşiktaş: ["Levent", "Etiler", "Akat", "Ortaköy", "Nispetiye"],
    Şişli: ["Nişantaşı", "Teşvikiye", "Mecidiyeköy", "Bomonti", "Fulya"],
    Üsküdar: ["Altunizade", "Kuzguncuk", "Beylerbeyi", "Acıbadem", "Çengelköy"],
    Bakırköy: ["Ataköy", "Yeşilköy", "Florya", "Zuhuratbaba", "Osmaniye"]
  },
  Ankara: {
    Çankaya: ["Kızılay", "Bahçelievler", "Ayrancı", "Oran", "Dikmen"],
    Keçiören: ["Etlik", "Aktepe", "Ovacık", "İncirli", "Sanatoryum"],
    Yenimahalle: ["Batıkent", "Demetevler", "İvedik", "Ostim", "Karşıyaka"],
    Mamak: ["Akdere", "Boğaziçi", "Cebeci", "Kayaş", "Natoyolu"]
  },
  İzmir: {
    Konak: ["Alsancak", "Güzelyalı", "Göztepe", "Kemeraltı", "Mithatpaşa"],
    Karşıyaka: ["Bostanlı", "Mavişehir", "Alaybey", "Dedebaşı", "Yalı"],
    Bornova: ["Kazımdirik", "Erzene", "Doğanlar", "Çamdibi", "Pınarbaşı"],
    Bayraklı: ["Mansuroğlu", "Manavkuyu", "Adalet", "Osmangazi", "Soğukkuyu"]
  },
  Bursa: {
    Nilüfer: ["Görükle", "İhsaniye", "Özlüce", "Ataevler", "Beşevler"],
    Osmangazi: ["Heykel", "Çekirge", "Soğanlı", "Hüdavendigar", "Demirtaş"],
    Yıldırım: ["Duaçınarı", "Erikli", "Mimarsinan", "Setbaşı", "Yeşilyayla"]
  },
  Antalya: {
    Muratpaşa: ["Lara", "Fener", "Şirinyalı", "Gençlik", "Kızılarık"],
    Konyaaltı: ["Liman", "Hurma", "Altınkum", "Arapsuyu", "Uncalı"],
    Kepez: ["Dokuma", "Varsak", "Güneş", "Ahatlı", "Sütçüler"]
  },
  Kocaeli: {
    İzmit: ["Yenişehir", "Yahya Kaptan", "Alikahya", "Bekirdere", "Tavşantepe"],
    Gebze: ["Arapçeşme", "Mustafapaşa", "Osman Yılmaz", "Barış", "Tatlıkuyu"],
    Darıca: ["Bağlarbaşı", "Nenehatun", "Osmangazi", "Sırasöğütler", "Fevzi Çakmak"]
  }
};

const TURKEY_PROVINCES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Amasya",
  "Ankara",
  "Antalya",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Isparta",
  "Mersin",
  "İstanbul",
  "İzmir",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kırklareli",
  "Kırşehir",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Kahramanmaraş",
  "Mardin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Şanlıurfa",
  "Uşak",
  "Van",
  "Yozgat",
  "Zonguldak",
  "Aksaray",
  "Bayburt",
  "Karaman",
  "Kırıkkale",
  "Batman",
  "Şırnak",
  "Bartın",
  "Ardahan",
  "Iğdır",
  "Yalova",
  "Karabük",
  "Kilis",
  "Osmaniye",
  "Düzce"
];

const DEFAULT_DISTRICTS = ["Merkez"];
const DEFAULT_NEIGHBORHOODS = ["Merkez Mahallesi", "Yeni Mahalle", "Cumhuriyet Mahallesi", "Atatürk Mahallesi"];
const TURKIYE_API_BASE = "https://api.turkiyeapi.dev/v1";
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

function cleanCouponCode(value = "") {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 32);
}

function normalizeCoupon(input = {}, index = 0) {
  const code = cleanCouponCode(input.code || input.label || `KUPON${index + 1}`);
  const type = ["percent", "fixed", "shipping"].includes(input.type) ? input.type : "percent";
  const value = Math.max(0, Number(input.value) || 0);
  return {
    id: String(input.id || code || makeLocalId()).trim(),
    code,
    label: String(input.label || code).trim(),
    status: input.status === "draft" ? "draft" : "active",
    type,
    value: type === "shipping" ? 0 : value,
    minSubtotal: Math.max(0, Number(input.minSubtotal) || 0),
    maxDiscount: Math.max(0, Number(input.maxDiscount) || 0),
    startsAt: String(input.startsAt || "").trim(),
    endsAt: String(input.endsAt || "").trim(),
    note: String(input.note || "").trim()
  };
}

function normalizeCoupons(value = []) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_CHECKOUT_COUPONS;
  const seen = new Set();
  return source
    .map((coupon, index) => normalizeCoupon(coupon, index))
    .filter((coupon) => {
      if (!coupon.code || seen.has(coupon.code)) return false;
      seen.add(coupon.code);
      return true;
    });
}

function couponIsActive(coupon, subtotal = 0, now = Date.now()) {
  if (!coupon || coupon.status !== "active") return false;
  if (subtotal < Number(coupon.minSubtotal || 0)) return false;
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

function checkoutCoupons(settings = state.site?.settings) {
  return normalizeCoupons(settings?.coupons);
}

function findCheckoutCoupon(code = "", subtotal = 0) {
  const clean = cleanCouponCode(code);
  return checkoutCoupons().find((coupon) => coupon.code === clean && couponIsActive(coupon, subtotal)) || null;
}
const locationCache = {
  provinces: null,
  districts: new Map(),
  neighborhoods: new Map()
};

const CATEGORY_TREE = {
  "Kadın": ["Yeni Gelenler", "Üst Giyim", "Alt Giyim", "Dış Giyim", "Takımlar", "Elbise & Etek", "İç Giyim", "Plaj Giyim", "Aksesuar", "Unisex"],
  "Takımlar": ["Eşofman Takımı", "Alt Üst Takım", "Takım Elbise", "Şort Takım", "Kapsül Set"],
  "Üst Giyim": ["Kapüşonlu", "T-Shirt", "Gömlek", "Bluz", "Yelek", "Sweatshirt", "Triko | Kazak", "Tunik", "Elbise"],
  "Alt Giyim": ["Pantolon", "Kargo Pantolon", "Jeans", "Şort", "Eşofman Altı", "Etek", "Tayt", "Tulum | Salopet", "Çorap", "Terlik", "Ayakkabı"],
  "Dış Giyim": ["Kaban", "Mont", "Bomber", "Ceket", "Yelek", "Palto | Trençkot"],
  "Plaj Giyim": ["Mayo", "Bikini Üst", "Bikini Alt", "Deniz Şortu", "Plaj Üstü"],
  "İç Giyim": ["Sütyen", "Külot", "Bralet", "Büstiyer", "Jartiyer", "Babydoll & Bodysuit", "Korse", "Kombinezon & Jüpon", "Atlet & Body", "Boxer", "Diğer İç Giyim"],
  "Aksesuar": ["Çanta", "Cüzdan", "Şapka", "Şal | Fular", "Parfüm", "Aksesuar", "Kemer", "Takı", "Kolye", "Bileklik", "Küpe", "Yüzük", "Gözlük"]
};

const GENDER_FILTER_OPTIONS = [
  ["all", "Tüm cinsiyetler"],
  ["Kadın", "Kadın"],
  ["Erkek", "Erkek"],
  ["Unisex", "Unisex"]
];

const CATEGORY_IMAGES = {
  "Kadın": "assets/threon-fashion-hero.png",
  "Takımlar": "assets/threon-fashion-hero.png",
  "Üst Giyim": "assets/product-hoodie.png",
  "Alt Giyim": "assets/product-cargo.png",
  "Dış Giyim": "assets/product-bomber.png",
  "Plaj Giyim": "assets/threon-fashion-hero.png",
  "İç Giyim": "assets/threon-fashion-hero.png",
  "Aksesuar": "assets/product-sneaker.png"
};

const VISUAL_PLACEMENTS = {
  "home-hero": "Ana sayfa hero slider",
  "home-after-hero": "Ana sayfa hero altı",
  "home-after-featured": "Yeni gelenler altı",
  "home-after-dynamic": "Canlı raflar altı",
  "home-after-studio": "Stüdyo seçkisi altı",
  "home-before-footer": "Ana sayfa footer üstü",
  "products-after-hero": "Shop hero altı",
  "products-before-grid": "Shop ürün listesi üstü",
  "collection-after-hero": "Koleksiyon hero altı",
  "collection-before-products": "Koleksiyon ürünleri üstü",
  "lookbook-hero": "Lookbook hero",
  "lookbook-grid": "Lookbook kombin kartları",
  "lookbook-after-hero": "Lookbook hero altı",
  "lookbook-before-products": "Lookbook ürünleri üstü",
  "about-after-hero": "Marka sayfası hero altı",
  "about-before-footer": "Marka sayfası footer üstü",
  "contact-after-hero": "İletişim hero altı",
  "contact-before-form": "İletişim formu üstü",
  "account-after-hero": "Hesabım hero altı",
  "checkout-after-hero": "Ödeme hero altı"
};

const VISUAL_THEMES = {
  editorial: "Editoryal açık",
  dark: "Premium koyu",
  minimal: "Minimal"
};

const VISUAL_SHAPES = {
  square: "Kare",
  portrait: "Dikey dikdörtgen",
  landscape: "Yatay dikdörtgen",
  wide: "Geniş dikdörtgen"
};

const IMAGE_FITS = {
  cover: "Kırp / doldur",
  contain: "Tamamını göster"
};

const IMAGE_RATIOS = {
  portrait: "3 / 4",
  square: "1 / 1",
  landscape: "4 / 3",
  wide: "16 / 9"
};

const IMAGE_RATIO_LABELS = {
  portrait: "Dikey",
  square: "Kare",
  landscape: "Yatay",
  wide: "Geniş"
};

const CATEGORY_COPY = {
  "Kadın": "Kadın seçkisi, unisex kapsül parçalar ve sezonun premium siluetleri.",
  "Takımlar": "Hazır kombin setleri, eşofman takımları ve kapsül parçalar.",
  "Üst Giyim": "Kapüşonlu, tişört, gömlek, yelek ve katmanlı üst giyim seçkisi.",
  "Alt Giyim": "Pantolon, kargo, şort ve günlük premium alt giyim siluetleri.",
  "Dış Giyim": "Kaban, mont, bomber ve ceketlerden oluşan sezonluk dış giyim.",
  "Plaj Giyim": "Mayo, bikini ve resort sezonuna uygun plaj parçaları.",
  "İç Giyim": "Sütyen, külot, bralet, büstiyer, korse, atlet, body ve boxer iç giyim seçkisi.",
  "Aksesuar": "Çanta, cüzdan, şapka, parfüm ve tamamlayıcı premium aksesuarlar."
};

const CATEGORY_ROUTE_ALIASES = {
  magaza: { category: "", subcategory: "" },
  koleksiyon: { category: "", subcategory: "" },
  kadin: { category: "Kadın", subcategory: "" },
  kadinlar: { category: "Kadın", subcategory: "" },
  women: { category: "Kadın", subcategory: "" },
  womens: { category: "Kadın", subcategory: "" },
  "kadin-yeni-gelenler": { category: "Kadın", subcategory: "Yeni Gelenler" },
  "kadin-ust-giyim": { category: "Kadın", subcategory: "Üst Giyim" },
  "kadin-alt-giyim": { category: "Kadın", subcategory: "Alt Giyim" },
  "kadin-dis-giyim": { category: "Kadın", subcategory: "Dış Giyim" },
  "kadin-takimlar": { category: "Kadın", subcategory: "Takımlar" },
  "kadin-elbise-etek": { category: "Kadın", subcategory: "Elbise & Etek" },
  "kadin-ic-giyim": { category: "Kadın", subcategory: "İç Giyim" },
  "kadin-plaj-giyim": { category: "Kadın", subcategory: "Plaj Giyim" },
  "kadin-aksesuar": { category: "Kadın", subcategory: "Aksesuar" },
  "kadin-unisex": { category: "Kadın", subcategory: "Unisex" },
  hoodies: { category: "Üst Giyim", subcategory: "Kapüşonlu" },
  hoodie: { category: "Üst Giyim", subcategory: "Kapüşonlu" },
  kapusonlu: { category: "Üst Giyim", subcategory: "Kapüşonlu" },
  kapusonlular: { category: "Üst Giyim", subcategory: "Kapüşonlu" },
  sweatshirts: { category: "Üst Giyim", subcategory: "Sweatshirt" },
  tshirts: { category: "Üst Giyim", subcategory: "T-Shirt" },
  "t-shirts": { category: "Üst Giyim", subcategory: "T-Shirt" },
  "t-shirt": { category: "Üst Giyim", subcategory: "T-Shirt" },
  tisortler: { category: "Üst Giyim", subcategory: "T-Shirt" },
  tisort: { category: "Üst Giyim", subcategory: "T-Shirt" },
  shirts: { category: "Üst Giyim", subcategory: "Gömlek" },
  gomlek: { category: "Üst Giyim", subcategory: "Gömlek" },
  gomlekler: { category: "Üst Giyim", subcategory: "Gömlek" },
  bluz: { category: "Üst Giyim", subcategory: "Bluz" },
  bluzlar: { category: "Üst Giyim", subcategory: "Bluz" },
  tops: { category: "Üst Giyim", subcategory: "Bluz" },
  vest: { category: "Üst Giyim", subcategory: "Yelek" },
  yelek: { category: "Üst Giyim", subcategory: "Yelek" },
  yelekler: { category: "Üst Giyim", subcategory: "Yelek" },
  jacket: { category: "Dış Giyim", subcategory: "Ceket" },
  ceket: { category: "Dış Giyim", subcategory: "Ceket" },
  ceketler: { category: "Dış Giyim", subcategory: "Ceket" },
  triko: { category: "Üst Giyim", subcategory: "Triko | Kazak" },
  kazak: { category: "Üst Giyim", subcategory: "Triko | Kazak" },
  tunik: { category: "Üst Giyim", subcategory: "Tunik" },
  tunikler: { category: "Üst Giyim", subcategory: "Tunik" },
  dress: { category: "Üst Giyim", subcategory: "Elbise" },
  dresses: { category: "Üst Giyim", subcategory: "Elbise" },
  elbise: { category: "Üst Giyim", subcategory: "Elbise" },
  bottoms: { category: "Alt Giyim", subcategory: "" },
  pants: { category: "Alt Giyim", subcategory: "Pantolon" },
  pantolon: { category: "Alt Giyim", subcategory: "Pantolon" },
  pantolonlar: { category: "Alt Giyim", subcategory: "Pantolon" },
  cargo: { category: "Alt Giyim", subcategory: "Kargo Pantolon" },
  "cargo-pants": { category: "Alt Giyim", subcategory: "Kargo Pantolon" },
  "kargo-pantolon": { category: "Alt Giyim", subcategory: "Kargo Pantolon" },
  shorts: { category: "Alt Giyim", subcategory: "Şort" },
  sort: { category: "Alt Giyim", subcategory: "Şort" },
  sweatpants: { category: "Alt Giyim", subcategory: "Eşofman Altı" },
  "esofman-alti": { category: "Alt Giyim", subcategory: "Eşofman Altı" },
  skirt: { category: "Alt Giyim", subcategory: "Etek" },
  skirts: { category: "Alt Giyim", subcategory: "Etek" },
  etek: { category: "Alt Giyim", subcategory: "Etek" },
  tayt: { category: "Alt Giyim", subcategory: "Tayt" },
  taytlar: { category: "Alt Giyim", subcategory: "Tayt" },
  tulum: { category: "Alt Giyim", subcategory: "Tulum | Salopet" },
  tulumlar: { category: "Alt Giyim", subcategory: "Tulum | Salopet" },
  salopet: { category: "Alt Giyim", subcategory: "Tulum | Salopet" },
  jeans: { category: "Alt Giyim", subcategory: "Jeans" },
  denim: { category: "Alt Giyim", subcategory: "Jeans" },
  jean: { category: "Alt Giyim", subcategory: "Jeans" },
  boxer: { category: "İç Giyim", subcategory: "Boxer" },
  boxers: { category: "İç Giyim", subcategory: "Boxer" },
  corap: { category: "Alt Giyim", subcategory: "Çorap" },
  coraplar: { category: "Alt Giyim", subcategory: "Çorap" },
  terlik: { category: "Alt Giyim", subcategory: "Terlik" },
  terlikler: { category: "Alt Giyim", subcategory: "Terlik" },
  shoes: { category: "Alt Giyim", subcategory: "Ayakkabı" },
  sneakers: { category: "Alt Giyim", subcategory: "Ayakkabı" },
  ayakkabi: { category: "Alt Giyim", subcategory: "Ayakkabı" },
  ayakkabilar: { category: "Alt Giyim", subcategory: "Ayakkabı" },
  outerwear: { category: "Dış Giyim", subcategory: "" },
  "dis-giyim": { category: "Dış Giyim", subcategory: "" },
  kaban: { category: "Dış Giyim", subcategory: "Kaban" },
  kabanlar: { category: "Dış Giyim", subcategory: "Kaban" },
  coat: { category: "Dış Giyim", subcategory: "Kaban" },
  mont: { category: "Dış Giyim", subcategory: "Mont" },
  montlar: { category: "Dış Giyim", subcategory: "Mont" },
  palto: { category: "Dış Giyim", subcategory: "Palto | Trençkot" },
  trenckot: { category: "Dış Giyim", subcategory: "Palto | Trençkot" },
  trenc: { category: "Dış Giyim", subcategory: "Palto | Trençkot" },
  bomber: { category: "Dış Giyim", subcategory: "Bomber" },
  sets: { category: "Takımlar", subcategory: "" },
  set: { category: "Takımlar", subcategory: "" },
  takimlar: { category: "Takımlar", subcategory: "" },
  takim: { category: "Takımlar", subcategory: "Alt Üst Takım" },
  "kombin-seti": { category: "Takımlar", subcategory: "" },
  "esofman-takimi": { category: "Takımlar", subcategory: "Eşofman Takımı" },
  "alt-ust-takim": { category: "Takımlar", subcategory: "Alt Üst Takım" },
  "takim-elbise": { category: "Takımlar", subcategory: "Takım Elbise" },
  "sort-takim": { category: "Takımlar", subcategory: "Şort Takım" },
  "kapsul-set": { category: "Takımlar", subcategory: "Kapsül Set" },
  swimwear: { category: "Plaj Giyim", subcategory: "" },
  swimsuit: { category: "Plaj Giyim", subcategory: "Mayo" },
  mayo: { category: "Plaj Giyim", subcategory: "Mayo" },
  bikini: { category: "Plaj Giyim", subcategory: "Bikini Üst" },
  "bikini-top": { category: "Plaj Giyim", subcategory: "Bikini Üst" },
  "bikini-bottom": { category: "Plaj Giyim", subcategory: "Bikini Alt" },
  swimshort: { category: "Plaj Giyim", subcategory: "Deniz Şortu" },
  "swim-short": { category: "Plaj Giyim", subcategory: "Deniz Şortu" },
  "deniz-sortu": { category: "Plaj Giyim", subcategory: "Deniz Şortu" },
  "plaj-ustu": { category: "Plaj Giyim", subcategory: "Plaj Üstü" },
  underwear: { category: "İç Giyim", subcategory: "" },
  "ic-giyim": { category: "İç Giyim", subcategory: "" },
  bra: { category: "İç Giyim", subcategory: "Sütyen" },
  bras: { category: "İç Giyim", subcategory: "Sütyen" },
  sutyen: { category: "İç Giyim", subcategory: "Sütyen" },
  panty: { category: "İç Giyim", subcategory: "Külot" },
  panties: { category: "İç Giyim", subcategory: "Külot" },
  kulot: { category: "İç Giyim", subcategory: "Külot" },
  bralet: { category: "İç Giyim", subcategory: "Bralet" },
  bustiyer: { category: "İç Giyim", subcategory: "Büstiyer" },
  jartiyer: { category: "İç Giyim", subcategory: "Jartiyer" },
  babydoll: { category: "İç Giyim", subcategory: "Babydoll & Bodysuit" },
  bodysuit: { category: "İç Giyim", subcategory: "Babydoll & Bodysuit" },
  korse: { category: "İç Giyim", subcategory: "Korse" },
  kombinezon: { category: "İç Giyim", subcategory: "Kombinezon & Jüpon" },
  jupon: { category: "İç Giyim", subcategory: "Kombinezon & Jüpon" },
  atlet: { category: "İç Giyim", subcategory: "Atlet & Body" },
  body: { category: "İç Giyim", subcategory: "Atlet & Body" },
  accessories: { category: "Aksesuar", subcategory: "" },
  accessory: { category: "Aksesuar", subcategory: "Aksesuar" },
  aksesuar: { category: "Aksesuar", subcategory: "Aksesuar" },
  bag: { category: "Aksesuar", subcategory: "Çanta" },
  bags: { category: "Aksesuar", subcategory: "Çanta" },
  canta: { category: "Aksesuar", subcategory: "Çanta" },
  wallet: { category: "Aksesuar", subcategory: "Cüzdan" },
  wallets: { category: "Aksesuar", subcategory: "Cüzdan" },
  cuzdan: { category: "Aksesuar", subcategory: "Cüzdan" },
  "card-holder": { category: "Aksesuar", subcategory: "Cüzdan" },
  cap: { category: "Aksesuar", subcategory: "Şapka" },
  hat: { category: "Aksesuar", subcategory: "Şapka" },
  hats: { category: "Aksesuar", subcategory: "Şapka" },
  sapka: { category: "Aksesuar", subcategory: "Şapka" },
  sal: { category: "Aksesuar", subcategory: "Şal | Fular" },
  fular: { category: "Aksesuar", subcategory: "Şal | Fular" },
  esarp: { category: "Aksesuar", subcategory: "Şal | Fular" },
  fragrance: { category: "Aksesuar", subcategory: "Parfüm" },
  perfume: { category: "Aksesuar", subcategory: "Parfüm" },
  parfum: { category: "Aksesuar", subcategory: "Parfüm" },
  belt: { category: "Aksesuar", subcategory: "Kemer" },
  kemer: { category: "Aksesuar", subcategory: "Kemer" },
  jewelry: { category: "Aksesuar", subcategory: "Takı" },
  taki: { category: "Aksesuar", subcategory: "Takı" },
  kolye: { category: "Aksesuar", subcategory: "Kolye" },
  bileklik: { category: "Aksesuar", subcategory: "Bileklik" },
  kupe: { category: "Aksesuar", subcategory: "Küpe" },
  yuzuk: { category: "Aksesuar", subcategory: "Yüzük" },
  glasses: { category: "Aksesuar", subcategory: "Gözlük" },
  sunglasses: { category: "Aksesuar", subcategory: "Gözlük" },
  gozluk: { category: "Aksesuar", subcategory: "Gözlük" }
};

const CLEAN_CATEGORY_PATHS = {
  "Kadın": "kadin",
  "Takımlar": "takimlar",
  "Üst Giyim": "ust-giyim",
  "Alt Giyim": "alt-giyim",
  "Dış Giyim": "dis-giyim",
  "Plaj Giyim": "plaj-giyim",
  "İç Giyim": "ic-giyim",
  "Aksesuar": "aksesuar"
};

const CLEAN_SUBCATEGORY_PATHS = {
  Kaban: "kabanlar",
  Mont: "montlar",
  Bomber: "bomber",
  Ceket: "ceketler",
  Gömlek: "gomlekler",
  Bluz: "bluzlar",
  Yelek: "yelekler",
  Kapüşonlu: "kapusonlu",
  "T-Shirt": "tisortler",
  Tunik: "tunikler",
  Pantolon: "pantolonlar",
  "Kargo Pantolon": "kargo-pantolon",
  Tayt: "taytlar",
  "Tulum | Salopet": "tulumlar",
  "Eşofman Takımı": "esofman-takimi",
  "Takım Elbise": "takim-elbise",
  Sütyen: "sutyen",
  Külot: "kulot",
  Çanta: "canta",
  Şapka: "sapka",
  "Şal | Fular": "sal-fular",
  Kolye: "kolye",
  Bileklik: "bileklik",
  Küpe: "kupe",
  Yüzük: "yuzuk"
};

const CLIENT_STATIC_FALLBACK_ROUTES = {
  "/magaza": "/products.html",
  "/shop": "/products.html",
  "/koleksiyon": "/collection.html",
  "/nexframe-merch": "/collection.html?collection=nexframe-merch",
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

const DYNAMIC_SHELF_MODES = {
  manual: "Manuel ürün seçimi",
  newest: "Yeni gelenler",
  featured: "Öne çıkan ürünler",
  lowStock: "Limitli stok",
  category: "Kategori seçimi",
  sale: "İndirimli ürünler"
};

const DEFAULT_DYNAMIC_SHELVES = [
  { id: "new-arrivals", title: "Yeni gelenler", mode: "newest", limit: 4, sortOrder: 10 },
  { id: "best-sellers", title: "Çok satanlar", mode: "featured", limit: 4, sortOrder: 20 },
  { id: "limited-stock", title: "Limitli stok", mode: "lowStock", limit: 4, sortOrder: 30 }
];

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

const HOME_SECTION_LABELS = HOME_SECTION_DEFS.reduce((labels, section) => {
  labels[section.id] = section.label;
  return labels;
}, {});

const NEXFRAME_COLLECTION_SLUG = "nexframe-merch";
const NEXFRAME_COLLECTION_PATH = "/nexframe-merch";
const NEXFRAME_LOGO = "assets/nexframe-ai-logo.jpeg";
const NEXFRAME_COLLECTION_COPY = {
  title: "NexFrame Merch",
  badge: "Kilitli Koleksiyon",
  status: "Çok Yakında",
  cardDescription: "Resmî NexFrame merch ürünleri THREON tarafından üretilecek ve satışa sunulacak.",
  intro: "NexFrame Merch koleksiyonu çok yakında THREON’da.",
  notice: "Bu koleksiyon henüz satışa açılmadı. NexFrame Merch ürünleri çok yakında THREON’da satışa sunulacak.",
  productDescription:
    "Bu ürün, yakında satışa sunulacak resmî NexFrame Merch koleksiyonunun bir parçasıdır. Üretim ve satış THREON tarafından yapılacaktır.",
  productCardDescription: "Bu ürün, yakında satışa sunulacak NexFrame Merch koleksiyonunun bir parçasıdır.",
  unavailable: "Bu ürün henüz satışa açık değil."
};
const NEXFRAME_PRODUCTS = [
  { id: "nexframe-oversize-hoodie", slug: "nexframe-oversize-hoodie", name: "NexFrame Oversize Hoodie", placeholderType: "Kapüşonlu" },
  { id: "nexframe-klasik-tisort", slug: "nexframe-klasik-tisort", name: "NexFrame Klasik Tişört", placeholderType: "Tişört" },
  { id: "nexframe-tech-sapka", slug: "nexframe-tech-sapka", name: "NexFrame Tech Şapka", placeholderType: "Şapka" },
  { id: "nexframe-minimal-sweatshirt", slug: "nexframe-minimal-sweatshirt", name: "NexFrame Minimal Sweatshirt", placeholderType: "Sweatshirt" },
  { id: "nexframe-logo-tote-canta", slug: "nexframe-logo-tote-canta", name: "NexFrame Logo Tote Çanta", placeholderType: "Tote Çanta" },
  { id: "nexframe-sticker-paketi", slug: "nexframe-sticker-paketi", name: "NexFrame Sticker Paketi", placeholderType: "Sticker Paketi" }
].map((product, index) => ({
  ...product,
  collection: NEXFRAME_COLLECTION_COPY.title,
  category: NEXFRAME_COLLECTION_COPY.title,
  subcategory: "Yakında Satışta",
  status: "çok-yakında",
  locked: true,
  purchasable: false,
  priceLabel: NEXFRAME_COLLECTION_COPY.status,
  badge: NEXFRAME_COLLECTION_COPY.status,
  summary: NEXFRAME_COLLECTION_COPY.productCardDescription,
  description: NEXFRAME_COLLECTION_COPY.productDescription,
  sortOrder: index + 1
}));

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function categoryKeys() {
  return Object.keys(CATEGORY_TREE);
}

function allSubcategories(category = "") {
  if (category && CATEGORY_TREE[category]) return CATEGORY_TREE[category];
  if (category) return [];
  return [...new Set(categoryKeys().flatMap((key) => CATEGORY_TREE[key]))];
}

function categoryFromSubcategory(subcategory = "") {
  const normalized = slugify(subcategory);
  return categoryKeys().find((category) => CATEGORY_TREE[category].some((item) => slugify(item) === normalized)) || "";
}

function categoryRoute(value = "") {
  const requested = String(value || "").trim();
  if (!requested) return { category: "", subcategory: "" };
  const normalized = slugify(requested);
  const directCategory = categoryKeys().find((category) => slugify(category) === normalized);
  if (directCategory) return { category: directCategory, subcategory: "" };
  const directSubcategory = allSubcategories().find((subcategory) => slugify(subcategory) === normalized);
  if (directSubcategory) return { category: categoryFromSubcategory(directSubcategory), subcategory: directSubcategory };
  return CATEGORY_ROUTE_ALIASES[normalized] || { category: "", subcategory: "" };
}

function categoryAlias(value, categories = categoryKeys()) {
  const route = categoryRoute(value);
  if (!route.category) return "";
  return categories.includes(route.category) || categoryKeys().includes(route.category) ? route.category : "";
}

function subcategoryAlias(value, category = "") {
  const requested = String(value || "").trim();
  if (!requested) return "";
  const options = allSubcategories(category);
  const normalized = slugify(requested);
  const direct = options.find((subcategory) => slugify(subcategory) === normalized);
  if (direct) return direct;
  const route = categoryRoute(requested);
  if (!route.subcategory) return "";
  if (!category || route.category === category || options.includes(route.subcategory)) return route.subcategory;
  return "";
}

function productMainCategory(product = {}) {
  if (inferInnerwearSubcategory(product) || slugify(product.subcategory) === "boxer") return "İç Giyim";
  return categoryAlias(product.category) || String(product.category || "").trim();
}

function inferInnerwearSubcategory(product = {}) {
  const text = String(product.name || "").toLocaleLowerCase("tr-TR");
  if (/jartiyer/.test(text)) return "Jartiyer";
  if (/kombinezon|jüpon|jupon/.test(text)) return "Kombinezon & Jüpon";
  if (/babydoll|bodysuit/.test(text)) return "Babydoll & Bodysuit";
  if (/büstiyer|bustiyer/.test(text)) return "Büstiyer";
  if (/bralet/.test(text)) return "Bralet";
  if (/korse/.test(text)) return "Korse";
  if (/boxer|boyshort/.test(text)) return "Boxer";
  if (/külot|kulot|brazilian|hipster|slip|string|tanga/.test(text)) return "Külot";
  if (/atlet|body/.test(text)) return "Atlet & Body";
  if (/sütyen|sutyen|bra\b|toparlayıcı|destekli|balensiz|balenli|push up|push-up|üçgen/.test(text)) return "Sütyen";
  return "";
}

function inferBottomSubcategory(product = {}) {
  const text = [product.name, product.slug, product.summary, product.description]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  if (/eşofman\s*altı|esofman\s*alti|track\s*-?pant|trackpant|jogger/.test(text)) return "Eşofman Altı";
  return "";
}

function productSubcategory(product = {}) {
  const mainCategory = productMainCategory(product);
  const inferredInnerwear = mainCategory === "İç Giyim" ? inferInnerwearSubcategory(product) : "";
  if (inferredInnerwear) return inferredInnerwear;
  const inferredBottom = mainCategory === "Alt Giyim" ? inferBottomSubcategory(product) : "";
  if (inferredBottom) return inferredBottom;
  const explicit = subcategoryAlias(product.subcategory, mainCategory) || String(product.subcategory || "").trim();
  if (explicit) return explicit;
  const fromCategory = categoryRoute(product.category).subcategory;
  if (fromCategory) return fromCategory;
  return subcategoryAlias(product.collection, mainCategory);
}

function normalizedGenderSections(product = {}) {
  return Array.isArray(product.genderSections)
    ? [...new Set(product.genderSections.map((item) => String(item || "").trim()).filter(Boolean))]
    : [];
}

function productWomenSubcategories(product = {}) {
  const sections = new Set();
  const mainCategory = productMainCategory(product);
  const subcategory = productSubcategory(product);
  const genderSections = normalizedGenderSections(product);
  const text = [product.name, product.slug, product.summary, product.description, ...(product.features || []), ...(product.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");

  if (mainCategory && mainCategory !== "Kadın") sections.add(mainCategory);
  if (["Elbise", "Etek", "Tulum | Salopet"].includes(subcategory) || /elbise|etek|tulum|salopet/.test(text)) {
    sections.add("Elbise & Etek");
  }
  if (genderSections.includes("Unisex") || /\bunisex\b/.test(text)) sections.add("Unisex");
  if (product.featured) sections.add("Yeni Gelenler");

  return [...sections].filter((section) => CATEGORY_TREE["Kadın"].includes(section));
}

function productIsInWomenSection(product = {}) {
  const mainCategory = productMainCategory(product);
  const genderSections = normalizedGenderSections(product);
  return mainCategory === "Kadın" || genderSections.includes("Kadın") || genderSections.includes("Unisex");
}

function normalizeGenderFilter(value = "all") {
  const requested = String(value || "all").trim().toLocaleLowerCase("tr-TR");
  const match = GENDER_FILTER_OPTIONS.find(([key, label]) => {
    const normalizedKey = key.toLocaleLowerCase("tr-TR");
    const normalizedLabel = label.toLocaleLowerCase("tr-TR");
    return requested === normalizedKey || requested === normalizedLabel || slugify(requested) === slugify(key) || slugify(requested) === slugify(label);
  });
  return match ? match[0] : "all";
}

function productMatchesGender(product = {}, gender = "all") {
  const filter = normalizeGenderFilter(gender);
  if (filter === "all") return true;
  const sections = normalizedGenderSections(product);
  if (filter === "Unisex") return sections.includes("Unisex");
  if (filter === "Kadın") return sections.includes("Kadın") || sections.includes("Unisex") || productMainCategory(product) === "Kadın";
  if (filter === "Erkek") return sections.includes("Erkek") || sections.includes("Unisex");
  return true;
}

function genderFilterLabel(gender = "all") {
  return GENDER_FILTER_OPTIONS.find(([key]) => key === normalizeGenderFilter(gender))?.[1] || "Tüm cinsiyetler";
}

function categoryDisplay(product = {}) {
  const mainCategory = productMainCategory(product);
  const subcategory = productSubcategory(product);
  return [mainCategory, subcategory].filter(Boolean).join(" / ") || "THREON";
}

function routeFromCleanPath() {
  const segments = location.pathname
    .split("/")
    .map((part) => decodeURIComponent(part).trim())
    .filter(Boolean);
  const last = segments[segments.length - 1] || "";
  if (!last || /\.[a-z0-9]+$/i.test(last) || last === "urun") return { category: "", subcategory: "" };
  if (segments[0] === "urun") return { category: "", subcategory: "" };
  return categoryRoute(last);
}

function collectionFallbackUrl(category = "", subcategory = "") {
  const params = new URLSearchParams();
  if (category && category !== "all") params.set("category", category);
  if (subcategory && subcategory !== "all") params.set("subcategory", subcategory);
  const query = params.toString();
  return query ? `/collection.html?${query}` : "/collection.html";
}

function redirectFallbackCleanRoute() {
  if (location.protocol === "file:" || document.body?.dataset.page !== "home") return;
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  if (!pathname || pathname === "/" || pathname.endsWith(".html")) return;
  const productMatch = pathname.match(/^\/urun\/([^/]+)$/);
  if (productMatch) {
    location.replace(`/product.html?slug=${encodeURIComponent(decodeURIComponent(productMatch[1]))}`);
    return;
  }
  if (CLIENT_STATIC_FALLBACK_ROUTES[pathname]) {
    location.replace(CLIENT_STATIC_FALLBACK_ROUTES[pathname]);
    return;
  }
  const route = routeFromCleanPath();
  if (!route.category && !route.subcategory) return;
  location.replace(collectionFallbackUrl(route.category, route.subcategory));
}

function categoryUrl(category = "", subcategory = "") {
  if (!category || category === "all") return "/koleksiyon";
  if (category === "Kadın" && subcategory && subcategory !== "all") {
    return `/kadin-${slugify(subcategory)}`;
  }
  if (subcategory && subcategory !== "all") {
    return `/${CLEAN_SUBCATEGORY_PATHS[subcategory] || slugify(subcategory)}`;
  }
  return `/${CLEAN_CATEGORY_PATHS[category] || slugify(category)}`;
}

function productMatchesCategory(product, category = "all", subcategory = "all") {
  if (category === "Kadın") {
    const womenMatch = productIsInWomenSection(product);
    const subcategoryMatch = subcategory === "all" || productWomenSubcategories(product).includes(subcategory);
    return womenMatch && subcategoryMatch;
  }
  const mainCategory = productMainCategory(product);
  const productSub = productSubcategory(product);
  const categoryMatch = category === "all" || mainCategory === category;
  const subcategoryMatch = subcategory === "all" || productSub === subcategory;
  return categoryMatch && subcategoryMatch;
}

function normalizePhoneInput(value) {
  const raw = String(value || "").trim();
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0090")) digits = digits.slice(4);
  if (digits.startsWith("90")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.startsWith("5")) return `+90${digits.slice(0, 10)}`;
  return raw.replace(/[\s().-]/g, "");
}

function formatTurkishMobileDisplay(value) {
  const normalized = normalizePhoneInput(value);
  if (/^\+905\d{0,9}$/.test(normalized)) {
    return `${TURKISH_MOBILE_INPUT_PREFIX}${normalized.slice(4)}`;
  }
  return TURKISH_MOBILE_INPUT_PREFIX;
}

function setupTurkishPhoneInputs(root = document) {
  qsa('input[name="phone"]', root).forEach((input) => {
    if (input.dataset.trPhoneReady) return;
    input.dataset.trPhoneReady = "true";
    input.placeholder = "+90 5XXXXXXXXX";
    input.maxLength = 14;
    input.pattern = "^\\+90 5[0-9]{9}$";
    input.addEventListener("focus", () => {
      if (!input.value.trim()) input.value = TURKISH_MOBILE_INPUT_PREFIX;
    });
    input.addEventListener("input", () => {
      input.value = formatTurkishMobileDisplay(input.value);
      if (document.activeElement === input) {
        requestAnimationFrame(() => {
          try {
            input.setSelectionRange(input.value.length, input.value.length);
          } catch {}
        });
      }
    });
    if (!input.value.trim()) {
      input.value = TURKISH_MOBILE_INPUT_PREFIX;
    } else {
      input.value = formatTurkishMobileDisplay(input.value);
    }
  });
}

function isValidEmailAddress(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) return false;
  const blocked = ["example.com", "test.com", "fake.com", "mailinator.com", "10minutemail.com", "tempmail.com", "yopmail.com"];
  const suspiciousLocal = /^(test|fake|asdf|qwerty|abc|demo|deneme|ornek|örnek|mail|email|user|kullanici)\d*$/i;
  const domain = email.split("@").pop();
  const local = email.split("@")[0] || "";
  const domainRoot = String(domain || "").split(".")[0] || "";
  return Boolean(
    domain &&
      !blocked.includes(domain) &&
      !/(^|\.)invalid$|localhost|\.local$/i.test(domain) &&
      !suspiciousLocal.test(local) &&
      !/^(test|fake|demo|example|mail|email)$/i.test(domainRoot)
  );
}

function isValidTurkishMobileInput(value) {
  return /^\+905\d{9}$/.test(normalizePhoneInput(value));
}

function formatPrice(product) {
  const raw = product?.price ?? product;
  const amount =
    typeof raw === "number"
      ? raw
      : Number(
          String(raw || "")
            .replace(/[^\d,.-]/g, "")
            .replace(/\.(?=\d{3}(?:\D|$))/g, "")
            .replace(",", ".")
        );
  const currency = product?.currency || "TRY";
  if (!Number.isFinite(amount)) {
    return escapeHtml(product?.price || "");
  }
  if (currency === "TRY") {
    return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} TL`;
  }
  try {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("tr-TR")} ${escapeHtml(currency)}`;
  }
}

function readStoredCustomer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.customer);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCustomerSession(token, customer) {
  state.customerToken = token || "";
  state.customer = customer || null;
  if (token) {
    localStorage.setItem(STORAGE_KEYS.customerToken, token);
  } else {
    localStorage.removeItem(STORAGE_KEYS.customerToken);
  }
  if (customer) {
    localStorage.setItem(STORAGE_KEYS.customer, JSON.stringify(customer));
  } else {
    localStorage.removeItem(STORAGE_KEYS.customer);
  }
  renderCustomerIndicators();
}

function customerHeaders() {
  return state.customerToken ? { Authorization: `Bearer ${state.customerToken}` } : {};
}

async function customerApi(url, options = {}) {
  return fetchJson(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...customerHeaders()
    }
  });
}

function renderCustomerIndicators() {
  const customer = state.customer || readStoredCustomer();
  qsa("[data-customer-label]").forEach((node) => {
    node.textContent = customer ? customer.name.split(" ")[0] : "Hesabım";
  });
  qsa("[data-account-link]").forEach((node) => {
    node.classList.toggle("is-authenticated", Boolean(customer));
  });
}

function setupMainMenu() {
  const nav = qs("[data-nav]");
  if (!nav) return;
  const categorySections = categoryKeys()
    .map((category, index) => {
      const subcategoryLinks = CATEGORY_TREE[category]
        .map(
          (subcategory) =>
            `<a href="${categoryUrl(category, subcategory)}"><span>${escapeHtml(subcategory)}</span></a>`
        )
        .join("");
      return `
        <details class="nav-category">
          <summary>
            <span>${escapeHtml(category)}</span>
            <small>${String(index + 1).padStart(2, "0")}</small>
            <i aria-hidden="true"></i>
          </summary>
          <div class="nav-subcategory-links">
            <a href="${categoryUrl(category)}"><span>Tüm ${escapeHtml(category)}</span></a>
            ${subcategoryLinks}
          </div>
        </details>
      `;
    })
    .join("");
  nav.innerHTML = `
    <div class="nav-drawer-head">
      <span>THREON</span>
      <strong>Premium giyim mağazası</strong>
      <p>Limitli kapsüller, temiz siluetler ve üyeye özel sipariş takibi.</p>
    </div>
    <div class="nav-drawer-grid">
      <a href="/magaza"><span>Tüm ürünler</span><em>Yeni sezon</em></a>
      <a href="/koleksiyon"><span>Koleksiyon</span><em>Kapsül görünüm</em></a>
      <a href="${NEXFRAME_COLLECTION_PATH}"><span>NexFrame Merch</span><em>Çok Yakında</em></a>
    </div>
    <span class="menu-section-label">Kategoriye göre alışveriş</span>
    <div class="nav-category-list">${categorySections}</div>
    <span class="menu-section-label">Keşfet</span>
    <a href="${NEXFRAME_COLLECTION_PATH}">NexFrame Merch</a>
    <a href="lookbook.html">Lookbook</a>
    <a href="/urun/three-gift-card">THREE GIFT CARD</a>
    <a href="/marka-hikayesi">Marka hikayesi</a>
    <span class="menu-section-label">Hesap</span>
    <a href="account.html" data-account-link><span data-customer-label>Hesabım</span></a>
    <a href="checkout.html">Ödeme</a>
    <a href="account.html#orders">Sipariş geçmişi</a>
    <a href="contact.html">Müşteri desteği</a>
    <a class="nav-cta" href="admin.html">Yönetim paneli</a>
    <div class="nav-drawer-promo">
      <img src="assets/product-bomber.png" alt="THREON dış giyim kapsülü" />
      <div>
        <span>Sezon seçkisi</span>
        <strong>Dış giyim kapsülü</strong>
        <a href="${categoryUrl("Dış Giyim")}">Drop'u keşfet</a>
      </div>
    </div>
  `;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = {};
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(response.ok ? "API JSON verisi dönmedi." : "Sunucu yanıtı okunamadı.");
    }
  }
  if (!response.ok) {
    throw new Error(data.error || "İşlem tamamlanamadı.");
  }
  return data;
}

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function publicSiteData(data) {
  return {
    settings: data.settings || {},
    products: (data.products || [])
      .filter((product) => product.status === "active")
      .map((product, index) => ({ product, index, score: productMerchandisingScore(product) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ product }) => product)
      .map(publicProductSummary)
  };
}

function compactText(value = "", maxLength = 500) {
  const text = cleanProductText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function cleanProductText(value = "") {
  return String(value || "")
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
    `${categoryDisplay(product)} seçkisinden premium kalıp, temiz siluet ve günlük kullanıma uygun THREON parçası.`
  );
}

function productDescriptionText(product = {}) {
  return (
    compactText(product.description || product.summary || "", 420) ||
    `${product.name || "Bu ürün"}; kapsül gardıroba uyum sağlayan, kolay kombinlenen ve THREON'un sade premium çizgisini taşıyan bir parçadır. Beden, renk ve stok seçeneklerini ürün panelinden kontrol edebilirsin.`
  );
}

function cleanDetailText(value = "", maxLength = 220) {
  return compactText(
    String(value || "")
      .replace(/^&\s*BAKIM\s*/i, "")
      .replace(/^YIKAMA\s*(?:\||&)\s*BAKIM\s*/i, "")
      .replace(/^MATERYAL\s*/i, "")
      .replace(/^MANKEN\s*/i, ""),
    maxLength
  );
}

function splitProductSentences(value = "") {
  return cleanProductText(value)
    .split(/\.\s+|\.\s*$/)
    .map((item) => cleanDetailText(item.replace(/\.$/, ""), 180))
    .filter((item) => item && item.length > 3);
}

function productFeatureItems(product = {}) {
  const importNoise = /kaynak|aktarıldı|aktarildi|stoklu varyant|varyant ve stok|ürün açıklamasından|urun aciklamasindan|admin panel/i;
  const sentenceFeatures = splitProductSentences(product.description || product.summary || "").slice(0, 7);
  const explicitFeatures = (product.features || [])
    .map((item) => cleanDetailText(item, 180))
    .filter((item) => item && !importNoise.test(item) && !/^\w+\s+\/\s+/.test(item));
  const fit = cleanDetailText(product.fit, 120);
  const material = cleanDetailText(product.material, 140);
  const items = [...sentenceFeatures, ...explicitFeatures, fit, material]
    .map((item) => item.replace(/\s+\.$/, ".").trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, 8);
}

function productMaterialText(product = {}) {
  return cleanDetailText(product.material || product.specs?.["Malzeme Materyeli"] || product.specs?.Kumaş || "", 180);
}

function productCareText(product = {}) {
  return cleanDetailText(product.care || product.specs?.["Yıkama Talimatı"] || "", 180);
}

function productMerchandisingScore(product = {}) {
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
  if (productAvailableStock(product) > 0) score += 28;
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
    imageFit: normalizeImageFit(product.imageFit || "cover"),
    imagePosition: normalizeImagePosition(product.imagePosition || "center center"),
    imageRatio: normalizeImageRatio(product.imageRatio || "portrait"),
    collection: product.collection,
    fit: product.fit,
    summary: productSummaryText(product),
    sizes: Array.isArray(product.sizes) ? product.sizes : [],
    colors: Array.isArray(product.colors) ? product.colors : [],
    genderSections: normalizedGenderSections(product),
    merchandisingScore: productMerchandisingScore(product)
  };
}

function readStoredSiteData(maxAge = Infinity) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.siteData);
    if (!raw) return null;
    if (!raw.includes(`"cacheVersion":"${SITE_DATA_CACHE_VERSION}"`)) {
      localStorage.removeItem(STORAGE_KEYS.siteData);
      return null;
    }
    const data = JSON.parse(raw);
    if (maxAge !== Infinity && Date.now() - Number(data.cachedAt || 0) > maxAge) return null;
    return Array.isArray(data.products) ? data : null;
  } catch {
    return null;
  }
}

function saveStoredSiteData(data) {
  const next = {
    cacheVersion: SITE_DATA_CACHE_VERSION,
    cachedAt: Date.now(),
    settings: data.settings || {},
    products: Array.isArray(data.products) ? data.products.map(publicProductSummary) : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    orders: Array.isArray(data.orders) ? data.orders : []
  };
  try {
    localStorage.setItem(STORAGE_KEYS.siteData, JSON.stringify(next));
  } catch {
    try {
      localStorage.removeItem(STORAGE_KEYS.siteData);
    } catch {
      // Storage may be unavailable or full; live API/static data still keeps the site working.
    }
  }
  return next;
}

async function loadStaticSiteData() {
  const data = await fetchJson(`data/site-data.json?v=${Date.now()}`);
  if (!Array.isArray(data.products)) {
    throw new Error("Ürün verisi okunamadı.");
  }
  return data;
}

async function loadFallbackSiteData() {
  try {
    return await loadStaticSiteData();
  } catch (error) {
    const stored = readStoredSiteData();
    if (stored) return cloneData(stored);
    throw error;
  }
}

function mergeProductDetail(product = {}) {
  if (!product.id) return product;
  state.productDetails[product.id] = product;
  if (product.slug) state.productDetails[product.slug] = product;
  if (state.site?.products) {
    const index = state.site.products.findIndex((item) => item.id === product.id || item.slug === product.slug);
    if (index >= 0) state.site.products[index] = { ...state.site.products[index], ...product };
    else state.site.products.unshift(publicProductSummary(product));
  }
  return product;
}

async function fetchProductDetail(key = "") {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) throw new Error("Ürün anahtarı bulunamadı.");
  const lockedProduct = nexFrameProductByKey(normalizedKey);
  if (lockedProduct) {
    state.productDetails[lockedProduct.id] = lockedProduct;
    state.productDetails[lockedProduct.slug] = lockedProduct;
    return {
      settings: state.site?.settings || {},
      product: lockedProduct,
      related: NEXFRAME_PRODUCTS.filter((product) => product.id !== lockedProduct.id)
    };
  }
  if (state.productDetails[normalizedKey]) {
    return { product: state.productDetails[normalizedKey], related: [] };
  }
  try {
    const data = await fetchJson(`/api/products/${encodeURIComponent(normalizedKey)}`);
    if (!data?.product) throw new Error("Ürün verisi dönmedi.");
    mergeProductDetail(data.product);
    return {
      settings: data.settings || {},
      product: data.product,
      related: Array.isArray(data.related) ? data.related : []
    };
  } catch (error) {
    const data = await loadStaticSiteData();
    const product = (data.products || []).find((item) => item.id === normalizedKey || item.slug === normalizedKey);
    if (!product || product.status !== "active") throw error;
    mergeProductDetail({ ...product, reviews: (product.reviews || []).filter((review) => review.status === "approved") });
    const related = (data.products || [])
      .filter((item) => item.status === "active" && item.id !== product.id)
      .filter((item) => item.category === product.category || item.subcategory === product.subcategory || item.featured)
      .slice(0, 12)
      .map(publicProductSummary);
    return { settings: data.settings || {}, product: state.productDetails[product.id], related };
  }
}

function looksLikeOfflineApiError(error) {
  return /Failed to fetch|NetworkError|Load failed|API JSON|Sunucu yanıtı|İşlem tamamlanamadı|Islem tamamlanamadi/i.test(
    String(error?.message || error || "")
  );
}

function fileProtocolMessage() {
  return "Ürün ve admin verileri için yerel sunucu gerekir. THREON Baslat.command dosyasını aç veya http://localhost:4174/ adresini kullan.";
}

function fetchSite() {
  if (!state.sitePromise) {
    if (location.protocol === "file:") {
      const cached = readStoredSiteData();
      if (cached) {
        state.site = cached;
        renderCart();
        renderWishlist();
        renderCompareDrawer();
        state.sitePromise = Promise.resolve(cached);
        return state.sitePromise;
      }
      state.sitePromise = Promise.reject(new Error(fileProtocolMessage()));
      return state.sitePromise;
    }

    const cached = readStoredSiteData(SITE_DATA_CACHE_TTL);
    if (cached) {
      state.site = cached;
      renderCart();
      renderWishlist();
      renderCompareDrawer();
      state.sitePromise = Promise.resolve(cached);
      fetchJson("/api/site")
        .then((data) => {
          if (!Array.isArray(data.products)) return;
          const stored = saveStoredSiteData(data);
          state.site = stored;
          renderCart();
          renderWishlist();
          renderCompareDrawer();
        })
        .catch(() => {});
      return state.sitePromise;
    }

    state.sitePromise = fetchJson("/api/site")
      .then((data) => {
        if (!Array.isArray(data.products)) {
          throw new Error("API ürün verisi dönmedi.");
        }
        state.site = saveStoredSiteData(data);
        renderCart();
        renderWishlist();
        renderCompareDrawer();
        return state.site;
      })
      .catch(async () => {
        const fallback = publicSiteData(await loadFallbackSiteData());
        state.site = fallback;
        renderCart();
        renderWishlist();
        renderCompareDrawer();
        return fallback;
      });
  }
  return state.sitePromise;
}

function productUrl(product) {
  return `/urun/${encodeURIComponent(product.slug || product.id)}`;
}

function lockIconSvg(className = "lock-icon") {
  return `
    <svg class="${escapeHtml(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7.25 10.2V8.15A4.75 4.75 0 0 1 12 3.4a4.75 4.75 0 0 1 4.75 4.75v2.05"></path>
      <rect x="5.35" y="10.2" width="13.3" height="10.4" rx="2.15"></rect>
      <path d="M12 14.25v2.25"></path>
    </svg>
  `;
}

function nexFrameProductByKey(key = "") {
  const query = String(key || "").trim().toLowerCase();
  if (!query) return null;
  return (
    NEXFRAME_PRODUCTS.find((product) => product.id.toLowerCase() === query || product.slug.toLowerCase() === query) ||
    NEXFRAME_PRODUCTS.find((product) => product.name.toLowerCase() === query) ||
    null
  );
}

function isNexFrameProduct(product = {}) {
  return Boolean(product?.locked || product?.purchasable === false || nexFrameProductByKey(product?.id) || nexFrameProductByKey(product?.slug));
}

function isNexFrameCollectionRequest() {
  const params = new URLSearchParams(location.search);
  const collection = String(params.get("collection") || "").toLowerCase();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  return collection === NEXFRAME_COLLECTION_SLUG || pathname === NEXFRAME_COLLECTION_PATH;
}

function normalizeImageFit(value = "cover") {
  return IMAGE_FITS[value] ? value : "cover";
}

function normalizeImageRatio(value = "portrait") {
  return IMAGE_RATIOS[value] ? value : "portrait";
}

function normalizeImagePosition(value = "center center") {
  const text = String(value || "center center")
    .replace(/[;"'<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text || "center center";
}

function imageStyle({ fit = "cover", position = "center center", ratio = "" } = {}) {
  const declarations = [
    `object-fit:${normalizeImageFit(fit)}`,
    `object-position:${normalizeImagePosition(position)}`
  ];
  if (ratio) declarations.push(`aspect-ratio:${IMAGE_RATIOS[normalizeImageRatio(ratio)]}`);
  return declarations.join(";");
}

function productImageStyle(product = {}, includeRatio = false) {
  return imageStyle({
    fit: product.imageFit || "cover",
    position: product.imagePosition || "center center",
    ratio: includeRatio ? product.imageRatio || "portrait" : ""
  });
}

function visualImageStyle(block = {}) {
  return imageStyle({
    fit: block.crop || "cover",
    position: block.objectPosition || "center center"
  });
}

function normalizeVisualBlock(input = {}, index = 0) {
  const placement = VISUAL_PLACEMENTS[input.placement] ? input.placement : "home-after-hero";
  const theme = VISUAL_THEMES[input.theme] ? input.theme : "editorial";
  const shape = VISUAL_SHAPES[input.shape] ? input.shape : "square";
  const title = String(input.title || "").trim();
  const image = String(input.image || "").trim();
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : index + 10;
  const idSeed = slugify(`${placement}-${title || image || index}`) || makeLocalId();
  return {
    id: String(input.id || idSeed),
    placement,
    status: input.status === "draft" ? "draft" : "active",
    title,
    kicker: String(input.kicker || "").trim(),
    subtitle: String(input.subtitle || "").trim(),
    image,
    productSlug: String(input.productSlug || input.productId || "").trim(),
    href: String(input.href || "").trim(),
    cta: String(input.cta || "").trim(),
    theme,
    shape,
    crop: normalizeImageFit(input.crop || "cover"),
    objectPosition: normalizeImagePosition(input.objectPosition || "center center"),
    showText: input.showText === false ? false : true,
    sortOrder
  };
}

function visualBlocks(settings = {}, options = {}) {
  const includeDrafts = Boolean(options.includeDrafts);
  const blocks = Array.isArray(settings.visualBlocks) ? settings.visualBlocks : [];
  return blocks
    .map((block, index) => normalizeVisualBlock(block, index))
    .filter((block) => block.image && (includeDrafts || block.status === "active"))
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.title.localeCompare(b.title, "tr"));
}

function parseShelfProductSlugs(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDynamicShelf(input = {}, index = 0) {
  const mode = DYNAMIC_SHELF_MODES[input.mode] ? input.mode : "manual";
  const title = String(input.title || DYNAMIC_SHELF_MODES[mode] || "Canlı raf").trim();
  const categoryInput = String(input.category || "").trim();
  const category = categoryAlias(categoryInput) || categoryInput;
  const subcategoryInput = String(input.subcategory || "").trim();
  const subcategory = subcategoryAlias(subcategoryInput, category) || subcategoryInput;
  const limit = Math.min(12, Math.max(1, Number.isFinite(Number(input.limit)) ? Number(input.limit) : 4));
  const sortOrder = Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : index + 10;
  const idSeed = slugify(`${title || mode}-${index}`) || makeLocalId();
  return {
    id: String(input.id || idSeed),
    status: input.status === "draft" ? "draft" : "active",
    title,
    label: String(input.label || "").trim(),
    mode,
    productSlugs: parseShelfProductSlugs(input.productSlugs || input.products || input.productSlug),
    category,
    subcategory,
    limit,
    sortOrder
  };
}

function dynamicShelves(settings = {}, options = {}) {
  const includeDrafts = Boolean(options.includeDrafts);
  const source =
    Array.isArray(settings.dynamicShelves) && settings.dynamicShelves.length
      ? settings.dynamicShelves
      : DEFAULT_DYNAMIC_SHELVES;
  return source
    .map((shelf, index) => normalizeDynamicShelf(shelf, index))
    .filter((shelf) => includeDrafts || shelf.status === "active")
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.title.localeCompare(b.title, "tr"));
}

function normalizeHomeSection(input = {}, index = 0) {
  const fallback = HOME_SECTION_DEFS[index] || HOME_SECTION_DEFS[0];
  const id = String(input.id || fallback?.id || "").trim();
  const known = HOME_SECTION_DEFS.find((section) => section.id === id) || fallback || {};
  return {
    id: known.id || id,
    label: String(input.label || known.label || id || "Ana sayfa bloğu").trim(),
    status: input.status === "draft" ? "draft" : "active",
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : known.sortOrder || (index + 1) * 10
  };
}

function homeSections(settings = {}, options = {}) {
  const includeDrafts = Boolean(options.includeDrafts);
  const saved = Array.isArray(settings.homeSections) ? settings.homeSections : [];
  const savedById = new Map(saved.map((section, index) => [String(section.id || "").trim(), normalizeHomeSection(section, index)]));
  return HOME_SECTION_DEFS.map((section, index) => normalizeHomeSection({ ...section, ...(savedById.get(section.id) || {}) }, index))
    .filter((section) => includeDrafts || section.status === "active")
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder) || a.label.localeCompare(b.label, "tr"));
}

function applyHomeSectionOrder(settings = {}) {
  const main = qs(".lofi-storefront");
  if (!main) return;
  const nodes = qsa("[data-home-section]", main);
  if (!nodes.length) return;
  const order = new Map(homeSections(settings, { includeDrafts: true }).map((section, index) => [section.id, { ...section, index }]));
  nodes
    .sort((a, b) => {
      const aMeta = order.get(a.dataset.homeSection) || { sortOrder: 9999, index: 9999 };
      const bMeta = order.get(b.dataset.homeSection) || { sortOrder: 9999, index: 9999 };
      return Number(aMeta.sortOrder) - Number(bMeta.sortOrder) || aMeta.index - bMeta.index;
    })
    .forEach((node) => {
      const section = order.get(node.dataset.homeSection);
      node.hidden = section?.status === "draft";
      main.appendChild(node);
    });
}

function uniqueProducts(products = []) {
  const seen = new Set();
  return products.filter((product) => {
    const key = product?.id || product?.slug;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function productsForDynamicShelf(shelf = {}, products = []) {
  const activeProducts = products.filter((product) => product.status !== "draft");
  const normalizedShelf = normalizeDynamicShelf(shelf);
  let selected = [];
  if (normalizedShelf.mode === "manual") {
    selected = normalizedShelf.productSlugs.map((key) => productByVisualKey(key, activeProducts)).filter(Boolean);
  } else if (normalizedShelf.mode === "newest") {
    selected = [...activeProducts].slice(0, normalizedShelf.limit);
  } else if (normalizedShelf.mode === "featured") {
    selected = activeProducts.filter((product) => product.featured);
  } else if (normalizedShelf.mode === "lowStock") {
    selected = activeProducts
      .filter((product) => productAvailableStock(product) > 0 && productAvailableStock(product) <= 8)
      .sort((a, b) => productAvailableStock(a) - productAvailableStock(b));
  } else if (normalizedShelf.mode === "category") {
    selected = activeProducts.filter((product) =>
      productMatchesCategory(product, normalizedShelf.category || "all", normalizedShelf.subcategory || "all")
    );
  } else if (normalizedShelf.mode === "sale") {
    selected = activeProducts.filter((product) => Number(product.comparePrice) > Number(product.price));
  }
  if (!selected.length && normalizedShelf.productSlugs.length) {
    selected = normalizedShelf.productSlugs.map((key) => productByVisualKey(key, activeProducts)).filter(Boolean);
  }
  if (!selected.length) selected = activeProducts.slice(0, normalizedShelf.limit);
  return uniqueProducts(selected).slice(0, normalizedShelf.limit);
}

function productByVisualKey(key = "", products = state.site?.products || state.admin.data?.products || []) {
  const query = String(key || "").trim();
  if (!query) return null;
  const normalized = query.toLowerCase();
  return (
    products.find((product) => product.slug === query || product.id === query) ||
    products.find((product) => String(product.name || "").toLowerCase() === normalized) ||
    products.find((product) => `${product.name || ""} ${product.slug || ""}`.toLowerCase().includes(normalized)) ||
    null
  );
}

function productColorTokens(product = {}) {
  const text = [product.name, product.slug, ...(product.colors || [])]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr-TR");
  const rules = [
    ["siyah", /siyah|black|antrasit|kömür|komur|füme|fume/],
    ["beyaz", /beyaz|white|ekru|krem|kemik|ivory/],
    ["bej", /bej|beige|taş|tas|kum|vizon|camel|naturel|sahara/],
    ["kahverengi", /kahve|kahverengi|brown|taba|bakır|bakir|acı kahve|aci kahve/],
    ["gri", /gri|gray|grey|melanj|silver|gümüş|gumus/],
    ["lacivert", /lacivert|navy|indigo/],
    ["mavi", /mavi|blue|saks|turkuaz/],
    ["yeşil", /yeşil|yesil|green|haki|nefti|mint|çağla|cagla/],
    ["kırmızı", /kırmızı|kirmizi|red|bordo|burgundy/],
    ["pembe", /pembe|pink|pudra|fuşya|fusya/],
    ["sarı", /sarı|sari|yellow|hardal/],
    ["turuncu", /turuncu|orange|kiremit/],
    ["mor", /mor|purple|lila|lavanta/]
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([token]) => token);
}

function colorAffinityScore(source = {}, candidate = {}) {
  const sourceColors = new Set(productColorTokens(source));
  const candidateColors = new Set(productColorTokens(candidate));
  if (!sourceColors.size || !candidateColors.size) return 0;
  if ([...sourceColors].some((color) => candidateColors.has(color))) return 170;
  const neutral = new Set(["siyah", "beyaz", "bej", "gri", "kahverengi", "lacivert"]);
  if ([...sourceColors].some((color) => neutral.has(color)) && [...candidateColors].some((color) => neutral.has(color))) return 70;
  return 0;
}

function complementaryScore(source = {}, candidate = {}) {
  const sourceCategory = productMainCategory(source);
  const candidateCategory = productMainCategory(candidate);
  const sourceSubcategory = productSubcategory(source);
  const candidateSubcategory = productSubcategory(candidate);
  let score = 0;

  if (sourceCategory === "Alt Giyim") {
    if (candidateCategory === "Dış Giyim") score += 300;
    if (candidateCategory === "Üst Giyim") score += 210;
    if (["Ceket", "Kaban", "Mont", "Bomber", "Palto | Trençkot"].includes(candidateSubcategory)) score += 150;
    if (sourceSubcategory === "Etek" && candidateSubcategory === "Ceket") score += 180;
  } else if (sourceCategory === "Üst Giyim") {
    if (candidateCategory === "Alt Giyim") score += 270;
    if (candidateCategory === "Dış Giyim") score += 170;
    if (["Pantolon", "Jeans", "Etek", "Şort", "Kargo Pantolon"].includes(candidateSubcategory)) score += 120;
  } else if (sourceCategory === "Dış Giyim") {
    if (candidateCategory === "Alt Giyim") score += 260;
    if (candidateCategory === "Üst Giyim") score += 190;
    if (["Pantolon", "Jeans", "Etek", "Gömlek", "Triko | Kazak"].includes(candidateSubcategory)) score += 100;
  } else if (sourceCategory === "Takımlar") {
    if (candidateCategory === "Dış Giyim") score += 210;
    if (candidateCategory === "Aksesuar") score += 160;
  } else if (sourceCategory === "İç Giyim" || sourceCategory === "Plaj Giyim") {
    if (candidateCategory === sourceCategory) score += 170;
    if (candidateCategory === "Aksesuar") score += 110;
  }

  return score;
}

function recommendationScore(source = {}, candidate = {}) {
  if (!candidate || candidate.id === source.id || candidate.status === "draft") return -Infinity;
  let score = productMerchandisingScore(candidate);
  const sourceCategory = productMainCategory(source);
  const candidateCategory = productMainCategory(candidate);
  const sourceSubcategory = productSubcategory(source);
  const candidateSubcategory = productSubcategory(candidate);
  const complement = complementaryScore(source, candidate);
  const colorScore = colorAffinityScore(source, candidate);
  score += complement;
  score += colorScore;
  if (complement > 0 && colorScore > 0) score += 120;
  if (sourceCategory && sourceCategory === candidateCategory) score += 45;
  if (sourceSubcategory && sourceSubcategory === candidateSubcategory) score += complement ? 20 : -70;
  if (source.collection && source.collection === candidate.collection) score += 80;
  if (normalizedGenderSections(source).some((section) => normalizedGenderSections(candidate).includes(section))) score += 36;
  if (candidate.featured) score += 32;
  if (productAvailableStock(candidate) > 0) score += 28;
  const sourcePrice = Number(source.price) || 0;
  const candidatePrice = Number(candidate.price) || 0;
  if (sourcePrice && candidatePrice) {
    const distance = Math.abs(sourcePrice - candidatePrice) / Math.max(sourcePrice, 1);
    score += Math.max(0, 70 - Math.round(distance * 100));
  }
  return score;
}

function recommendedProductsFor(source = {}, candidates = [], limit = 4) {
  return uniqueProducts(candidates)
    .filter((candidate) => candidate?.id !== source.id && candidate?.status !== "draft")
    .map((candidate) => ({ product: candidate, score: recommendationScore(source, candidate) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || String(a.product.name || "").localeCompare(String(b.product.name || ""), "tr"))
    .slice(0, limit)
    .map((item) => item.product);
}

function visualBlockUrl(block = {}) {
  const product = productByVisualKey(block.productSlug) || productByVisualKey(block.href);
  if (product) return productUrl(product);
  const href = String(block.href || "").trim();
  if (href) {
    const route = categoryRoute(href);
    if (route.category || route.subcategory) return categoryUrl(route.category, route.subcategory);
    return href;
  }
  return "/magaza";
}

function visualBlockTitle(block = {}, fallback = "THREON vitrin") {
  const placementLabel = VISUAL_PLACEMENTS[block.placement] || fallback;
  return String(block.title || placementLabel || fallback).trim();
}

function visualBlockHtml(block = {}) {
  const placementLabel = VISUAL_PLACEMENTS[block.placement] || "THREON vitrin";
  const title = visualBlockTitle(block, placementLabel);
  const cta = block.cta || "Ürünü incele";
  const content = block.showText
    ? `
      <span class="visual-block__content">
        ${block.kicker ? `<em>${escapeHtml(block.kicker)}</em>` : ""}
        <strong>${escapeHtml(title)}</strong>
        ${block.subtitle ? `<small>${escapeHtml(block.subtitle)}</small>` : ""}
        <b>${escapeHtml(cta)}</b>
      </span>
    `
    : "";
  return `
    <a class="visual-block visual-block--${escapeHtml(block.theme)}${block.showText ? "" : " visual-block--plain"}" href="${escapeHtml(visualBlockUrl(block))}">
      <img src="${escapeHtml(block.image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" style="${escapeHtml(visualImageStyle(block))}" />
      ${content}
    </a>
  `;
}

function renderHeroVisualSlides(blocks = []) {
  const frame = qs("[data-hero-carousel] .lofi-hero__frame");
  if (!frame) return;
  qsa("[data-admin-hero-slide]", frame).forEach((slide) => slide.remove());
  const defaultSlides = qsa(".lofi-hero__slide:not([data-admin-hero-slide])", frame);
  defaultSlides.forEach((slide, index) => {
    if (blocks.length) {
      slide.hidden = true;
      slide.removeAttribute("data-hero-slide");
      slide.classList.remove("is-active");
      slide.setAttribute("aria-hidden", "true");
      slide.tabIndex = -1;
    } else {
      slide.hidden = false;
      slide.dataset.heroSlide = "";
      slide.classList.toggle("is-active", index === 0);
      slide.removeAttribute("aria-hidden");
      slide.removeAttribute("tabindex");
    }
  });
  const dotsRoot = qs("[data-hero-dots]", frame);
  if (dotsRoot) dotsRoot.innerHTML = "";
  const marker = qs(".lofi-hero__caption", frame) || qs("[data-hero-dots]", frame);
  blocks.forEach((block, index) => {
    const title = visualBlockTitle(block, "THREON kampanya görseli");
    const copy = block.showText
      ? `
        <span class="lofi-hero__slide-copy">
          ${block.kicker ? `<em>${escapeHtml(block.kicker)}</em>` : ""}
          <strong>${escapeHtml(block.title || "THREON")}</strong>
          ${block.subtitle ? `<small>${escapeHtml(block.subtitle)}</small>` : ""}
        </span>
      `
      : "";
    const link = document.createElement("a");
    link.className = `lofi-hero__slide lofi-hero__slide--admin lofi-hero__slide--${block.theme}${block.showText ? "" : " lofi-hero__slide--plain"}${index === 0 ? " is-active" : ""}`;
    link.href = visualBlockUrl(block);
    link.dataset.heroSlide = "";
    link.dataset.adminHeroSlide = block.id;
    link.setAttribute("aria-hidden", index === 0 ? "false" : "true");
    link.tabIndex = index === 0 ? 0 : -1;
    link.innerHTML = `
      <img src="${escapeHtml(block.image)}" alt="${escapeHtml(title)}" loading="lazy" decoding="async" style="${escapeHtml(visualImageStyle(block))}" />
      ${copy}
    `;
    if (marker) frame.insertBefore(link, marker);
    else frame.appendChild(link);
  });
  const carousel = frame.closest("[data-hero-carousel]");
  if (carousel?.dataset.heroReady === "true") {
    delete carousel.dataset.heroReady;
    initHeroCarousel();
  }
}

function renderVisualSlots(settings = {}) {
  const blocks = visualBlocks(settings);
  renderHeroVisualSlides(blocks.filter((block) => block.placement === "home-hero"));
  qsa("[data-visual-slot]").forEach((slot) => {
    const placement = slot.dataset.visualSlot;
    const matches = blocks.filter((block) => block.placement === placement);
    slot.hidden = !matches.length;
    slot.innerHTML = matches.length
      ? `<section class="visual-slot__inner" aria-label="${escapeHtml(VISUAL_PLACEMENTS[placement] || "THREON vitrin")}">${matches
          .map(visualBlockHtml)
          .join("")}</section>`
      : "";
  });
}

function renderLookbookVisuals(settings = {}) {
  const blocks = visualBlocks(settings);
  const heroBlock = blocks.find((block) => block.placement === "lookbook-hero");
  const hero = qs("[data-lookbook-hero]");
  if (hero && heroBlock) {
    const image = qs("img", hero);
    const eyebrow = qs(".eyebrow", hero);
    const title = qs("h1", hero);
    const subtitle = qs("p:not(.eyebrow)", hero);
    if (image) {
      image.src = heroBlock.image;
      image.alt = heroBlock.title || "THREON lookbook görseli";
      image.style.objectFit = normalizeImageFit(heroBlock.crop || "cover");
      image.style.objectPosition = normalizeImagePosition(heroBlock.objectPosition || "center center");
    }
    if (eyebrow) eyebrow.textContent = heroBlock.kicker || "THREON Lookbook";
    if (title) title.textContent = heroBlock.title || "THREON stil günlüğü";
    if (subtitle) subtitle.textContent = heroBlock.subtitle || "Sezonun premium kombin hikayesini keşfet.";
    qs("[data-lookbook-hero-link]", hero)?.remove();
    const link = document.createElement("a");
    link.className = "lookbook-hero__link";
    link.href = visualBlockUrl(heroBlock);
    link.dataset.lookbookHeroLink = "";
    link.setAttribute("aria-label", heroBlock.cta || heroBlock.title || "Lookbook görselini aç");
    hero.appendChild(link);
  }

  const grid = qs("[data-lookbook-grid]");
  const gridBlocks = blocks.filter((block) => block.placement === "lookbook-grid");
  if (!grid || !gridBlocks.length) return;
  grid.innerHTML = gridBlocks
    .map((block, index) => {
      const title = block.title || `Kombin ${String(index + 1).padStart(2, "0")}`;
      const copy = block.showText
        ? `
          <div>
            <span>${escapeHtml(block.kicker || `Kombin ${String(index + 1).padStart(2, "0")}`)}</span>
            <h2>${escapeHtml(title)}</h2>
            ${block.subtitle ? `<p>${escapeHtml(block.subtitle)}</p>` : ""}
            <a href="${escapeHtml(visualBlockUrl(block))}">${escapeHtml(block.cta || "Kombini keşfet")}</a>
          </div>
        `
        : "";
      return `
        <article class="lookbook-card--${escapeHtml(block.shape || "square")}${block.showText ? "" : " lookbook-card--plain"}">
          <img src="${escapeHtml(block.image)}" alt="${escapeHtml(title)}" style="${escapeHtml(visualImageStyle(block))}" />
          ${copy}
        </article>
      `;
    })
    .join("");
}

function isFavorite(productId) {
  return state.wishlist.includes(productId);
}

function swatchColor(color = "") {
  const value = color.toLowerCase();
  if (value.includes("black") || value.includes("siyah")) return "#111111";
  if (value.includes("cream") || value.includes("bone") || value.includes("krem") || value.includes("kemik")) return "#e9e0cf";
  if (value.includes("olive") || value.includes("zeytin")) return "#60664d";
  if (value.includes("charcoal") || value.includes("smoke") || value.includes("gray") || value.includes("kömür") || value.includes("duman")) return "#5d5d5d";
  if (value.includes("white") || value.includes("beyaz")) return "#ffffff";
  return "#cfc7b8";
}

function priceMeta(product) {
  const price = Number(product?.price);
  const compare = Number(product?.comparePrice);
  const hasSale = Number.isFinite(compare) && Number.isFinite(price) && compare > price;
  const save = hasSale ? compare - price : 0;
  const discount = hasSale ? Math.round((save / compare) * 100) : 0;
  return { price, compare, hasSale, save, discount };
}

function variantKey(size = "", color = "") {
  return `${String(size || "Standart").trim()}__${String(color || "Tek renk").trim()}`;
}

function productVariants(product = {}) {
  if (Array.isArray(product.variants) && product.variants.length) {
    return product.variants
      .map((variant) => ({
        size: String(variant.size || "Standart").trim(),
        color: String(variant.color || "Tek renk").trim(),
        stock: Number.isFinite(Number(variant.stock)) ? Number(variant.stock) : Number(product.stock || 0),
        sku: String(variant.sku || product.sku || "").trim(),
        image: String(variant.image || "").trim()
      }))
      .filter((variant) => variant.size || variant.color);
  }
  const sizes = product.sizes?.length ? product.sizes : ["Standart"];
  const colors = product.colors?.length ? product.colors : ["Tek renk"];
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
  const normalizedSize = String(size || product.sizes?.[0] || "Standart").trim();
  const normalizedColor = String(color || product.colors?.[0] || "Tek renk").trim();
  const exact = variants.find((variant) => variant.size === normalizedSize && variant.color === normalizedColor);
  if (exact) return exact;
  if (size && color && Array.isArray(product.variants) && product.variants.length) return null;
  return variants.find((variant) => variant.size === normalizedSize) || variants[0] || null;
}

function productAvailableStock(product = {}) {
  const variants = productVariants(product);
  if (Array.isArray(product.variants) && product.variants.length) {
    return variants.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);
  }
  return Number(product.stock || 0);
}

function variantStatusText(product = {}, size = "", color = "") {
  const variant = findVariant(product, size, color);
  if (Array.isArray(product.variants) && product.variants.length && size && color && !variant) return "Bu beden ve renk kombinasyonu stokta yok";
  const stock = variant ? Number(variant.stock) || 0 : productAvailableStock(product);
  if (stock <= 0) return "Bu varyant stokta yok";
  if (stock <= 3) return `Son ${stock} adet`;
  return "Stokta hazır";
}

function parseVariantLines(value = "") {
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [size, color, stock, sku, image] = line.split("|").map((part) => part.trim());
      return {
        size: size || "Standart",
        color: color || "Tek renk",
        stock: Number.isFinite(Number(stock)) ? Number(stock) : 0,
        sku: sku || "",
        image: image || ""
      };
    });
}

function formatVariantLines(variants = []) {
  return (Array.isArray(variants) ? variants : [])
    .map((variant) => [variant.size || "Standart", variant.color || "Tek renk", variant.stock ?? 0, variant.sku || "", variant.image || ""].join(" | "))
    .join("\n");
}

function productReviews(product = {}) {
  const approved = Array.isArray(product.reviews) ? product.reviews.filter((review) => review.status !== "rejected" && review.status !== "pending") : [];
  return approved;
}

function productRatingMeta(product = {}) {
  const reviews = productReviews(product);
  const ratings = reviews.map((review) => Number(review.rating)).filter(Number.isFinite);
  const average = ratings.length ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : 0;
  return {
    average: ratings.length ? Math.round(average * 10) / 10 : null,
    count: reviews.length
  };
}

function setMetaContent(name, content, attribute = "name") {
  if (!content) return;
  let meta = document.querySelector(`meta[${attribute}="${name}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, name);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

function injectProductSchema(product = {}) {
  const old = qs("[data-product-schema]");
  if (old) old.remove();
  const rating = productRatingMeta(product);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: [product.image, ...(product.gallery || [])].filter(Boolean),
    description: productSummaryText(product),
    sku: product.sku || product.id,
    brand: { "@type": "Brand", name: "THREON" },
    offers: {
      "@type": "Offer",
      priceCurrency: product.currency || "TRY",
      price: String(product.price || "0"),
      availability: productAvailableStock(product) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: location.href
    }
  };
  if (rating.count) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.average,
      reviewCount: rating.count
    };
  }
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.productSchema = "true";
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function setProductSeo(product = {}) {
  const title = `${product.name} | THREON Premium Giyim`;
  const description = productSummaryText(product) || "THREON premium giyim ürün detayı.";
  document.title = title;
  setMetaContent("description", description);
  setMetaContent("og:title", title, "property");
  setMetaContent("og:description", description, "property");
  setMetaContent("og:type", "product", "property");
  setMetaContent("og:image", product.image || "assets/threon-fashion-hero.png", "property");
  setMetaContent("twitter:card", "summary_large_image");
  injectProductSchema(product);
}

function setNexFrameSeo(product = null) {
  const title = product ? `${product.name} | NexFrame Merch | THREON` : "NexFrame Merch | THREON";
  const description = product
    ? NEXFRAME_COLLECTION_COPY.productDescription
    : "Resmî NexFrame merch ürünleri THREON tarafından üretilecek ve satışa sunulacak. Çok yakında.";
  document.title = title;
  setMetaContent("description", description);
  setMetaContent("og:title", title, "property");
  setMetaContent("og:description", description, "property");
  setMetaContent("og:type", product ? "product" : "website", "property");
  setMetaContent("twitter:card", "summary");
}

function siteBaseUrl(settings = state.site?.settings || {}) {
  return String(settings.seo?.siteUrl || settings.siteUrl || location.origin).replace(/\/+$/, "");
}

function setCanonicalUrl(settings = state.site?.settings || {}) {
  let canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement("link");
    canonical.rel = "canonical";
    document.head.appendChild(canonical);
  }
  canonical.href = `${siteBaseUrl(settings)}${location.pathname}${location.search}`;
}

function injectSiteSchema(settings = state.site?.settings || {}) {
  qs("[data-site-schema]")?.remove();
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: settings.brandName || "THREON",
      url: siteBaseUrl(settings),
      logo: `${siteBaseUrl(settings)}/assets/threon-logo-black.png`,
      address: settings.address || "Antalya / Türkiye"
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: settings.brandName || "THREON",
      url: siteBaseUrl(settings),
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteBaseUrl(settings)}/magaza?search={search_term_string}`,
        "query-input": "required name=search_term_string"
      }
    }
  ];
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.siteSchema = "true";
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

function initAnalytics(settings = state.site?.settings || {}) {
  const analytics = settings.analytics || {};
  if (!analytics.enabled) return;
  const gaId = String(analytics.googleAnalyticsId || "").trim();
  const pixelId = String(analytics.metaPixelId || "").trim();
  if (gaId && !window.__threonGaLoaded) {
    window.__threonGaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaId);
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.appendChild(script);
  }
  if (pixelId && !window.__threonMetaLoaded) {
    window.__threonMetaLoaded = true;
    window.fbq =
      window.fbq ||
      function fbq() {
        (window.fbq.queue = window.fbq.queue || []).push(arguments);
      };
    window.fbq("init", pixelId);
    window.fbq("track", "PageView");
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }
}

function applySeoAndTracking(settings = state.site?.settings || {}) {
  const seo = settings.seo || {};
  if (seo.defaultTitle && document.body.dataset.page !== "product-detail") {
    document.title = seo.defaultTitle;
  }
  if (seo.defaultDescription && document.body.dataset.page !== "product-detail") {
    setMetaContent("description", seo.defaultDescription);
  }
  setCanonicalUrl(settings);
  injectSiteSchema(settings);
  initAnalytics(settings);
}

function trackCommerceEvent(name, payload = {}) {
  const analytics = state.site?.settings?.analytics || {};
  const eventPayload =
    name === "purchase" && analytics.conversionLabel
      ? { ...payload, send_to: analytics.conversionLabel }
      : payload;
  if (typeof window.gtag === "function") {
    window.gtag("event", name, eventPayload);
  }
  if (typeof window.fbq === "function") {
    const metaName = name === "purchase" ? "Purchase" : name === "add_to_cart" ? "AddToCart" : name;
    window.fbq("track", metaName, eventPayload);
  }
}

function dropTimeParts(endsAt = "") {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return null;
  const remaining = Math.max(0, end - Date.now());
  return {
    total: remaining,
    days: Math.floor(remaining / 86400000),
    hours: Math.floor((remaining % 86400000) / 3600000),
    minutes: Math.floor((remaining % 3600000) / 60000),
    seconds: Math.floor((remaining % 60000) / 1000)
  };
}

function renderLimitedDrop(settings = state.site?.settings || {}) {
  qsa("[data-limited-drop]").forEach((node) => node.remove());
  if (window.__threonDropTimer) {
    clearInterval(window.__threonDropTimer);
    window.__threonDropTimer = null;
  }
  const drop = settings.drop || {};
  const parts = dropTimeParts(drop.endsAt);
  if (!drop.enabled || !parts || parts.total <= 0) return;
  const product = productByVisualKey(drop.productSlug || "", state.site?.products || []);
  const section = document.createElement("section");
  section.className = "limited-drop-countdown";
  section.dataset.limitedDrop = "";
  section.innerHTML = `
    <a href="${escapeHtml(product ? productUrl(product) : "/magaza")}">
      <span>Limitli drop</span>
      <strong>${escapeHtml(drop.title || product?.name || "THREON özel drop")}</strong>
      <small>${escapeHtml(product?.name || "Sezon seçkisi")}</small>
    </a>
    <div class="limited-drop-countdown__timer" data-limited-drop-timer></div>
  `;
  const ticker = qs(".premium-drop-ticker");
  const main = qs("main");
  if (ticker) ticker.insertAdjacentElement("afterend", section);
  else if (main) main.insertAdjacentElement("afterbegin", section);
  const timer = qs("[data-limited-drop-timer]", section);
  const update = () => {
    const next = dropTimeParts(drop.endsAt);
    if (!next || next.total <= 0) {
      section.remove();
      clearInterval(window.__threonDropTimer);
      window.__threonDropTimer = null;
      return;
    }
    timer.innerHTML = [
      ["Gün", next.days],
      ["Saat", next.hours],
      ["Dakika", next.minutes],
      ["Saniye", next.seconds]
    ]
      .map(([label, value]) => `<span><strong>${String(value).padStart(2, "0")}</strong><em>${label}</em></span>`)
      .join("");
  };
  update();
  window.__threonDropTimer = setInterval(update, 1000);
}

function readNotifyRequests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.notifyRequests);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function saveNotifyRequest(productId, size = "", color = "") {
  const requests = readNotifyRequests();
  const key = `${productId}__${variantKey(size, color)}`;
  const exists = requests.some((item) => item.key === key);
  if (!exists) {
    requests.unshift({
      key,
      productId,
      size,
      color,
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.notifyRequests, JSON.stringify(requests.slice(0, 20)));
  }
  showToast("Stok bildirimi talebin kaydedildi.");
}

function readAddressBook() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.addressBook);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function readRecentProducts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.recentProducts);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function trackRecentProduct(productId) {
  if (!productId) return;
  const next = [productId, ...readRecentProducts().filter((id) => id !== productId)].slice(0, 8);
  localStorage.setItem(STORAGE_KEYS.recentProducts, JSON.stringify(next));
}

function renderRecentProducts(currentId = "") {
  const products = readRecentProducts()
    .filter((id) => id !== currentId)
    .map((id) => findProduct(id))
    .filter(Boolean)
    .slice(0, 4);
  if (!products.length) return "";
  return `
    <section class="section related-products recent-products">
      <div class="section-heading section-heading--shop">
        <p class="eyebrow">Son baktıkların</p>
        <h2>Yakın zamanda incelenenler.</h2>
        <a href="products.html">Tüm ürünler</a>
      </div>
      <div class="product-grid">${products.map(productCard).join("")}</div>
    </section>
  `;
}

function saveAddressBookEntry(address = {}) {
  const key = [address.city, address.district, address.neighborhood, address.address].filter(Boolean).join("__");
  if (!key) return;
  const items = readAddressBook().filter((item) => item.key !== key);
  items.unshift({
    key,
    city: address.city || "",
    district: address.district || "",
    neighborhood: address.neighborhood || "",
    address: address.address || "",
    note: address.note || "",
    createdAt: new Date().toISOString()
  });
  localStorage.setItem(STORAGE_KEYS.addressBook, JSON.stringify(items.slice(0, 5)));
}

function productPriceBlock(product, variant = "") {
  if (isNexFrameProduct(product)) {
    const classes = ["price-module", "price-module--locked", variant ? `price-module--${variant}` : ""].filter(Boolean).join(" ");
    return `
      <div class="${classes}" aria-label="Bu ürün henüz satışa açık değil">
        <div class="price-module__top">
          <span>Yakında Satışta</span>
          <em>${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</em>
        </div>
        <div class="price-module__main">
          <strong>${escapeHtml(product.priceLabel || NEXFRAME_COLLECTION_COPY.status)}</strong>
        </div>
        <div class="price-module__note">${escapeHtml(NEXFRAME_COLLECTION_COPY.productCardDescription)}</div>
      </div>
    `;
  }
  const { hasSale, save, discount } = priceMeta(product);
  const classes = ["price-module", variant ? `price-module--${variant}` : ""].filter(Boolean).join(" ");
  if (variant === "card") {
    return `
      <div class="${classes}">
        <div class="price-module__main">
          <strong>${formatPrice(product)}</strong>
          ${hasSale ? `<del>${formatPrice({ price: product.comparePrice, currency: product.currency })}</del>` : ""}
        </div>
      </div>
    `;
  }
  return `
    <div class="${classes}">
      <div class="price-module__top">
        <span>${hasSale ? "Drop fiyatı" : "Normal fiyat"}</span>
        ${hasSale ? `<em>-${discount}%</em>` : "<em>Yeni</em>"}
      </div>
      <div class="price-module__main">
        <strong>${formatPrice(product)}</strong>
        ${hasSale ? `<del>${formatPrice({ price: product.comparePrice, currency: product.currency })}</del>` : ""}
      </div>
      <div class="price-module__note">
        ${hasSale ? `${formatPrice({ price: save, currency: product.currency })} tasarruf` : "Premium paketleme dahil"}
      </div>
    </div>
  `;
}

function productCard(product) {
  if (isNexFrameProduct(product)) return lockedProductCard(product);
  const { hasSale } = priceMeta(product);
  const badge = product.badge || hasSale ? product.badge || "İndirim" : "";
  const badgeHtml = badge
    ? `<span class="product-card__badge">${escapeHtml(badge)}</span>`
    : "";
  const sizes = (product.sizes || []).slice(0, 5);
  const sizeOptions = sizes.length ? sizes : ["S", "M", "L"];
  const hoverImage = (product.gallery || []).find((image) => image && image !== product.image);
  const hasHoverImage = Boolean(hoverImage);
  const categoryText = categoryDisplay(product);
  const imageRatio = normalizeImageRatio(product.imageRatio || "portrait");
  const mediaStyle = `aspect-ratio:${IMAGE_RATIOS[imageRatio]}`;
  const imageStyleText = productImageStyle(product);
  return `
    <article class="product-card${hasHoverImage ? " product-card--has-hover" : ""}" data-product-card="${escapeHtml(product.id)}">
      <div class="product-card__media product-card__media--${escapeHtml(imageRatio)}" style="${escapeHtml(mediaStyle)}">
        <a href="${productUrl(product)}" aria-label="${escapeHtml(product.name)} detay">
          <img class="product-card__image product-card__image--primary" src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" loading="lazy" decoding="async" style="${escapeHtml(imageStyleText)}" />
          ${
            hoverImage
              ? `<img class="product-card__image product-card__image--hover" src="${TRANSPARENT_IMAGE}" data-hover-image data-hover-src="${escapeHtml(hoverImage)}" alt="${escapeHtml(product.name)} alternatif görsel" loading="lazy" decoding="async" style="${escapeHtml(imageStyleText)}" />`
              : ""
          }
        </a>
        <button class="wishlist-button${isFavorite(product.id) ? " is-active" : ""}" type="button" data-wishlist-toggle="${escapeHtml(product.id)}" aria-label="Favorilere ekle" aria-pressed="${isFavorite(product.id) ? "true" : "false"}">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20s-7-4.35-9.2-9.1C.9 6.8 3.4 3.5 7.1 3.5c2.05 0 3.3 1.1 3.9 2 .6-.9 1.95-2 4-2 3.6 0 6.1 3.3 4.2 7.4C17 15.65 12 20 12 20Z"></path>
          </svg>
        </button>
        <button class="compare-button${state.compare.includes(product.id) ? " is-active" : ""}" type="button" data-compare-toggle="${escapeHtml(product.id)}" aria-label="Karşılaştırmaya ekle" aria-pressed="${state.compare.includes(product.id) ? "true" : "false"}">
          <span></span>
        </button>
        ${badgeHtml}
        <div class="product-card__quick">
          <span class="quick-title">Hızlı seçim</span>
          <div class="quick-size-row">
            ${sizeOptions
              .map(
                (size, index) =>
                  `<button class="quick-size${index === 0 ? " is-selected" : ""}" type="button" data-quick-size="${escapeHtml(size)}">${escapeHtml(size)}</button>`
              )
              .join("")}
          </div>
          <button class="quick-action" type="button" data-add-card="${escapeHtml(product.id)}">Sepete ekle</button>
          <button class="quick-preview" type="button" data-quick-view="${escapeHtml(product.id)}">Hızlı bak</button>
        </div>
      </div>
      <div class="product-card__body">
        <div class="product-card__bottom">
          <div>
            <h3><a href="${productUrl(product)}">${escapeHtml(product.name)}</a></h3>
            <p>${escapeHtml(categoryText)}</p>
          </div>
          ${productPriceBlock(product, "card")}
        </div>
      </div>
    </article>
  `;
}

function lockedProductCard(product) {
  return `
    <article class="product-card product-card--locked nexframe-product-card" data-product-card="${escapeHtml(product.id)}">
      <a class="nexframe-product-card__media" href="${productUrl(product)}" aria-label="${escapeHtml(product.name)} kilitli ürün detayı">
        <span class="nexframe-product-card__pattern" aria-hidden="true"></span>
        <img class="nexframe-brand-logo nexframe-product-card__logo" src="${NEXFRAME_LOGO}" alt="NexFrame AI logosu" loading="lazy" />
        <span class="nexframe-product-card__brand" aria-hidden="true">NEXFRAME</span>
        <span class="nexframe-product-card__type">${escapeHtml(product.placeholderType || "Merch")}</span>
        <span class="nexframe-lock-overlay" aria-label="Bu ürün henüz satışa açık değil">
          ${lockIconSvg("nexframe-lock-icon")}
          <strong>Kilitli</strong>
          <em>${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</em>
        </span>
      </a>
      <div class="product-card__body nexframe-product-card__body">
        <div>
          <span class="nexframe-product-card__badge">${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</span>
          <h3><a href="${productUrl(product)}">${escapeHtml(product.name)}</a></h3>
          <p>${escapeHtml(NEXFRAME_COLLECTION_COPY.productCardDescription)}</p>
        </div>
        <div class="nexframe-product-card__bottom">
          <strong>${escapeHtml(product.priceLabel || NEXFRAME_COLLECTION_COPY.status)}</strong>
          <button class="quick-action" type="button" disabled aria-disabled="true" aria-label="Bu ürün henüz satışa açık değil">
            Sepete Eklenemez
          </button>
        </div>
      </div>
    </article>
  `;
}

function readCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.cart);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function readWishlist() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.wishlist);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function readCompare() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.compare);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items.filter(Boolean).slice(0, 4) : [];
  } catch {
    return [];
  }
}

function saveWishlist(items) {
  state.wishlist = [...new Set(items.filter(Boolean))];
  localStorage.setItem(STORAGE_KEYS.wishlist, JSON.stringify(state.wishlist));
  renderWishlist();
  renderWishlistIndicators();
}

function saveCompare(items) {
  state.compare = [...new Set(items.filter(Boolean))].slice(0, 4);
  localStorage.setItem(STORAGE_KEYS.compare, JSON.stringify(state.compare));
  renderCompareDrawer();
  renderCompareIndicators();
}

function saveCart(items) {
  state.cart = items.filter((item) => item && item.productId && item.quantity > 0);
  localStorage.setItem(STORAGE_KEYS.cart, JSON.stringify(state.cart));
  renderCart();
}

function getProductsFromState() {
  return state.site?.products || [];
}

function findProduct(productId) {
  return (
    nexFrameProductByKey(productId) ||
    state.productDetails[productId] ||
    getProductsFromState().find((product) => product.id === productId || product.slug === productId)
  );
}

function cartLineKey(productId, size = "", color = "") {
  return `${productId}__${size}__${color}`;
}

function addToCart(productId, options = {}) {
  const product = findProduct(productId);
  if (!product) return;
  if (isNexFrameProduct(product)) {
    showToast(NEXFRAME_COLLECTION_COPY.unavailable);
    return;
  }
  const variant = findVariant(product, options.size, options.color);
  if (Array.isArray(product.variants) && product.variants.length && options.size && options.color && !variant) {
    showToast("Bu beden ve renk kombinasyonu stokta yok.");
    return;
  }
  const size = variant?.size || options.size || product.sizes?.[0] || "Standart";
  const color = variant?.color || options.color || product.colors?.[0] || "Tek renk";
  const availableStock = variant ? Number(variant.stock) || 0 : productAvailableStock(product);
  if (availableStock <= 0) {
    showToast("Bu varyant stokta yok. Stok bildirimi alabilirsin.");
    return;
  }
  const lineKey = cartLineKey(product.id, size, color);
  const cart = readCart();
  const existing = cart.find((item) => item.lineKey === lineKey);
  if (existing) {
    if (existing.quantity + 1 > availableStock) {
      showToast(`Bu varyant için stokta ${availableStock} adet var.`);
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({
      lineKey,
      variantKey: variantKey(size, color),
      productId: product.id,
      name: product.name,
      slug: product.slug,
      image: product.image,
      price: Number(product.price) || 0,
      currency: product.currency || "TRY",
      sku: variant?.sku || product.sku || "",
      size,
      color,
      quantity: 1
    });
  }
  saveCart(cart);
  trackCommerceEvent("add_to_cart", {
    currency: product.currency || "TRY",
    value: Number(product.price) || 0,
    items: [{ item_id: product.id, item_name: product.name, item_category: categoryDisplay(product), item_variant: `${size} / ${color}` }]
  });
  openCart();
}

function updateCartQuantity(lineKey, delta) {
  const next = readCart()
    .map((item) => {
      if (item.lineKey !== lineKey) return item;
      const product = findProduct(item.productId);
      const variant = product ? findVariant(product, item.size, item.color) : null;
      const availableStock = variant ? Number(variant.stock) || 0 : productAvailableStock(product || {});
      const quantity = item.quantity + delta;
      if (delta > 0 && quantity > availableStock) {
        showToast(`Bu varyant için stokta ${availableStock} adet var.`);
        return item;
      }
      return { ...item, quantity };
    })
    .filter((item) => item.quantity > 0);
  saveCart(next);
}

function removeCartLine(lineKey) {
  saveCart(readCart().filter((item) => item.lineKey !== lineKey));
}

function clearCart() {
  saveCart([]);
}

function toggleWishlist(productId) {
  if (!productId) return;
  const exists = state.wishlist.includes(productId);
  saveWishlist(exists ? state.wishlist.filter((id) => id !== productId) : [...state.wishlist, productId]);
  showToast(exists ? "Favorilerden kaldırıldı." : "Favorilere eklendi.");
}

function wishlistProducts() {
  return state.wishlist
    .map((id) => findProduct(id))
    .filter(Boolean);
}

function compareProducts() {
  return state.compare
    .map((id) => findProduct(id))
    .filter(Boolean);
}

function renderWishlistIndicators() {
  qsa("[data-wishlist-count]").forEach((node) => {
    node.textContent = String(state.wishlist.length);
  });
  qsa("[data-wishlist-toggle]").forEach((button) => {
    const active = state.wishlist.includes(button.dataset.wishlistToggle);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderCompareIndicators() {
  qsa("[data-compare-count]").forEach((node) => {
    node.textContent = String(state.compare.length);
  });
  qsa("[data-compare-toggle]").forEach((button) => {
    const active = state.compare.includes(button.dataset.compareToggle);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function toggleCompare(productId) {
  if (!productId) return;
  const exists = state.compare.includes(productId);
  if (!exists && state.compare.length >= 4) {
    showToast("Karşılaştırmaya en fazla 4 ürün eklenebilir.");
    return;
  }
  saveCompare(exists ? state.compare.filter((id) => id !== productId) : [...state.compare, productId]);
  showToast(exists ? "Karşılaştırmadan kaldırıldı." : "Karşılaştırmaya eklendi.");
}

function renderWishlist() {
  const list = qs("[data-wishlist-list]");
  if (!list) return;
  const products = wishlistProducts();
  renderWishlistIndicators();
  list.innerHTML = products.length
    ? products
        .map(
          (product) => `
            <article class="wishlist-line">
              <a href="${productUrl(product)}">
                <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
              </a>
              <div>
                <h3>${escapeHtml(product.name)}</h3>
                <p>${escapeHtml(categoryDisplay(product))}</p>
                <strong>${formatPrice(product)}</strong>
                <div class="wishlist-line__actions">
                  <a href="${productUrl(product)}">Incele</a>
                  <button type="button" data-wishlist-remove="${escapeHtml(product.id)}">Kaldır</button>
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state empty-state--small">Favori listen henüz boş.</div>';
}

function renderCompareDrawer() {
  const root = qs("[data-compare-list]");
  if (!root) return;
  const products = compareProducts();
  renderCompareIndicators();
  if (!products.length) {
    root.innerHTML = '<div class="empty-state empty-state--small">Karşılaştırmak için ürün kartlarından seçim yap.</div>';
    return;
  }
  const rows = [
    ["Fiyat", (product) => formatPrice(product)],
    ["Kategori", (product) => categoryDisplay(product)],
    ["Kalıp", (product) => product.fit || "Belirtilmedi"],
    ["Stok", (product) => `${productAvailableStock(product)} adet`],
    ["Materyal", (product) => product.material || "Belirtilmedi"],
    ["Puan", (product) => {
      const rating = productRatingMeta(product);
      return rating.count ? `${rating.average}/5` : "Henüz puan yok";
    }]
  ];
  root.innerHTML = `
    <div class="compare-table">
      <div class="compare-table__products">
        ${products
          .map(
            (product) => `
              <article>
                <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
                <strong>${escapeHtml(product.name)}</strong>
                <button type="button" data-compare-remove="${escapeHtml(product.id)}">Kaldır</button>
              </article>
            `
          )
          .join("")}
      </div>
      ${rows
        .map(
          ([label, getter]) => `
            <div class="compare-table__row">
              <span>${escapeHtml(label)}</span>
              ${products.map((product) => `<em>${escapeHtml(getter(product))}</em>`).join("")}
            </div>
          `
        )
        .join("")}
      <div class="compare-table__actions">
        ${products.map((product) => `<a href="${productUrl(product)}">İncele: ${escapeHtml(product.name)}</a>`).join("")}
      </div>
    </div>
  `;
}

function openCompare() {
  renderCompareDrawer();
  qs("[data-compare-drawer]")?.classList.add("is-open");
  document.body.classList.add("compare-open");
}

function closeCompare() {
  qs("[data-compare-drawer]")?.classList.remove("is-open");
  document.body.classList.remove("compare-open");
}

function showToast(message) {
  const toast = qs("[data-toast]");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2200);
}

function searchProducts(query = "") {
  const normalized = query.trim().toLowerCase();
  const products = state.site?.products || [];
  if (!normalized) return products.slice(0, 8);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return products
    .map((product) => {
      const name = String(product.name || "").toLowerCase();
      const category = categoryDisplay(product).toLowerCase();
      const collection = String(product.collection || "").toLowerCase();
      const summary = `${productSummaryText(product)} ${productDescriptionText(product)} ${(product.colors || []).join(" ")}`.toLowerCase();
      let score = productMerchandisingScore(product);
      tokens.forEach((token) => {
        if (name.includes(token)) score += 160;
        if (category.includes(token)) score += 95;
        if (collection.includes(token)) score += 60;
        if (summary.includes(token)) score += 35;
      });
      if (name.startsWith(normalized)) score += 160;
      if (productAvailableStock(product) <= 0) score -= 300;
      return { product, score };
    })
    .filter((item) => item.score > 0 && tokens.some((token) => `${item.product.name} ${categoryDisplay(item.product)} ${item.product.collection} ${productSummaryText(item.product)}`.toLowerCase().includes(token)))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((item) => item.product);
}

function renderSearchResults(query = "") {
  const root = qs("[data-search-results]");
  if (!root) return;
  const products = searchProducts(query);
  const trimmed = query.trim();
  root.innerHTML = products.length
    ? `
        <div class="search-drawer__summary">
          <strong>${trimmed ? `${products.length} sonuç` : "Popüler aramalar"}</strong>
          <span>${trimmed ? "En ilgili ürünler öne alındı." : "Yeni sezon ve öne çıkan parçalar."}</span>
        </div>
        ${products
          .map(
            (product) => `
            <a class="search-result" href="${productUrl(product)}">
              <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" style="${escapeHtml(productImageStyle(product))}" />
              <span>
                <strong>${escapeHtml(product.name)}</strong>
                <small>${escapeHtml(categoryDisplay(product))}</small>
                <i>${productAvailableStock(product) > 0 ? "Stokta" : "Stok bekleniyor"}</i>
              </span>
              <em>${formatPrice(product)}</em>
            </a>
          `
          )
          .join("")}
      `
    : '<div class="empty-state empty-state--small">Aradığın ürün bulunamadı.</div>';
}

function openSearch() {
  qs("[data-search-drawer]")?.classList.add("is-open");
  const panel = qs(".search-drawer__panel");
  if (panel) panel.style.transform = "translateX(0)";
  document.body.classList.add("search-open");
  fetchSite().then(() => {
    const input = qs("[data-global-search]");
    renderSearchResults(input?.value || "");
    input?.focus();
  });
}

function closeSearch() {
  qs("[data-search-drawer]")?.classList.remove("is-open");
  const panel = qs(".search-drawer__panel");
  if (panel) panel.style.transform = "";
  document.body.classList.remove("search-open");
}

function openWishlist() {
  renderWishlist();
  qs("[data-wishlist-drawer]")?.classList.add("is-open");
  const panel = qs(".wishlist-drawer__panel");
  if (panel) panel.style.transform = "translateX(0)";
  document.body.classList.add("wishlist-open");
}

function closeWishlist() {
  qs("[data-wishlist-drawer]")?.classList.remove("is-open");
  const panel = qs(".wishlist-drawer__panel");
  if (panel) panel.style.transform = "";
  document.body.classList.remove("wishlist-open");
}

async function openQuickView(productId) {
  let product = findProduct(productId);
  const root = qs("[data-quick-view-panel]");
  if (!product || !root) return;
  root.innerHTML = '<div class="empty-state">Ürün hazırlanıyor...</div>';
  try {
    const detail = await fetchProductDetail(product.slug || product.id || productId);
    if (detail?.product) product = detail.product;
  } catch {
    // The compact catalog data is enough for a quick preview if detail loading is unavailable.
  }
  const gallery = [...new Set([product.image, ...(product.gallery || [])].filter(Boolean))];
  const sizes = (product.sizes || ["Standart"])
    .map(
      (size, index) =>
        `<button class="size-chip${index === 0 ? " is-selected" : ""}" type="button" data-option-value="${escapeHtml(size)}">${escapeHtml(size)}</button>`
    )
    .join("");
  const colors = (product.colors || ["Tek renk"])
    .map(
      (color, index) =>
        `<button class="color-chip${index === 0 ? " is-selected" : ""}" type="button" data-option-value="${escapeHtml(color)}">${escapeHtml(color)}</button>`
    )
    .join("");
  root.innerHTML = `
    <header>
      <div>
        <p class="eyebrow">${escapeHtml(categoryDisplay(product) || "THREON")}</p>
        <h2>${escapeHtml(product.name)}</h2>
      </div>
      <button class="mini-button" type="button" data-quick-view-close>Kapat</button>
    </header>
    <div class="quick-view__media">
      <img src="${escapeHtml(gallery[0] || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
      ${product.badge ? `<span>${escapeHtml(product.badge)}</span>` : ""}
    </div>
    <div class="quick-view__content">
      ${productPriceBlock(product, "quick")}
      <p>${escapeHtml(productSummaryText(product))}</p>
      <div class="quick-view__options">
        <div>
          <span>Beden</span>
          <div class="size-row" data-option-group>${sizes}</div>
        </div>
        <div>
          <span>Renk</span>
          <div class="color-row" data-option-group>${colors}</div>
        </div>
      </div>
      <div class="quick-view__actions">
        <button class="button button-dark" type="button" data-add-quick-view="${escapeHtml(product.id)}">Sepete ekle</button>
        <a class="button button-secondary-dark" href="${productUrl(product)}">Detaya git</a>
      </div>
    </div>
  `;
  qs("[data-quick-view-drawer]")?.classList.add("is-open");
  const panel = qs(".quick-view__panel");
  if (panel) panel.style.transform = "translateX(0)";
  document.body.classList.add("quick-view-open");
}

function closeQuickView() {
  qs("[data-quick-view-drawer]")?.classList.remove("is-open");
  const panel = qs(".quick-view__panel");
  if (panel) panel.style.transform = "";
  document.body.classList.remove("quick-view-open");
}

function syncVariantStatus(root = document) {
  const status = qs("[data-variant-status]", root);
  if (!status) return;
  const product = findProduct(status.dataset.productId);
  if (!product) return;
  const panel = status.closest(".purchase-panel") || root;
  const size = qs(".size-chip.is-selected", panel)?.dataset.optionValue || product.sizes?.[0] || "";
  const color = qs(".color-chip.is-selected", panel)?.dataset.optionValue || product.colors?.[0] || "";
  const variant = findVariant(product, size, color);
  const stock = Array.isArray(product.variants) && product.variants.length && size && color && !variant ? 0 : variant ? Number(variant.stock) || 0 : productAvailableStock(product);
  status.textContent = variantStatusText(product, size, color);
  status.classList.toggle("is-low", stock > 0 && stock <= 3);
  status.classList.toggle("is-out", stock <= 0);
  const mainImage = qs("[data-gallery-main]");
  if (mainImage && variant?.image) {
    mainImage.src = variant.image;
  }
}

function injectPremiumFooter() {
  if (document.body.dataset.page === "admin" || qs("[data-premium-footer]")) return;
  const footer = qs(".site-footer");
  if (!footer) return;
  footer.insertAdjacentHTML(
    "beforebegin",
    `
      <section class="premium-footer" data-premium-footer>
        <div class="premium-footer__brand">
          <div class="premium-footer__topline">
            <span>EST. 2026</span>
            <span>ANTALYA</span>
            <span>LİMİTLİ KAPSÜLLER</span>
          </div>
          <img class="premium-footer__logo" src="assets/threon-logo-black-header.png" alt="THREON" loading="lazy" />
          <p>Antalya'da doğan THREON; temiz siluetler, güçlü kalıplar ve limitli kapsül drop'lar üzerine kurulu premium giyim markasıdır.</p>
          <div class="premium-footer__badges">
            <span>256 Bit SSL</span>
            <span>Premium paketleme</span>
            <span>14 gün iade</span>
            <span>OTP hesap güvenliği</span>
          </div>
        </div>
        <nav aria-label="Footer shop links">
          <h3>Mağaza</h3>
          <a href="products.html">Yeni gelenler</a>
          <a href="${categoryUrl("Takımlar")}">Takımlar</a>
          <a href="${categoryUrl("Üst Giyim")}">Üst Giyim</a>
          <a href="${categoryUrl("Alt Giyim")}">Alt Giyim</a>
          <a href="${categoryUrl("Dış Giyim")}">Dış Giyim</a>
          <a href="${categoryUrl("Dış Giyim", "Kaban")}">Kaban</a>
          <a href="${categoryUrl("Üst Giyim", "Gömlek")}">Gömlek</a>
          <a href="${NEXFRAME_COLLECTION_PATH}">NexFrame Merch · Çok Yakında</a>
        </nav>
        <section class="premium-footer__support" aria-label="Footer support links">
          <div class="premium-footer__section-head">
            <h3>Servis Merkezi</h3>
            <p>Sipariş öncesi ve sonrası tüm THREON servis akışı tek yerde.</p>
          </div>
          <div class="premium-footer__support-stack">
            <article>
              <span>01</span>
              <strong>Hesap & sipariş</strong>
              <p>Üyelik, ödeme ve kargo takip ekranlarına hızlı geçiş.</p>
              <div>
                <a href="account.html">Hesabım</a>
                <a href="checkout.html">Ödeme</a>
                <a href="account.html#orders">Sipariş takibi</a>
              </div>
            </article>
            <article>
              <span>02</span>
              <strong>Teslimat & iade</strong>
              <p>Kargo, değişim, KVKK ve satış koşullarını incele.</p>
              <div>
                <a href="shipping.html">Kargo ve teslimat</a>
                <a href="returns.html">İade ve değişim</a>
                <a href="privacy.html">KVKK ve gizlilik</a>
                <a href="terms.html">Mesafeli satış</a>
              </div>
            </article>
            <article>
              <span>03</span>
              <strong>Rehber & marka</strong>
              <p>Beden, stil ve THREON marka hikayesi için editoryal alanlar.</p>
              <div>
                <a href="faq.html">SSS</a>
                <a href="style-guide.html">Stil rehberi</a>
                <a href="about.html">Marka hikayesi</a>
                <a href="contact.html">Müşteri desteği</a>
              </div>
            </article>
          </div>
        </section>
        <div class="premium-footer__contact">
          <h3>THREON Club</h3>
          <p>Daha hızlı ödeme, sipariş geçmişi, telefon OTP güvenliği ve erken kapsül duyuruları için hesap oluştur.</p>
          <a href="account.html">THREON hesabı oluştur</a>
          <a href="/urun/three-gift-card">Gift Card al</a>
        </div>
        <div class="premium-footer__service-row">
          <span>Kart / havale</span>
          <span>Telefon OTP üyelik</span>
          <span>Üye sipariş takibi</span>
          <span>1500 TL+ ücretsiz kargo</span>
        </div>
        <div class="premium-footer__bottom">
          <span>Güvenli ödeme</span>
          <span>Premium paketleme</span>
          <span>Şeffaf fiyatlandırma</span>
          <span>THREON tüm hakları saklıdır</span>
        </div>
      </section>
    `
  );
}

function cartTotals() {
  const items = readCart().map((item) => {
    const product = findProduct(item.productId);
    if (!product) return item;
    return {
      ...item,
      name: product.name || item.name,
      slug: product.slug || item.slug,
      image: product.image || item.image,
      price: Number(product.price) || item.price,
      currency: product.currency || item.currency,
      sku: findVariant(product, item.size, item.color)?.sku || product.sku || item.sku || ""
    };
  });
  const count = items.reduce((total, item) => total + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + (Number(item.price) || 0) * item.quantity, 0);
  return { items, count, total };
}

function checkoutTotals() {
  const { items, count, total: subtotal } = cartTotals();
  const coupon = findCheckoutCoupon(state.checkout.couponCode, subtotal);
  const discount = couponDiscount(coupon, subtotal);
  const bundleDiscount = count >= BUNDLE_CAMPAIGN.minQuantity ? Math.round(subtotal * (BUNDLE_CAMPAIGN.percent / 100)) : 0;
  const shippingMethod = SHIPPING_METHODS[state.checkout.shippingMethod] || SHIPPING_METHODS.standard;
  const shippingBeforeCoupon = subtotal >= shippingMethod.freeThreshold || subtotal === 0 ? 0 : shippingMethod.fee;
  const shipping = coupon?.type === "shipping" ? 0 : shippingBeforeCoupon;
  const giftWrap = qs("[data-gift-wrap]")?.checked ? CHECKOUT_EXTRAS.giftWrapFee : 0;
  const paymentMethod = qs("[name='paymentMethod']:checked")?.value || "card";
  const paymentFee = paymentMethod === "door" ? CHECKOUT_EXTRAS.codFee : 0;
  return {
    items,
    count,
    subtotal,
    discount,
    bundleDiscount,
    shipping,
    giftWrap,
    paymentFee,
    shippingLabel: shippingMethod.label,
    coupon,
    total: Math.max(0, subtotal - discount - bundleDiscount + shipping + giftWrap + paymentFee)
  };
}

function renderCart() {
  const { items, count, total } = cartTotals();
  qsa("[data-cart-count]").forEach((node) => {
    node.textContent = String(count);
  });

  const list = qs("[data-cart-list]");
  const totalNode = qs("[data-cart-total]");
  const progress = qs("[data-cart-progress]");
  const note = qs("[data-cart-note]");
  const recommendations = qs("[data-cart-recommendations]");
  if (!list || !totalNode) return;

  if (!items.length) {
    list.innerHTML = '<div class="empty-state empty-state--small">Sepetin henüz boş.</div>';
  } else {
    list.innerHTML = items
      .map(
        (item) => `
          <article class="cart-line">
            <a href="${productUrl(item)}">
              <img src="${escapeHtml(item.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(item.name)}" />
            </a>
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.size)} · ${escapeHtml(item.color)}</p>
              <strong>${formatPrice({ price: item.price * item.quantity, currency: item.currency })}</strong>
              <div class="cart-line__actions">
                <button type="button" data-cart-minus="${escapeHtml(item.lineKey)}">-</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-plus="${escapeHtml(item.lineKey)}">+</button>
                <button type="button" data-cart-remove="${escapeHtml(item.lineKey)}">Sil</button>
              </div>
            </div>
          </article>
        `
      )
      .join("");
  }
  totalNode.textContent = formatPrice({ price: total, currency: "TRY" });
  const freeCargo = 1500;
  const pct = Math.max(0, Math.min(100, Math.round((total / freeCargo) * 100)));
  if (progress) progress.style.setProperty("--cart-progress", `${pct}%`);
  if (note) {
    if (count >= BUNDLE_CAMPAIGN.minQuantity) {
      note.textContent = `${BUNDLE_CAMPAIGN.label} aktif: ödeme sayfasında -${BUNDLE_CAMPAIGN.percent}% düşer.`;
    } else if (total >= freeCargo) {
      note.textContent = "Ücretsiz kargo aktif. Premium paketleme hazır.";
    } else {
      note.textContent = `${formatPrice({ price: freeCargo - total, currency: "TRY" })} daha ekle, ücretsiz kargo açılsın.`;
    }
  }
  if (recommendations) {
    recommendations.innerHTML = renderCartRecommendations(items);
  }
}

function cartRecommendationProducts(items = []) {
  const products = getProductsFromState();
  const inCart = new Set(items.map((item) => item.productId));
  const categories = new Set(items.map((item) => productMainCategory(findProduct(item.productId) || {})).filter(Boolean));
  return products
    .filter((product) => !inCart.has(product.id) && productAvailableStock(product) > 0)
    .sort((a, b) => {
      const aScore = Number(categories.has(productMainCategory(a))) + Number(Boolean(a.featured));
      const bScore = Number(categories.has(productMainCategory(b))) + Number(Boolean(b.featured));
      return bScore - aScore;
    })
    .slice(0, 3);
}

function renderCartRecommendations(items = []) {
  const products = cartRecommendationProducts(items);
  if (!products.length) return "";
  return `
    <section class="cart-recommendations">
      <div>
        <span>Kombini tamamla</span>
        <strong>Sepetine iyi gider</strong>
      </div>
      ${products
        .map(
          (product) => `
            <article>
              <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
              <div>
                <h3>${escapeHtml(product.name)}</h3>
                <p>${escapeHtml(categoryDisplay(product))}</p>
                <strong>${formatPrice(product)}</strong>
              </div>
              <button type="button" data-cart-recommend="${escapeHtml(product.id)}">Ekle</button>
            </article>
          `
        )
        .join("")}
    </section>
  `;
}

function openCart() {
  qs("[data-cart-drawer]")?.classList.add("is-open");
  document.body.classList.add("cart-open");
}

function closeCart() {
  qs("[data-cart-drawer]")?.classList.remove("is-open");
  document.body.classList.remove("cart-open");
}

function injectCartDrawer() {
  if (document.body.dataset.page === "admin" || qs("[data-cart-drawer]")) return;
  const header = qs("[data-header]");
  if (header && !qs("[data-header-actions]")) {
    header.insertAdjacentHTML(
      "beforeend",
      `
        <div class="header-actions" data-header-actions>
          <button class="header-icon" type="button" data-search-open aria-label="Ürün ara">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m16.5 16.5 4 4"></path>
            </svg>
          </button>
          <button class="header-icon header-favorite" type="button" data-wishlist-open aria-label="Favorileri aç">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 20s-7-4.35-9.2-9.1C.9 6.8 3.4 3.5 7.1 3.5c2.05 0 3.3 1.1 3.9 2 .6-.9 1.95-2 4-2 3.6 0 6.1 3.3 4.2 7.4C17 15.65 12 20 12 20Z"></path>
            </svg>
            <span data-wishlist-count>0</span>
          </button>
          <button class="header-icon header-compare" type="button" data-compare-open aria-label="Karşılaştırmayı aç">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h6v14H4z"></path>
              <path d="M14 4h6v16h-6z"></path>
            </svg>
            <span data-compare-count>0</span>
          </button>
          <a class="header-icon header-account" href="account.html" data-account-link aria-label="Hesabım">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="8" r="4"></circle>
              <path d="M4.5 21a7.5 7.5 0 0 1 15 0"></path>
            </svg>
          </a>
          <button class="header-icon header-bag" type="button" data-cart-open aria-label="Sepeti aç">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 8h10l1 12H6L7 8Z"></path>
              <path d="M9 8a3 3 0 0 1 6 0"></path>
            </svg>
            <span data-cart-count>0</span>
          </button>
        </div>
      `
    );
  }
  document.body.insertAdjacentHTML(
    "beforeend",
    `
      <div class="scroll-progress" data-scroll-progress></div>
      <aside class="cart-drawer" data-cart-drawer aria-label="Sepet">
        <button class="cart-drawer__backdrop" type="button" data-cart-close aria-label="Sepeti kapat"></button>
        <div class="cart-drawer__panel">
          <header>
            <div>
              <p class="eyebrow">THREON sepet</p>
              <h2>Sepet</h2>
            </div>
            <button class="mini-button" type="button" data-cart-close>Kapat</button>
          </header>
          <div class="cart-progress" data-cart-progress>
            <span></span>
          </div>
          <p class="cart-note" data-cart-note></p>
          <div class="cart-list" data-cart-list></div>
          <div data-cart-recommendations></div>
          <footer>
            <span>Toplam</span>
            <strong data-cart-total>0 TL</strong>
            <a class="button button-primary" href="checkout.html">Siparişi tamamla</a>
          </footer>
        </div>
      </aside>
      <aside class="search-drawer" data-search-drawer aria-label="Ürün arama">
        <button class="drawer-backdrop" type="button" data-search-close aria-label="Aramayı kapat"></button>
        <div class="search-drawer__panel">
          <header>
            <div>
              <p class="eyebrow">THREON arama</p>
              <h2>Ürün ara</h2>
            </div>
            <button class="mini-button" type="button" data-search-close>Kapat</button>
          </header>
          <label class="search-drawer__input">
            <span>Arama</span>
            <input type="search" placeholder="Kapüşonlu, kargo, ceket..." data-global-search />
          </label>
          <div class="search-drawer__results" data-search-results>
            <div class="empty-state empty-state--small">Aramak için yazmaya başla.</div>
          </div>
        </div>
      </aside>
      <aside class="wishlist-drawer" data-wishlist-drawer aria-label="Favoriler">
        <button class="drawer-backdrop" type="button" data-wishlist-close aria-label="Favorileri kapat"></button>
        <div class="wishlist-drawer__panel">
          <header>
            <div>
              <p class="eyebrow">THREON favoriler</p>
              <h2>Favoriler</h2>
            </div>
            <button class="mini-button" type="button" data-wishlist-close>Kapat</button>
          </header>
          <div class="wishlist-list" data-wishlist-list></div>
          <footer>
            <a class="button button-primary" href="products.html">Alışverişe devam et</a>
          </footer>
        </div>
      </aside>
      <aside class="compare-drawer" data-compare-drawer aria-label="Ürün karşılaştırma">
        <button class="drawer-backdrop" type="button" data-compare-close aria-label="Karşılaştırmayı kapat"></button>
        <div class="compare-drawer__panel">
          <header>
            <div>
              <p class="eyebrow">THREON karşılaştır</p>
              <h2>Ürünleri yan yana gör</h2>
            </div>
            <button class="mini-button" type="button" data-compare-close>Kapat</button>
          </header>
          <div class="compare-list" data-compare-list></div>
          <footer>
            <button class="button button-secondary-dark" type="button" data-compare-clear>Listeyi temizle</button>
            <a class="button button-primary" href="products.html">Daha fazla ürün</a>
          </footer>
        </div>
      </aside>
      <aside class="quick-view-drawer" data-quick-view-drawer aria-label="Hızlı ürün görüntüleme">
        <button class="drawer-backdrop" type="button" data-quick-view-close aria-label="Hızlı bakışı kapat"></button>
        <div class="quick-view__panel" data-quick-view-panel></div>
      </aside>
      <div class="cookie-consent" data-cookie-consent>
        <div class="cookie-consent__icon" aria-hidden="true">C</div>
        <p>Alışveriş deneyimini iyileştirmek için yasal düzenlemelere uygun çerezler kullanıyoruz.</p>
        <button type="button" data-cookie-accept>Kabul et</button>
      </div>
      <div class="toast" data-toast role="status" aria-live="polite"></div>
      <nav class="mobile-sticky-nav" aria-label="Mobil hızlı menü">
        <button type="button" data-mobile-nav-open>Menü</button>
        <button type="button" data-search-open>Ara</button>
        <a href="products.html">Shop</a>
        <button type="button" data-wishlist-open>Favori</button>
        <button type="button" data-compare-open>Karşılaştır <span data-compare-count>0</span></button>
        <button type="button" data-cart-open>Sepet <span data-cart-count>0</span></button>
      </nav>
      <button class="back-to-top" type="button" data-back-top aria-label="Back to top">
        <span>↑</span>
      </button>
    `
  );
  injectPremiumFooter();
  if (localStorage.getItem(STORAGE_KEYS.cookieConsent) === "accepted") {
    qs("[data-cookie-consent]")?.classList.add("is-hidden");
  }
  renderCart();
  renderWishlist();
  renderCompareDrawer();
}

function applySettings(settings) {
  if (!settings) {
    return;
  }

  qsa("[data-brand-name]").forEach((node) => {
    node.textContent = settings.brandName || "Threon";
  });

  const heroTitle = qs("[data-hero-title]");
  const heroSubtitle = qs("[data-hero-subtitle]");
  const heroTagline = qs("[data-hero-tagline]");
  const heroImage = qs("[data-hero-image]");
  if (heroTitle) heroTitle.textContent = settings.heroTitle || settings.brandName || "Threon";
  if (heroSubtitle) heroSubtitle.textContent = settings.heroSubtitle || "";
  if (heroTagline) heroTagline.textContent = settings.tagline || "";
  if (heroImage && settings.heroImage) heroImage.src = settings.heroImage;
  qsa("[data-announcement]").forEach((node) => {
    node.textContent = settings.announcement || "";
  });

  const contactEmail = qs("[data-contact-email]");
  const contactPhone = qs("[data-contact-phone]");
  const contactAddress = qs("[data-contact-address]");
  if (contactEmail) {
    contactEmail.textContent = settings.contactEmail || "";
    contactEmail.href = `mailto:${settings.contactEmail || ""}`;
  }
  if (contactPhone) {
    contactPhone.textContent = settings.phone || "";
    contactPhone.href = `tel:${String(settings.phone || "").replace(/[^+0-9]/g, "")}`;
  }
  if (contactAddress) contactAddress.textContent = settings.address || "";
  applySeoAndTracking(settings);
  renderLimitedDrop(settings);
  applyHomeSectionOrder(settings);
}

function initPwaShell() {
  if (!qs('link[rel="manifest"]')) {
    const manifest = document.createElement("link");
    manifest.rel = "manifest";
    manifest.href = "manifest.webmanifest";
    document.head.appendChild(manifest);
  }
  setMetaContent("theme-color", "#111111");
  if ("caches" in window) {
    caches.keys().then((keys) => {
      keys
        .filter((key) => key.startsWith("threon-") && key !== "threon-perf-v42")
        .forEach((key) => caches.delete(key));
    }).catch(() => {});
  }
  if ("serviceWorker" in navigator && location.hostname !== "") {
    navigator.serviceWorker.register("service-worker.js?v=threon-perf-42").catch(() => {});
  }
}

function initCommon() {
  setupGlobalImageFallback();
  setupDeferredProductHoverImages();
  redirectFallbackCleanRoute();
  const header = qs("[data-header]");
  const nav = qs("[data-nav]");
  const menuToggle = qs("[data-menu-toggle]");
  const year = qs("[data-year]");
  state.cart = readCart();
  state.wishlist = readWishlist();
  state.compare = readCompare();
  state.customer = readStoredCustomer();
  initPwaShell();
  setupMainMenu();
  injectCartDrawer();
  renderCustomerIndicators();
  setupTurkishPhoneInputs();

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  if (header) {
    const syncHeader = () => {
      header.classList.toggle("is-scrolled", window.scrollY > 18);
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100));
      qs("[data-scroll-progress]")?.style.setProperty("--scroll-progress", `${progress}%`);
      qs("[data-back-top]")?.classList.toggle("is-visible", window.scrollY > 700);
    };
    syncHeader();
    window.addEventListener("scroll", syncHeader, { passive: true });
  }

  if (menuToggle && nav && header) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!isOpen));
      nav.classList.toggle("is-open", !isOpen);
      header.classList.toggle("is-open", !isOpen);
      document.body.classList.toggle("nav-open", !isOpen);
    });

    nav.addEventListener("click", (event) => {
      const link = event.target.closest("a");
      if (link) {
        menuToggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("is-open");
        header.classList.remove("is-open");
        document.body.classList.remove("nav-open");
      }
    });
  }

  const current = location.pathname.split("/").pop() || "index.html";
  qsa("[data-nav] a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href === current) {
      link.classList.add("is-active");
    }
  });

  qs("[data-newsletter-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = event.currentTarget.querySelector("input");
    if (input) input.value = "";
    event.currentTarget.insertAdjacentHTML("afterend", '<p class="form-status">Kaydınız alındı.</p>');
  });

  document.addEventListener("input", (event) => {
    if (event.target.matches("[data-global-search]")) {
      renderSearchResults(event.target.value);
    }
  });

  document.addEventListener("click", (event) => {
    const cartOpen = event.target.closest("[data-cart-open]");
    if (cartOpen) {
      openCart();
      return;
    }

    if (event.target.closest("[data-cart-close]")) {
      closeCart();
      return;
    }

    if (event.target.closest("[data-search-open]")) {
      event.preventDefault();
      openSearch();
      return;
    }

    if (event.target.closest("[data-search-close]")) {
      closeSearch();
      return;
    }

    if (event.target.closest("[data-wishlist-open]")) {
      event.preventDefault();
      openWishlist();
      return;
    }

    if (event.target.closest("[data-wishlist-close]")) {
      closeWishlist();
      return;
    }

    if (event.target.closest("[data-compare-open]")) {
      event.preventDefault();
      openCompare();
      return;
    }

    if (event.target.closest("[data-compare-close]")) {
      closeCompare();
      return;
    }

    if (event.target.closest("[data-compare-clear]")) {
      saveCompare([]);
      showToast("Karşılaştırma listesi temizlendi.");
      return;
    }

    const compareToggle = event.target.closest("[data-compare-toggle]");
    if (compareToggle) {
      event.preventDefault();
      toggleCompare(compareToggle.dataset.compareToggle);
      return;
    }

    const compareRemove = event.target.closest("[data-compare-remove]");
    if (compareRemove) {
      saveCompare(state.compare.filter((id) => id !== compareRemove.dataset.compareRemove));
      showToast("Karşılaştırmadan kaldırıldı.");
      return;
    }

    const quickView = event.target.closest("[data-quick-view]");
    if (quickView) {
      event.preventDefault();
      openQuickView(quickView.dataset.quickView);
      return;
    }

    if (event.target.closest("[data-quick-view-close]")) {
      closeQuickView();
      return;
    }

    const wishlistToggle = event.target.closest("[data-wishlist-toggle]");
    if (wishlistToggle) {
      event.preventDefault();
      toggleWishlist(wishlistToggle.dataset.wishlistToggle);
      return;
    }

    const wishlistRemove = event.target.closest("[data-wishlist-remove]");
    if (wishlistRemove) {
      saveWishlist(state.wishlist.filter((id) => id !== wishlistRemove.dataset.wishlistRemove));
      showToast("Favorilerden kaldırıldı.");
      return;
    }

    if (event.target.closest("[data-cookie-accept]")) {
      localStorage.setItem(STORAGE_KEYS.cookieConsent, "accepted");
      qs("[data-cookie-consent]")?.classList.add("is-hidden");
      return;
    }

    if (event.target.closest("[data-back-top]")) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (event.target.closest("[data-mobile-nav-open]")) {
      const nav = qs("[data-nav]");
      const header = qs("[data-header]");
      const toggle = qs("[data-menu-toggle]");
      toggle?.setAttribute("aria-expanded", "true");
      nav?.classList.add("is-open");
      header?.classList.add("is-open");
      document.body.classList.add("nav-open");
      return;
    }

    const cartRecommend = event.target.closest("[data-cart-recommend]");
    if (cartRecommend) {
      event.preventDefault();
      addToCart(cartRecommend.dataset.cartRecommend);
      return;
    }

    const quickSize = event.target.closest("[data-quick-size]");
    if (quickSize) {
      event.preventDefault();
      const panel = quickSize.closest(".product-card__quick");
      qsa("[data-quick-size]", panel).forEach((button) => button.classList.remove("is-selected"));
      quickSize.classList.add("is-selected");
      return;
    }

    const cardAdd = event.target.closest("[data-add-card]");
    if (cardAdd) {
      event.preventDefault();
      const panel = cardAdd.closest(".product-card__quick");
      const selectedSize = qs(".quick-size.is-selected", panel)?.dataset.quickSize || "";
      addToCart(cardAdd.dataset.addCard, { size: selectedSize });
      return;
    }

    const detailAdd = event.target.closest("[data-add-detail]");
    if (detailAdd) {
      event.preventDefault();
      addToCart(detailAdd.dataset.addDetail, {
        size: qs(".size-chip.is-selected")?.dataset.optionValue || "",
        color: qs(".color-chip.is-selected")?.dataset.optionValue || ""
      });
      return;
    }

    const quickViewAdd = event.target.closest("[data-add-quick-view]");
    if (quickViewAdd) {
      event.preventDefault();
      const panel = quickViewAdd.closest("[data-quick-view-panel]");
      addToCart(quickViewAdd.dataset.addQuickView, {
        size: qs(".size-chip.is-selected", panel)?.dataset.optionValue || "",
        color: qs(".color-chip.is-selected", panel)?.dataset.optionValue || ""
      });
      closeQuickView();
      return;
    }

    const galleryThumb = event.target.closest("[data-gallery-thumb]");
    if (galleryThumb) {
      const main = qs("[data-gallery-main]");
      if (main) main.src = galleryThumb.dataset.galleryThumb;
      qsa("[data-gallery-thumb]").forEach((button) => button.classList.remove("is-active"));
      galleryThumb.classList.add("is-active");
      return;
    }

    if (event.target.closest("[data-size-guide]")) {
      qs("[data-size-modal]")?.classList.add("is-open");
      return;
    }

    if (event.target.closest("[data-size-close]")) {
      qs("[data-size-modal]")?.classList.remove("is-open");
      return;
    }

    const notifyStock = event.target.closest("[data-notify-stock]");
    if (notifyStock) {
      event.preventDefault();
      const panel = notifyStock.closest(".purchase-panel") || document;
      saveNotifyRequest(
        notifyStock.dataset.notifyStock,
        qs(".size-chip.is-selected", panel)?.dataset.optionValue || "",
        qs(".color-chip.is-selected", panel)?.dataset.optionValue || ""
      );
      return;
    }

    const optionButton = event.target.closest("[data-option-value]");
    if (optionButton) {
      const group = optionButton.closest("[data-option-group]");
      qsa("[data-option-value]", group).forEach((button) => button.classList.remove("is-selected"));
      optionButton.classList.add("is-selected");
      syncVariantStatus(optionButton.closest(".purchase-panel") || document);
      return;
    }

    const cartPlus = event.target.closest("[data-cart-plus]");
    if (cartPlus) {
      updateCartQuantity(cartPlus.dataset.cartPlus, 1);
      return;
    }

    const cartMinus = event.target.closest("[data-cart-minus]");
    if (cartMinus) {
      updateCartQuantity(cartMinus.dataset.cartMinus, -1);
      return;
    }

    const cartRemove = event.target.closest("[data-cart-remove]");
    if (cartRemove) {
      removeCartLine(cartRemove.dataset.cartRemove);
    }
  });

  const revealItems = qsa("[data-reveal]");
  if (!revealItems.length) return;
  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.16 }
  );
  revealItems.forEach((item) => observer.observe(item));
}

function initHeroCarousel() {
  const carousel = qs("[data-hero-carousel]");
  if (!carousel) return;
  if (carousel.dataset.heroReady === "true") return;
  const slides = qsa("[data-hero-slide]", carousel);
  const controlsRoot = qs(".lofi-hero__controls", carousel);
  const dotsRoot = qs("[data-hero-dots]", carousel);
  if (slides.length < 2) {
    if (controlsRoot) controlsRoot.hidden = true;
    if (dotsRoot) dotsRoot.hidden = true;
    return;
  }
  if (controlsRoot) controlsRoot.hidden = false;
  if (dotsRoot) dotsRoot.hidden = false;
  carousel.dataset.heroReady = "true";

  qsa("[data-fallback-image]", carousel).forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const fallback = image.dataset.fallbackImage;
        if (fallback && image.src !== fallback) {
          image.src = fallback;
        }
      },
      { once: true }
    );
  });

  const prevButton = qs("[data-hero-prev]", carousel);
  const nextButton = qs("[data-hero-next]", carousel);
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains("is-active")));
  let timerId = null;

  if (dotsRoot && !dotsRoot.children.length) {
    dotsRoot.innerHTML = slides
      .map(
        (_, index) =>
          `<button class="lofi-hero__dot" type="button" data-hero-dot="${index}" aria-label="${index + 1}. kampanya görseli"></button>`
      )
      .join("");
  }

  const dots = qsa("[data-hero-dot]", carousel);
  const render = (index) => {
    activeIndex = (index + slides.length) % slides.length;
    slides.forEach((slide, slideIndex) => {
      const isActive = slideIndex === activeIndex;
      slide.classList.toggle("is-active", isActive);
      slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      slide.tabIndex = isActive ? 0 : -1;
    });
    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("is-active", dotIndex === activeIndex);
      dot.setAttribute("aria-current", dotIndex === activeIndex ? "true" : "false");
    });
  };

  const stop = () => {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  };

  const start = () => {
    stop();
    if (prefersReducedMotion) return;
    timerId = window.setInterval(() => render(activeIndex + 1), 5200);
  };

  prevButton?.addEventListener("click", () => {
    render(activeIndex - 1);
    start();
  });
  nextButton?.addEventListener("click", () => {
    render(activeIndex + 1);
    start();
  });
  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      render(Number(dot.dataset.heroDot || 0));
      start();
    });
  });
  carousel.addEventListener("mouseenter", stop);
  carousel.addEventListener("mouseleave", start);
  carousel.addEventListener("focusin", stop);
  carousel.addEventListener("focusout", start);

  render(activeIndex);
  start();
}

async function initHome() {
  const root = qs("[data-featured-products]");
  const studioRoot = qs("[data-studio-products]");
  const dynamicRoot = qs("[data-dynamic-collections] .dynamic-collection-grid");
  if (!root && !studioRoot && !dynamicRoot && !qs("[data-hero-carousel]")) return;
  try {
    const data = await fetchSite();
    renderVisualSlots(data.settings);
    initHeroCarousel();
    const products = data.products.slice(0, 8);
    const studioProducts = data.products.slice(2, 8);
    if (root) {
      root.innerHTML = products.length
        ? products.map(productCard).join("")
        : '<div class="empty-state">Henüz yayında ürün yok.</div>';
    }
    if (studioRoot) {
      studioRoot.innerHTML = (studioProducts.length ? studioProducts : data.products)
        .slice(0, 6)
        .map(productCard)
        .join("");
    }
    if (dynamicRoot) {
      const shelves = dynamicShelves(data.settings).map((shelf) => ({
        ...shelf,
        products: productsForDynamicShelf(shelf, data.products)
      }));
      dynamicRoot.innerHTML = shelves
        .map(
          (shelf) => `
            <article class="dynamic-collection-card">
              <span>${escapeHtml(shelf.label || DYNAMIC_SHELF_MODES[shelf.mode] || "Canlı raf")}</span>
              <strong>${shelf.products.length} parça</strong>
              <div>${shelf.products
                .slice(0, 3)
                .map((product) => `<a href="${productUrl(product)}">${escapeHtml(product.name)}</a>`)
                .join("")}</div>
              <a class="dynamic-collection-card__all" href="${categoryUrl(shelf.category || "all", shelf.subcategory || "all")}">${escapeHtml(shelf.title)}</a>
            </article>
          `
        )
        .join("");
    }
  } catch (error) {
    if (root) root.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (studioRoot) studioRoot.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    if (dynamicRoot) dynamicRoot.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderCategoryTabs(products) {
  const tabs = qs("[data-category-tabs]");
  if (!tabs) return;
  const categories = ["all", ...categoryKeys()];
  tabs.innerHTML = categories
    .map((category) => {
      const label = category === "all" ? "Tüm ürünler" : category;
      const count = category === "all" ? products.length : products.filter((product) => productMatchesCategory(product, category)).length;
      const active = category === state.activeCategory ? " is-active" : "";
      return `<button class="category-tab${active}" type="button" data-category="${escapeHtml(category)}"><span>${escapeHtml(label)}</span><em>${count}</em></button>`;
    })
    .join("");
}

function renderSubcategoryTabs(products) {
  const tabs = qs("[data-subcategory-tabs]");
  if (!tabs) return;
  if (state.activeCategory === "all" || !CATEGORY_TREE[state.activeCategory]) {
    tabs.hidden = true;
    tabs.innerHTML = "";
    return;
  }
  tabs.hidden = false;
  const subcategories = ["all", ...CATEGORY_TREE[state.activeCategory]];
  tabs.innerHTML = subcategories
    .map((subcategory) => {
      const label = subcategory === "all" ? `Tüm ${state.activeCategory}` : subcategory;
      const count =
        subcategory === "all"
          ? products.filter((product) => productMatchesCategory(product, state.activeCategory)).length
          : products.filter((product) => productMatchesCategory(product, state.activeCategory, subcategory)).length;
      const active = subcategory === state.activeSubcategory ? " is-active" : "";
      return `<button class="subcategory-tab${active}" type="button" data-subcategory="${escapeHtml(subcategory)}"><span>${escapeHtml(label)}</span><em>${count}</em></button>`;
    })
    .join("");
}

function renderShopCategoryStrip(products) {
  const root = qs("[data-shop-category-strip]");
  if (!root) return;
  root.innerHTML = categoryKeys()
    .map((category) => {
      const categoryProducts = products.filter((product) => productMatchesCategory(product, category));
      const hero = categoryProducts.find((product) => product.featured) || categoryProducts[0] || products[0] || {};
      const subcategoryPreview = CATEGORY_TREE[category].slice(0, 4).join(" / ");
      return `
        <a href="${categoryUrl(category)}">
          <img src="${escapeHtml(hero.image || CATEGORY_IMAGES[category] || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(category)}" />
          <span>${escapeHtml(category)}</span>
          <em>${categoryProducts.length} ürün</em>
          <small>${escapeHtml(subcategoryPreview)}</small>
        </a>
      `;
    })
    .join("");
}

function sortedProducts(products) {
  const items = [...products];
  if (state.productSort === "price-asc") {
    return items.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
  }
  if (state.productSort === "price-desc") {
    return items.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
  }
  if (state.productSort === "newest") {
    return items.reverse();
  }
  return items.sort(
    (a, b) =>
      productMerchandisingScore(b) - productMerchandisingScore(a) ||
      Number(Boolean(b.featured)) - Number(Boolean(a.featured))
  );
}

function renderCatalogFilters(products) {
  const panel = qs("[data-catalog-filters]");
  if (!panel) return;
  const maxPrice = Math.max(...products.map((product) => Number(product.price) || 0), 0);
  const sizes = [...new Set(products.flatMap((product) => product.sizes || []).filter(Boolean))];
  const colors = [...new Set(products.flatMap((product) => product.colors || []).filter(Boolean))];
  const sizeSelect = qs("[data-filter-size]");
  const colorSelect = qs("[data-filter-color]");
  const genderSelect = qs("[data-filter-gender]");
  const priceInput = qs("[data-filter-price]");
  const priceLabel = qs("[data-filter-price-label]");

  if (!state.catalogFilters.maxPrice) {
    state.catalogFilters.maxPrice = maxPrice;
  }
  if (sizeSelect) {
    sizeSelect.innerHTML = [
      '<option value="all">Tüm bedenler</option>',
      ...sizes.map((size) => `<option value="${escapeHtml(size)}">${escapeHtml(size)}</option>`)
    ].join("");
    sizeSelect.value = state.catalogFilters.size;
  }
  if (colorSelect) {
    colorSelect.innerHTML = [
      '<option value="all">Tüm renkler</option>',
      ...colors.map((color) => `<option value="${escapeHtml(color)}">${escapeHtml(color)}</option>`)
    ].join("");
    colorSelect.value = state.catalogFilters.color;
  }
  if (genderSelect) {
    genderSelect.innerHTML = GENDER_FILTER_OPTIONS.map(
      ([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`
    ).join("");
    genderSelect.value = normalizeGenderFilter(state.catalogFilters.gender);
  }
  if (priceInput) {
    priceInput.max = String(Math.max(500, Math.ceil(maxPrice / 50) * 50));
    priceInput.value = String(state.catalogFilters.maxPrice || maxPrice);
  }
  if (priceLabel) {
    priceLabel.textContent = formatPrice({ price: state.catalogFilters.maxPrice || maxPrice, currency: "TRY" });
  }
  const saleToggle = qs("[data-filter-sale]");
  const stockToggle = qs("[data-filter-stock]");
  if (saleToggle) saleToggle.checked = state.catalogFilters.saleOnly;
  if (stockToggle) stockToggle.checked = state.catalogFilters.inStock;
}

function resetCatalogFilters(products) {
  state.catalogFilters = {
    saleOnly: false,
    inStock: true,
    size: "all",
    color: "all",
    gender: "all",
    maxPrice: Math.max(...products.map((product) => Number(product.price) || 0), 0)
  };
  state.catalogVisible = state.catalogPageSize;
  renderCatalogFilters(products);
}

function renderCatalog(products) {
  const grid = qs("[data-products-grid]");
  const searchInput = qs("[data-product-search]");
  const countNode = qs("[data-product-count]");
  if (!grid) return;
  const query = (searchInput?.value || "").trim().toLowerCase();
  const filters = state.catalogFilters;
  const filtered = products.filter((product) => {
    const categoryMatch = productMatchesCategory(product, state.activeCategory, state.activeSubcategory);
    const { hasSale } = priceMeta(product);
    const saleMatch = !filters.saleOnly || hasSale;
    const stockMatch = !filters.inStock || productAvailableStock(product) > 0;
    const sizeMatch = filters.size === "all" || (product.sizes || []).includes(filters.size);
    const colorMatch = filters.color === "all" || (product.colors || []).includes(filters.color);
    const genderMatch = productMatchesGender(product, filters.gender);
    const priceMatch = !filters.maxPrice || Number(product.price || 0) <= Number(filters.maxPrice);
    const haystack = `${product.name} ${categoryDisplay(product)} ${productSummaryText(product)} ${productDescriptionText(product)} ${(product.colors || []).join(" ")}`.toLowerCase();
    return categoryMatch && saleMatch && stockMatch && sizeMatch && colorMatch && genderMatch && priceMatch && (!query || haystack.includes(query));
  });

  const sorted = sortedProducts(filtered);
  const visibleProducts = sorted.slice(0, state.catalogVisible);
  const hasMore = visibleProducts.length < sorted.length;
  grid.innerHTML = filtered.length
    ? [
        ...visibleProducts.map(productCard),
        hasMore
          ? `<div class="catalog-load-more">
              <button class="button button-secondary-dark" type="button" data-load-more-products>
                Daha fazla ürün göster
                <span>${visibleProducts.length}/${sorted.length}</span>
              </button>
            </div>`
          : ""
      ].join("")
    : '<div class="empty-state">Bu filtreye uygun ürün bulunamadı.</div>';
  if (countNode) {
    const categoryText =
      state.activeCategory === "all"
        ? "tüm kategoriler"
        : state.activeSubcategory === "all"
          ? state.activeCategory
          : `${state.activeCategory} / ${state.activeSubcategory}`;
    countNode.textContent = hasMore
      ? `${visibleProducts.length}/${filtered.length} ürün ${categoryText} içinde gösteriliyor`
      : `${filtered.length} ürün ${categoryText} içinde gösteriliyor`;
  }
}

async function initCatalog() {
  const grid = qs("[data-products-grid]");
  if (!grid) return;
  try {
    const data = await fetchSite();
    renderVisualSlots(data.settings);
    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category") || "";
    const route = categoryParam ? categoryRoute(categoryParam) : routeFromCleanPath();
    const requestedCategory = route.category || categoryAlias(categoryParam);
    const requestedSubcategory = params.get("subcategory")
      ? subcategoryAlias(params.get("subcategory"), requestedCategory)
      : route.subcategory;
    state.activeCategory = requestedCategory || "all";
    state.activeSubcategory = requestedCategory && requestedSubcategory ? requestedSubcategory : "all";
    state.productSort = params.get("sort") || "featured";
    state.catalogFilters.gender = normalizeGenderFilter(params.get("gender") || state.catalogFilters.gender);
    const sortSelect = qs("[data-product-sort]");
    if (sortSelect) sortSelect.value = state.productSort;
    renderShopCategoryStrip(data.products);
    renderCategoryTabs(data.products);
    renderSubcategoryTabs(data.products);
    renderCatalogFilters(data.products);
    renderCatalog(data.products);

    qs("[data-product-search]")?.addEventListener("input", () => {
      state.catalogVisible = state.catalogPageSize;
      renderCatalog(data.products);
    });
    qs("[data-product-sort]")?.addEventListener("change", (event) => {
      state.productSort = event.currentTarget.value || "featured";
      state.catalogVisible = state.catalogPageSize;
      renderCatalog(data.products);
    });
    qs("[data-category-tabs]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.activeCategory = button.dataset.category || "all";
      state.activeSubcategory = "all";
      state.catalogVisible = state.catalogPageSize;
      renderCategoryTabs(data.products);
      renderSubcategoryTabs(data.products);
      renderCatalog(data.products);
    });
    qs("[data-subcategory-tabs]")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-subcategory]");
      if (!button) return;
      state.activeSubcategory = button.dataset.subcategory || "all";
      state.catalogVisible = state.catalogPageSize;
      renderSubcategoryTabs(data.products);
      renderCatalog(data.products);
    });
    qs("[data-catalog-filters]")?.addEventListener("change", (event) => {
      if (event.target.matches("[data-filter-sale]")) state.catalogFilters.saleOnly = event.target.checked;
      if (event.target.matches("[data-filter-stock]")) state.catalogFilters.inStock = event.target.checked;
      if (event.target.matches("[data-filter-size]")) state.catalogFilters.size = event.target.value || "all";
      if (event.target.matches("[data-filter-color]")) state.catalogFilters.color = event.target.value || "all";
      if (event.target.matches("[data-filter-gender]")) state.catalogFilters.gender = normalizeGenderFilter(event.target.value);
      if (event.target.matches("[data-filter-price]")) state.catalogFilters.maxPrice = Number(event.target.value) || 0;
      qs("[data-filter-price-label]").textContent = formatPrice({ price: state.catalogFilters.maxPrice, currency: "TRY" });
      state.catalogVisible = state.catalogPageSize;
      renderCatalog(data.products);
    });
    qs("[data-filter-reset]")?.addEventListener("click", () => {
      resetCatalogFilters(data.products);
      renderCatalog(data.products);
    });
    qs("[data-products-grid]")?.addEventListener("click", (event) => {
      if (!event.target.closest("[data-load-more-products]")) return;
      state.catalogVisible += state.catalogPageSize;
      renderCatalog(data.products);
    });
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderNexFrameCollection(hero, showcase, grid) {
  document.body.classList.add("nexframe-page");
  setNexFrameSeo();
  hero.classList.add("collection-hero--nexframe");
  showcase.classList.add("collection-showcase--nexframe");
  grid.classList.add("nexframe-product-grid");
  hero.innerHTML = `
    <div>
      <p class="eyebrow">${escapeHtml(NEXFRAME_COLLECTION_COPY.badge)}</p>
      <h1>${escapeHtml(NEXFRAME_COLLECTION_COPY.title)}</h1>
      <p>${escapeHtml(NEXFRAME_COLLECTION_COPY.cardDescription)}</p>
      <div class="nexframe-hero__status" aria-label="Kilitli koleksiyon">
        <span>${lockIconSvg("nexframe-lock-icon")}${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</span>
        <em>${escapeHtml(NEXFRAME_COLLECTION_COPY.notice)}</em>
      </div>
      <div class="collection-tabs">
        <a class="is-active" href="${NEXFRAME_COLLECTION_PATH}">${escapeHtml(NEXFRAME_COLLECTION_COPY.title)}</a>
        <a href="/koleksiyon">THREON kapsül</a>
        <a href="/magaza">Tüm ürünler</a>
      </div>
    </div>
    <div class="nexframe-hero-visual" aria-label="Kilitli koleksiyon">
      <span class="nexframe-hero-visual__grid" aria-hidden="true"></span>
      <img class="nexframe-brand-logo nexframe-hero-visual__logo" src="${NEXFRAME_LOGO}" alt="NexFrame AI logosu" loading="lazy" />
      <strong>NEXFRAME</strong>
      ${lockIconSvg("nexframe-hero-lock")}
      <em>${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</em>
    </div>
  `;
  showcase.innerHTML = `
    <article class="nexframe-info-card nexframe-info-card--large">
      <span>${escapeHtml(NEXFRAME_COLLECTION_COPY.badge)}</span>
      <h2>${escapeHtml(NEXFRAME_COLLECTION_COPY.intro)}</h2>
      <p>${escapeHtml(NEXFRAME_COLLECTION_COPY.notice)}</p>
    </article>
    <article class="nexframe-info-card">
      <span>İş birliği</span>
      <h2>THREON üretimi</h2>
      <p>${escapeHtml(NEXFRAME_COLLECTION_COPY.cardDescription)}</p>
    </article>
    <article class="nexframe-info-card">
      <span>Durum</span>
      <h2>${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</h2>
      <p>Ürünler şu anda stok, ödeme ve sepet akışına bağlı değildir.</p>
    </article>
  `;
  grid.innerHTML = NEXFRAME_PRODUCTS.map(lockedProductCard).join("");
}

async function initCollection() {
  const hero = qs("[data-collection-hero]");
  const showcase = qs("[data-collection-showcase]");
  const grid = qs("[data-collection-products]");
  if (!hero || !showcase || !grid) return;
  if (isNexFrameCollectionRequest()) {
    renderNexFrameCollection(hero, showcase, grid);
    fetchSite().then((data) => renderVisualSlots(data.settings)).catch(() => {});
    return;
  }
  try {
    const data = await fetchSite();
    renderVisualSlots(data.settings);
    const params = new URLSearchParams(location.search);
    const categoryParam = params.get("category") || "";
    const route = categoryParam ? categoryRoute(categoryParam) : routeFromCleanPath();
    const activeCategory = route.category || categoryAlias(categoryParam);
    const activeSubcategory = params.get("subcategory")
      ? subcategoryAlias(params.get("subcategory"), activeCategory)
      : route.subcategory;
    const activeGender = normalizeGenderFilter(params.get("gender") || "all");
    const baseProducts = activeCategory
      ? data.products.filter((product) => productMatchesCategory(product, activeCategory, activeSubcategory || "all"))
      : data.products;
    const products = baseProducts.filter((product) => productMatchesGender(product, activeGender));
    const withGender = (url = "", gender = activeGender) => {
      if (gender === "all") return url;
      const [pathname, query = ""] = String(url || "").split("?");
      const nextParams = new URLSearchParams(query);
      nextParams.set("gender", gender);
      const nextQuery = nextParams.toString();
      return nextQuery ? `${pathname}?${nextQuery}` : pathname;
    };
    const heroProduct = products[0] || baseProducts[0] || data.products[0];
    const categoryLinks = categoryKeys()
      .map(
        (category) =>
          `<a class="${category === activeCategory && !activeSubcategory ? "is-active" : ""}" href="${withGender(categoryUrl(category))}">${escapeHtml(category)}</a>`
      )
      .join("");
    const subcategoryLinks = activeCategory
      ? `
        <div class="collection-subtabs">
          <a class="${!activeSubcategory ? "is-active" : ""}" href="${withGender(categoryUrl(activeCategory))}">Tüm ${escapeHtml(activeCategory)}</a>
          ${CATEGORY_TREE[activeCategory]
            .map(
              (subcategory) =>
                `<a class="${subcategory === activeSubcategory ? "is-active" : ""}" href="${withGender(categoryUrl(activeCategory, subcategory))}">${escapeHtml(subcategory)}</a>`
            )
            .join("")}
        </div>
      `
      : "";
    const currentCategoryUrl = activeCategory ? categoryUrl(activeCategory, activeSubcategory || "") : "collection.html";
    const genderLinks = `
      <div class="collection-gender-filter" aria-label="Cinsiyet filtresi">
        ${GENDER_FILTER_OPTIONS.map(([value, label]) => {
          const href = value === "all" ? currentCategoryUrl : withGender(currentCategoryUrl, value);
          const count = value === "all" ? baseProducts.length : baseProducts.filter((product) => productMatchesGender(product, value)).length;
          return `<a class="${value === activeGender ? "is-active" : ""}" href="${escapeHtml(href)}"><span>${escapeHtml(label)}</span><em>${count}</em></a>`;
        }).join("")}
      </div>
    `;
    const activeTitle = activeCategory
      ? activeSubcategory
        ? `${activeCategory} / ${activeSubcategory}`
        : activeCategory
      : "THREON Capsule";

    hero.innerHTML = `
      <div>
        <p class="eyebrow">Kapsül koleksiyon</p>
        <h1>${escapeHtml(activeTitle)}</h1>
        <p>${escapeHtml(activeCategory ? CATEGORY_COPY[activeCategory] || `${activeCategory} koleksiyonundaki premium parçaları keşfet.` : "Sezonun kapsül gardırobunu kategori, kalıp ve renk hikayesine göre keşfet.")}</p>
        <div class="collection-tabs">${categoryLinks}<a href="collection.html">Tüm kapsül</a></div>
        ${subcategoryLinks}
        ${genderLinks}
      </div>
      <img src="${escapeHtml(heroProduct?.image || (activeCategory && CATEGORY_IMAGES[activeCategory]) || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(activeTitle || "THREON koleksiyon")}" />
    `;

    const featured = products.slice(0, 3);
    showcase.innerHTML = featured.length
      ? featured
          .map(
            (product, index) => `
          <article class="collection-feature ${index === 0 ? "collection-feature--large" : ""}">
            <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
            <div>
              <span>${escapeHtml(categoryDisplay(product))}</span>
              <h2>${escapeHtml(product.name)}</h2>
              <p>${escapeHtml(product.fit || productSummaryText(product))}</p>
          <a href="${productUrl(product)}">Ürünü incele</a>
            </div>
          </article>
        `
          )
          .join("")
      : '<div class="empty-state">Bu seçkide henüz ürün yok.</div>';

    state.collectionVisible = state.catalogPageSize;
    const renderCollectionGrid = () => {
      const visibleProducts = products.slice(0, state.collectionVisible);
      const hasMore = visibleProducts.length < products.length;
      grid.innerHTML = products.length
        ? [
            ...visibleProducts.map(productCard),
            hasMore
              ? `<div class="catalog-load-more">
                  <button class="button button-secondary-dark" type="button" data-load-more-collection>
                    Daha fazla ürün göster
                    <span>${visibleProducts.length}/${products.length}</span>
                  </button>
                </div>`
              : ""
          ].join("")
        : '<div class="empty-state">Bu koleksiyonda ürün yok.</div>';
    };
    renderCollectionGrid();
    grid.addEventListener("click", (event) => {
      if (!event.target.closest("[data-load-more-collection]")) return;
      state.collectionVisible += state.catalogPageSize;
      renderCollectionGrid();
    });
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

async function initLookbook() {
  const grid = qs("[data-lookbook-products]");
  if (!grid) return;
  try {
    const data = await fetchSite();
    renderVisualSlots(data.settings);
    renderLookbookVisuals(data.settings);
    const products = data.products.filter((product) => product.featured).slice(0, 4);
    grid.innerHTML = (products.length ? products : data.products.slice(0, 4)).map(productCard).join("");
  } catch (error) {
    grid.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function recommendedSize(product = {}, measurements = {}) {
  const sizes = product.sizes?.length ? product.sizes : ["Standart"];
  const height = Number(measurements.height) || 0;
  const weight = Number(measurements.weight) || 0;
  const fit = String(measurements.fit || "regular");
  if (sizes.every((size) => /^\d+$/.test(String(size)))) {
    const numeric = sizes.map(Number).sort((a, b) => a - b);
    const base = weight > 92 ? numeric[numeric.length - 1] : weight > 82 ? numeric[Math.min(numeric.length - 1, 3)] : weight > 72 ? numeric[Math.min(numeric.length - 1, 2)] : numeric[1] || numeric[0];
    return String(base || sizes[0]);
  }
  const order = ["XS", "S", "M", "L", "XL", "XXL"];
  let score = 2;
  if (height < 168 || weight < 58) score = 1;
  if (height > 178 || weight > 76) score = 3;
  if (height > 188 || weight > 92) score = 4;
  if (fit === "slim") score -= 1;
  if (fit === "oversized") score += 1;
  const available = order.filter((size) => sizes.includes(size));
  return available[Math.max(0, Math.min(available.length - 1, score - 1))] || sizes[0] || "Standart";
}

function sizeAdvisorMessage(product = {}, measurements = {}, suggestion = "Standart") {
  const height = Number(measurements.height) || 0;
  const weight = Number(measurements.weight) || 0;
  const fit = String(measurements.fit || "regular");
  const fitText = fit === "slim" ? "daha oturan görünüm" : fit === "oversized" ? "daha bol görünüm" : "rahat günlük görünüm";
  const confidence = height && weight ? Math.max(72, Math.min(96, 88 - Math.abs(height - 178) * 0.25 + Math.abs(weight - 74) * 0.05)) : 72;
  return {
    suggestion,
    confidence: Math.round(confidence),
    note: `${fitText} için ${suggestion} beden önerilir.`,
    detail: product.fit ? `${product.fit} kalıbı dikkate alındı.` : "Ürünün mevcut beden listesi ve ölçü profili dikkate alındı."
  };
}

function renderReviewCards(product = {}) {
  const reviews = productReviews(product);
  if (!reviews.length) {
    return '<div class="empty-state empty-state--small">Bu ürün için henüz onaylı yorum yok. İlk deneyimi sen paylaş.</div>';
  }
  return reviews
    .map(
      (review) =>
        `<article><span>${escapeHtml(review.rating || "5.0")}</span><p>“${escapeHtml(review.text || "")}”</p><strong>${escapeHtml(review.author || "THREON müşteri")}${review.verified ? " · doğrulanmış" : ""}</strong></article>`
    )
    .join("");
}

function renderNexFrameProductDetail(root, product, relatedProducts = []) {
  document.body.classList.add("nexframe-page", "nexframe-product-page");
  setNexFrameSeo(product);
  const related = (relatedProducts.length ? relatedProducts : NEXFRAME_PRODUCTS.filter((item) => item.id !== product.id)).slice(0, 3);
  root.innerHTML = `
    <div class="nexframe-detail">
      <section class="nexframe-detail__media" aria-label="Bu ürün henüz satışa açık değil">
        <span class="nexframe-product-card__pattern" aria-hidden="true"></span>
        <img class="nexframe-brand-logo nexframe-detail__logo" src="${NEXFRAME_LOGO}" alt="NexFrame AI logosu" loading="lazy" />
        <span class="nexframe-product-card__brand" aria-hidden="true">NEXFRAME</span>
        <span class="nexframe-product-card__type">${escapeHtml(product.placeholderType || "Merch")}</span>
        <span class="nexframe-lock-overlay">
          ${lockIconSvg("nexframe-lock-icon")}
          <strong>Kilitli</strong>
          <em>${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</em>
        </span>
      </section>
      <section class="nexframe-detail__content">
        <div class="product-detail__meta">
          <span class="pill pill-strong">${escapeHtml(NEXFRAME_COLLECTION_COPY.badge)}</span>
          <span class="pill">${escapeHtml(NEXFRAME_COLLECTION_COPY.status)}</span>
        </div>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-detail__summary">${escapeHtml(NEXFRAME_COLLECTION_COPY.productDescription)}</p>
        ${productPriceBlock(product, "detail")}
        <div class="nexframe-detail__notice">
          ${lockIconSvg("nexframe-lock-icon")}
          <div>
            <strong>Bu koleksiyon henüz satışa açılmadı.</strong>
            <p>NexFrame Merch ürünleri çok yakında THREON’da satışa sunulacak.</p>
          </div>
        </div>
        <div class="purchase-panel purchase-panel--locked" aria-label="Bu ürün henüz satışa açık değil">
          <button class="button button-dark" type="button" disabled aria-disabled="true">Sepete Eklenemez</button>
          <a class="button button-secondary-dark" href="${NEXFRAME_COLLECTION_PATH}">Koleksiyona dön</a>
          <a class="button button-secondary-dark" href="/magaza">THREON ürünlerini incele</a>
        </div>
      </section>
    </div>
    <section class="section related-products nexframe-related">
      <div class="section-heading section-heading--shop">
        <p class="eyebrow">${escapeHtml(NEXFRAME_COLLECTION_COPY.badge)}</p>
        <h2>Yakında satışta olacak parçalar.</h2>
        <a href="${NEXFRAME_COLLECTION_PATH}">Tüm koleksiyon</a>
      </div>
      <div class="product-grid nexframe-product-grid">${related.map(lockedProductCard).join("")}</div>
    </section>
  `;
}

async function initProductDetail() {
  const root = qs("[data-product-detail]");
  if (!root) return;
  try {
    const params = new URLSearchParams(location.search);
    const pathProductMatch = location.pathname.match(/\/urun\/([^/]+)$/);
    const key = params.get("slug") || params.get("id") || (pathProductMatch ? decodeURIComponent(pathProductMatch[1]) : "");
    const detail = await fetchProductDetail(key);
    const product = detail.product;
    const relatedProducts = Array.isArray(detail.related) ? detail.related : [];
    if (detail.settings) applySettings(detail.settings);

    if (!product) {
      root.innerHTML = '<div class="empty-state">Ürün bulunamadı.</div>';
      return;
    }

    if (isNexFrameProduct(product)) {
      renderNexFrameProductDetail(root, product, relatedProducts);
      return;
    }

    setProductSeo(product);
    const features = productFeatureItems(product)
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
    const sizes = (product.sizes || [])
      .map(
        (item, index) =>
          `<button class="size-chip${index === 0 ? " is-selected" : ""}" type="button" data-option-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`
      )
      .join("");
    const colors = (product.colors || [])
      .map(
        (item, index) =>
          `<button class="color-chip${index === 0 ? " is-selected" : ""}" type="button" data-option-value="${escapeHtml(item)}">${escapeHtml(item)}</button>`
      )
      .join("");
    const reviews = productReviews(product);
    const specs = Object.entries(product.specs || {})
      .map(([key, value]) => [cleanDetailText(key, 80), cleanDetailText(value, 180)])
      .filter(([key, value]) => key && value)
      .map(
        ([key, value]) => `
          <div>
            <dt>${escapeHtml(key)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `
      )
      .join("");
    const gallery = [...new Set([product.image, ...(product.gallery || [])].filter(Boolean))];
    const mainCategory = productMainCategory(product);
    const subcategory = productSubcategory(product);
    const related = recommendedProductsFor(product, [...relatedProducts, ...getProductsFromState()], 4);

    root.innerHTML = `
      <div class="product-detail__media product-gallery">
        <img class="product-gallery__main" src="${escapeHtml(gallery[0] || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" data-gallery-main style="${escapeHtml(productImageStyle(product))}" />
        <div class="product-gallery__thumbs">
          ${gallery
            .map(
              (image, index) =>
                `<button class="${index === 0 ? "is-active" : ""}" type="button" data-gallery-thumb="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.name)} görsel ${index + 1}" style="${escapeHtml(productImageStyle(product))}" /></button>`
            )
            .join("")}
        </div>
      </div>
      <div class="product-detail__content">
        <div class="product-detail__meta">
          <span class="pill">${escapeHtml(mainCategory || product.category || "THREON")}</span>
          ${subcategory ? `<span class="pill">${escapeHtml(subcategory)}</span>` : ""}
          ${product.badge ? `<span class="pill pill-strong">${escapeHtml(product.badge)}</span>` : ""}
        </div>
        <h1>${escapeHtml(product.name)}</h1>
        <p class="product-detail__summary">${escapeHtml(productSummaryText(product))}</p>
        ${productPriceBlock(product, "detail")}
        <p class="product-detail__description">${escapeHtml(productDescriptionText(product))}</p>
        <div class="purchase-panel">
          <div>
            <span>Beden</span>
            <div class="size-row" data-option-group>${sizes || '<button class="size-chip is-selected" type="button" data-option-value="Standart">Standart</button>'}</div>
          </div>
          <div>
            <span>Renk</span>
            <div class="color-row" data-option-group>${colors || '<button class="color-chip is-selected" type="button" data-option-value="Tek renk">Tek renk</button>'}</div>
          </div>
          <div class="product-service-grid">
            <span>${escapeHtml(cleanDetailText(product.fit, 120) || "Premium rahat kalıp")}</span>
            <span>${escapeHtml(cleanDetailText(product.modelInfo, 160) || "Beden bilgisi admin panelinden eklenebilir.")}</span>
            <span>${escapeHtml(product.shippingNote || "1500 TL üzeri ücretsiz kargo.")}</span>
          </div>
          <div class="variant-stock-note" data-variant-status data-product-id="${escapeHtml(product.id)}">
            ${escapeHtml(variantStatusText(product, product.sizes?.[0], product.colors?.[0]))}
          </div>
          <button class="button button-dark" type="button" data-add-detail="${escapeHtml(product.id)}">Sepete ekle</button>
          <button class="button button-secondary-dark" type="button" data-notify-stock="${escapeHtml(product.id)}">Stok bildirimi al</button>
          <button class="button button-secondary-dark" type="button" data-compare-toggle="${escapeHtml(product.id)}">Karşılaştır</button>
          <button class="button button-secondary-dark" type="button" data-size-guide>Beden rehberi</button>
        </div>
        <div class="size-advisor" data-size-advisor>
          <div>
            <p class="eyebrow">Beden önerici</p>
            <h2>Sana en yakın bedeni bul.</h2>
          </div>
          <form data-size-advisor-form>
            <label><span>Boy</span><input name="height" type="number" min="120" max="230" placeholder="178" required /></label>
            <label><span>Kilo</span><input name="weight" type="number" min="35" max="180" placeholder="74" required /></label>
            <label>
              <span>Fit tercihi</span>
              <select name="fit">
                <option value="regular">Rahat / normal</option>
                <option value="slim">Daha oturan</option>
                <option value="oversized">Daha bol</option>
              </select>
            </label>
            <button class="mini-button" type="submit">Öner</button>
          </form>
          <p data-size-advisor-result>Boy, kilo ve fit tercihini girince öneri burada görünür.</p>
        </div>
        <div class="product-premium-strip">
          <article>
            <span>01</span>
            <strong>Güvenli ödeme</strong>
            <p>Kart, havale ve üye sipariş takibi tek akışta.</p>
          </article>
          <article>
            <span>02</span>
            <strong>Premium teslimat</strong>
            <p>Korumalı paketleme ve sıralı adres seçimi.</p>
          </article>
          <article>
            <span>03</span>
            <strong>14 gün iade</strong>
            <p>Her sipariş için net iade ve değişim süreci.</p>
          </article>
        </div>
        <div class="product-accordion">
          <details open>
            <summary>Ürün özellikleri</summary>
            <ul class="feature-list">${features || "<li>Özellikler admin panelinden eklenebilir.</li>"}</ul>
          </details>
          <details>
            <summary>Materyal ve bakım</summary>
            <div class="care-box">
              <p><strong>Materyal:</strong> ${escapeHtml(productMaterialText(product) || "Admin panelinden eklenebilir.")}</p>
              <p><strong>Bakım:</strong> ${escapeHtml(productCareText(product) || "Admin panelinden eklenebilir.")}</p>
              ${product.sku ? `<p><strong>SKU:</strong> ${escapeHtml(product.sku)}</p>` : ""}
            </div>
          </details>
          <details>
            <summary>Detaylar</summary>
            <dl class="spec-list">${specs || "<div><dt>Bilgi</dt><dd>Admin panelinden eklenebilir.</dd></div>"}</dl>
          </details>
        </div>
        <div class="hero-actions">
          <a class="button button-primary" href="products.html">Mağazaya dön</a>
          <a class="button button-secondary-dark" href="contact.html">Beden sor</a>
          <button class="button button-secondary-dark" type="button" data-share-product>Linki kopyala</button>
        </div>
      </div>
      <section class="product-story-panel">
        <div>
          <p class="eyebrow">Atölye notu</p>
          <h2>Temiz günlük siluet için tasarlandı.</h2>
          <p>THREON parçaları tok kumaş, kontrollü hacim ve kapsül gardıropta birlikte çalışan sakin tonlar etrafında kurgulanır.</p>
        </div>
        <div class="product-review-grid" data-review-list>${renderReviewCards(product)}</div>
        <form class="review-form" data-review-form data-product-id="${escapeHtml(product.id)}">
          <div>
            <p class="eyebrow">Yorum bırak</p>
            <h3>Deneyimini paylaş.</h3>
          </div>
          <div class="form-grid">
            <label><span>Ad</span><input name="author" required /></label>
            <label><span>E-posta</span><input name="email" type="email" /></label>
            <label>
              <span>Puan</span>
              <select name="rating">
                <option value="5">5 - Çok iyi</option>
                <option value="4">4 - İyi</option>
                <option value="3">3 - Orta</option>
                <option value="2">2 - Zayıf</option>
                <option value="1">1 - Kötü</option>
              </select>
            </label>
          </div>
          <label><span>Yorum</span><textarea name="text" rows="4" minlength="12" required></textarea></label>
          <button class="button button-secondary-dark" type="submit">Yorumu gönder</button>
          <p class="form-status" data-review-status role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="section related-products">
        <div class="section-heading section-heading--shop">
          <p class="eyebrow">Kombini tamamla</p>
          <h2>Bu parçayla iyi gider.</h2>
          <a href="products.html">Tüm ürünler</a>
        </div>
        <div class="product-grid">${related.map(productCard).join("")}</div>
      </section>
      ${renderRecentProducts(product.id)}
      <div class="size-modal" data-size-modal>
        <button class="size-modal__backdrop" type="button" data-size-close aria-label="Beden rehberini kapat"></button>
        <div class="size-modal__panel">
          <header>
            <div>
              <p class="eyebrow">THREON beden rehberi</p>
              <h2>Beden rehberi</h2>
            </div>
            <button class="mini-button" type="button" data-size-close>Kapat</button>
          </header>
          <table>
            <thead><tr><th>Beden</th><th>Göğüs</th><th>Bel</th><th>Kalıp</th></tr></thead>
            <tbody>
              <tr><td>XS</td><td>84-88</td><td>70-74</td><td>Dar / standart</td></tr>
              <tr><td>S</td><td>88-94</td><td>74-80</td><td>Standart</td></tr>
              <tr><td>M</td><td>94-100</td><td>80-86</td><td>Rahat</td></tr>
              <tr><td>L</td><td>100-108</td><td>86-94</td><td>Bol kesim</td></tr>
              <tr><td>XL</td><td>108-116</td><td>94-102</td><td>Ekstra bol</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="sticky-product-bar">
        <div>
          <span>${escapeHtml(categoryDisplay(product) || "THREON")}</span>
          <strong>${escapeHtml(product.name)}</strong>
        </div>
        <em>${formatPrice(product)}</em>
        <button class="button button-primary" type="button" data-add-detail="${escapeHtml(product.id)}">Sepete ekle</button>
      </div>
    `;
    trackRecentProduct(product.id);
    syncVariantStatus(root);
    qs("[data-size-advisor-form]", root)?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const suggestion = recommendedSize(product, {
        height: formData.get("height"),
        weight: formData.get("weight"),
        fit: formData.get("fit")
      });
      const result = qs("[data-size-advisor-result]", root);
      if (result) {
        const advice = sizeAdvisorMessage(product, {
          height: formData.get("height"),
          weight: formData.get("weight"),
          fit: formData.get("fit")
        }, suggestion);
        result.innerHTML = `
          <strong>Önerilen beden: ${escapeHtml(advice.suggestion)}</strong>
          <span>%${escapeHtml(advice.confidence)} uyum · ${escapeHtml(advice.note)}</span>
          <small>${escapeHtml(advice.detail)}</small>
        `;
      }
      const chip = qsa(".size-chip", root).find((button) => button.dataset.optionValue === suggestion);
      if (chip) {
        qsa(".size-chip", root).forEach((button) => button.classList.remove("is-selected"));
        chip.classList.add("is-selected");
        syncVariantStatus(root);
      }
    });
    qs("[data-review-form]", root)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = qs("[data-review-status]", form);
      const formData = new FormData(form);
      status.textContent = "Yorum gönderiliyor...";
      try {
        const result = await customerApi(`/api/products/${encodeURIComponent(product.id)}/reviews`, {
          method: "POST",
          body: JSON.stringify({
            author: formData.get("author"),
            email: formData.get("email"),
            rating: formData.get("rating"),
            text: formData.get("text")
          })
        });
        form.reset();
        status.textContent = result.message || "Yorum onaya gönderildi.";
      } catch (error) {
        status.textContent = error.message;
      }
    });
    qs("[data-share-product]", root)?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        showToast("Ürün linki kopyalandı.");
      } catch {
        showToast("Ürün linki: " + location.href);
      }
    });
  } catch (error) {
    root.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function initContact() {
  const form = qs("[data-contact-form]");
  const status = qs("[data-form-status]");
  if (!form || !status) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message")
    };
    status.textContent = "Mesaj gönderiliyor...";
    try {
      await fetchJson("/api/contact", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      status.textContent = "Mesajınız alındı. Panelde gelen kutusuna düştü.";
    } catch (error) {
      try {
        const data = await loadFallbackSiteData();
        data.messages = Array.isArray(data.messages) ? data.messages : [];
        data.messages.unshift({
          id: makeLocalId(),
          ...payload,
          read: false,
          createdAt: new Date().toISOString()
        });
        persistLocalAdminData(data);
        form.reset();
        status.textContent = "Mesajınız yerel yedek kayda alındı.";
      } catch {
        status.textContent = "Mesaj kaydedilemedi. Lütfen sunucuyu açıp tekrar deneyin.";
      }
    }
  });
}

function renderCheckout() {
  const root = qs("[data-checkout-summary]");
  const empty = qs("[data-checkout-empty]");
  const form = qs("[data-checkout-form]");
  if (!root) return;
  const totals = checkoutTotals();
  if (!totals.items.length) {
    root.innerHTML = '<div class="empty-state">Sepetin boş. Sipariş vermek için ürün ekle.</div>';
    empty?.classList.remove("is-hidden");
    form?.classList.add("is-disabled");
    return;
  }
  empty?.classList.add("is-hidden");
  form?.classList.remove("is-disabled");
  root.innerHTML = `
    <div class="checkout-lines">
      ${totals.items
        .map(
          (item) => `
            <article class="checkout-line">
              <img src="${escapeHtml(item.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(item.name)}" />
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.size)} · ${escapeHtml(item.color)} · ${item.quantity} adet</p>
              </div>
              <strong>${formatPrice({ price: item.price * item.quantity, currency: item.currency })}</strong>
            </article>
          `
        )
        .join("")}
    </div>
    <dl class="checkout-total-box">
      <div><dt>Ara toplam</dt><dd>${formatPrice({ price: totals.subtotal, currency: "TRY" })}</dd></div>
      ${totals.discount ? `<div><dt>İndirim</dt><dd>-${formatPrice({ price: totals.discount, currency: "TRY" })}</dd></div>` : ""}
      ${totals.bundleDiscount ? `<div><dt>${escapeHtml(BUNDLE_CAMPAIGN.label)}</dt><dd>-${formatPrice({ price: totals.bundleDiscount, currency: "TRY" })}</dd></div>` : ""}
      <div><dt>${escapeHtml(totals.shippingLabel)}</dt><dd>${totals.shipping ? formatPrice({ price: totals.shipping, currency: "TRY" }) : "Ücretsiz"}</dd></div>
      ${totals.giftWrap ? `<div><dt>Hediye paketi</dt><dd>${formatPrice({ price: totals.giftWrap, currency: "TRY" })}</dd></div>` : ""}
      ${totals.paymentFee ? `<div><dt>Kapıda ödeme hizmeti</dt><dd>${formatPrice({ price: totals.paymentFee, currency: "TRY" })}</dd></div>` : ""}
      ${totals.coupon ? `<div><dt>Kupon</dt><dd>${escapeHtml(totals.coupon.label)}</dd></div>` : ""}
      <div><dt>THREON Club puanı</dt><dd>+${Math.floor(totals.total / 100)} puan</dd></div>
      <div><dt>Toplam</dt><dd>${formatPrice({ price: totals.total, currency: "TRY" })}</dd></div>
    </dl>
  `;
}

function setCheckoutFormEnabled(isEnabled) {
  const form = qs("[data-checkout-form]");
  if (!form) return;
  form.classList.toggle("is-disabled", !isEnabled);
  form.setAttribute("aria-disabled", String(!isEnabled));
  qsa("input, select, textarea, button", form).forEach((control) => {
    control.disabled = !isEnabled;
  });
}

function renderCheckoutAccountRequired() {
  const root = qs("[data-checkout-summary]");
  const empty = qs("[data-checkout-empty]");
  const status = qs("[data-checkout-status]");
  const success = qs("[data-order-success]");
  setCheckoutFormEnabled(false);
  empty?.classList.add("is-hidden");
  success?.classList.remove("is-visible");
  if (root) {
    root.innerHTML = `
      <div class="checkout-login-required">
        <span>Üyelik zorunlu</span>
        <strong>Sipariş verebilmek için önce hesabına giriş yapmalısın.</strong>
        <p>THREON Club hesabı ile adreslerini, sipariş geçmişini ve ödeme bilgilerini daha güvenli şekilde yönetebilirsin.</p>
        <div>
          <a class="button button-primary" href="account.html">Giriş yap / Üye ol</a>
          <a class="button button-secondary" href="products.html">Alışverişe dön</a>
        </div>
      </div>
    `;
  }
  if (status) status.textContent = "Sipariş vermek için önce üye girişi yapmalısın.";
}

function fillCheckoutCustomer() {
  const form = qs("[data-checkout-form]");
  const customer = state.customer || readStoredCustomer();
  if (!form || !customer) return;
  if (form.elements.name && !form.elements.name.value) form.elements.name.value = customer.name || "";
  if (form.elements.email && !form.elements.email.value) form.elements.email.value = customer.email || "";
  if (form.elements.phone && (!form.elements.phone.value || form.elements.phone.value === TURKISH_MOBILE_INPUT_PREFIX)) {
    form.elements.phone.value = formatTurkishMobileDisplay(customer.phone || "");
  }
  setupTurkishPhoneInputs(form);
}

function fillSelect(select, values, placeholder) {
  if (!select) return;
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
  ].join("");
}

function fillLocationSelect(select, items, placeholder) {
  if (!select) return;
  select.innerHTML = [
    `<option value="">${escapeHtml(placeholder)}</option>`,
    ...items.map((item) => `<option value="${escapeHtml(item.name)}" data-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
  ].join("");
}

async function fetchLocationItems(endpoint, params = {}) {
  const query = new URLSearchParams({ limit: "1000", ...params });
  const cacheKey = `${endpoint}?${query.toString()}`;
  if (endpoint === "provinces" && locationCache.provinces) return locationCache.provinces;
  if (endpoint === "districts" && locationCache.districts.has(cacheKey)) return locationCache.districts.get(cacheKey);
  if (endpoint === "neighborhoods" && locationCache.neighborhoods.has(cacheKey)) return locationCache.neighborhoods.get(cacheKey);

  const response = await fetch(`${TURKIYE_API_BASE}/${endpoint}?${query.toString()}`);
  if (!response.ok) throw new Error("Adres verisi yüklenemedi.");
  const payload = await response.json();
  const items = Array.isArray(payload.data) ? payload.data : [];
  if (endpoint === "provinces") locationCache.provinces = items;
  if (endpoint === "districts") locationCache.districts.set(cacheKey, items);
  if (endpoint === "neighborhoods") locationCache.neighborhoods.set(cacheKey, items);
  return items;
}

function selectedOptionId(select) {
  return select?.selectedOptions?.[0]?.dataset?.id || "";
}

function initAddressSelectors() {
  const citySelect = qs("[data-city-select]");
  const districtSelect = qs("[data-district-select]");
  const neighborhoodSelect = qs("[data-neighborhood-select]");
  if (!citySelect || !districtSelect || !neighborhoodSelect) return;

  const cities = [...new Set([...TURKEY_PROVINCES, ...Object.keys(TURKEY_LOCATIONS)])].sort((a, b) => a.localeCompare(b, "tr"));
  const syncDistricts = async () => {
    if (!citySelect.value) {
      fillSelect(districtSelect, [], "Önce il seç");
      fillSelect(neighborhoodSelect, [], "Önce ilçe seç");
      districtSelect.disabled = true;
      neighborhoodSelect.disabled = true;
      return;
    }
    districtSelect.disabled = true;
    neighborhoodSelect.disabled = true;
    fillSelect(districtSelect, [], "İlçeler yükleniyor...");
    fillSelect(neighborhoodSelect, [], "Önce ilçe seç");
    const provinceId = selectedOptionId(citySelect);
    try {
      if (!provinceId) throw new Error("Yerel il seçildi.");
      const districts = await fetchLocationItems("districts", { provinceId });
      fillLocationSelect(districtSelect, districts, "İlçe seç");
    } catch {
      const districts = Object.keys(TURKEY_LOCATIONS[citySelect.value] || {});
      fillSelect(districtSelect, districts.length ? districts : DEFAULT_DISTRICTS, "İlçe seç");
    }
    districtSelect.disabled = false;
  };
  const syncNeighborhoods = async () => {
    if (!districtSelect.value) {
      fillSelect(neighborhoodSelect, [], "Önce ilçe seç");
      neighborhoodSelect.disabled = true;
      return;
    }
    neighborhoodSelect.disabled = true;
    fillSelect(neighborhoodSelect, [], "Mahalleler yükleniyor...");
    const provinceId = selectedOptionId(citySelect);
    const districtId = selectedOptionId(districtSelect);
    try {
      if (!provinceId || !districtId) throw new Error("Yerel ilçe seçildi.");
      const neighborhoods = await fetchLocationItems("neighborhoods", { provinceId, districtId });
      fillLocationSelect(neighborhoodSelect, neighborhoods, "Mahalle seç");
    } catch {
      const neighborhoods = TURKEY_LOCATIONS[citySelect.value]?.[districtSelect.value] || DEFAULT_NEIGHBORHOODS;
      fillSelect(neighborhoodSelect, neighborhoods, "Mahalle seç");
    }
    neighborhoodSelect.disabled = false;
  };

  fillSelect(citySelect, cities, "İller yükleniyor...");
  fillSelect(districtSelect, [], "Önce il seç");
  fillSelect(neighborhoodSelect, [], "Önce ilçe seç");
  citySelect.disabled = true;
  districtSelect.disabled = true;
  neighborhoodSelect.disabled = true;

  fetchLocationItems("provinces", { fields: "id,name" })
    .then((provinces) => {
      fillLocationSelect(citySelect, provinces, "İl seç");
    })
    .catch(() => {
      fillSelect(citySelect, cities, "İl seç");
    })
    .finally(() => {
      citySelect.disabled = false;
    });

  citySelect.addEventListener("change", syncDistricts);
  districtSelect.addEventListener("change", syncNeighborhoods);
}

async function initCheckout() {
  await fetchSite();
  if (state.customerToken) {
    try {
      const data = await customerApi("/api/auth/me");
      setCustomerSession(state.customerToken, data.customer);
    } catch {
      setCustomerSession("", null);
    }
  }
  renderCheckout();
  if (!state.customer) {
    renderCheckoutAccountRequired();
    return;
  }
  setCheckoutFormEnabled(Boolean(checkoutTotals().items.length));
  initAddressSelectors();
  fillCheckoutCustomer();
  qsa("[name='shippingMethod']").forEach((input) => {
    input.addEventListener("change", () => {
      state.checkout.shippingMethod = input.value || "standard";
      renderCheckout();
    });
  });
  qsa("[name='paymentMethod'], [name='giftWrap'], [name='invoiceType'], [name='legalConsent'], [name='marketingConsent']").forEach((input) => {
    input.addEventListener("change", renderCheckout);
  });
  qs("[data-coupon-apply]")?.addEventListener("click", () => {
    const input = qs("[data-coupon-input]");
    const status = qs("[data-coupon-status]");
    const code = String(input?.value || "").trim().toUpperCase();
    if (!code) {
      state.checkout.couponCode = "";
      if (status) status.textContent = "";
      renderCheckout();
      return;
    }
    const coupon = findCheckoutCoupon(code, cartTotals().total);
    if (!coupon) {
      state.checkout.couponCode = "";
      if (status) status.textContent = "Kampanya kodu bulunamadı veya koşulları karşılamıyor.";
      renderCheckout();
      return;
    }
    state.checkout.couponCode = coupon.code;
    if (status) status.textContent = `${coupon.label || coupon.code} uygulandı.`;
    renderCheckout();
  });
  qs("[data-checkout-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-checkout-status]");
    if (!state.customer || !state.customerToken) {
      if (status) status.textContent = "Sipariş vermek için önce üye girişi yapmalısın.";
      renderCheckoutAccountRequired();
      return;
    }
    const formData = new FormData(event.currentTarget);
    const totals = checkoutTotals();
    if (!totals.items.length) {
      status.textContent = "Sepetin boş.";
      return;
    }
    const email = formData.get("email");
    const phone = normalizePhoneInput(formData.get("phone"));
    if (!isValidEmailAddress(email)) {
      status.textContent = "Geçerli bir e-posta adresi gir.";
      return;
    }
    if (!isValidTurkishMobileInput(phone)) {
      status.textContent = "Telefon numarası +90 5XXXXXXXXX formatında olmalı.";
      return;
    }
    if (!formData.get("legalConsent")) {
      status.textContent = "Sipariş için mesafeli satış ve KVKK onayını işaretlemelisin.";
      return;
    }
    const payload = {
      items: totals.items,
      paymentMethod: formData.get("paymentMethod"),
      shippingMethod: formData.get("shippingMethod") || state.checkout.shippingMethod,
      couponCode: state.checkout.couponCode,
      giftWrap: Boolean(formData.get("giftWrap")),
      invoiceType: formData.get("invoiceType") || "personal",
      companyName: formData.get("companyName"),
      taxNumber: formData.get("taxNumber"),
      legalConsent: Boolean(formData.get("legalConsent")),
      marketingConsent: Boolean(formData.get("marketingConsent")),
      contact: {
        name: formData.get("name"),
        email,
        phone
      },
      shippingAddress: {
        city: formData.get("city"),
        district: formData.get("district"),
        neighborhood: formData.get("neighborhood"),
        address: formData.get("address"),
        note: formData.get("note")
      }
    };
    status.textContent = "Sipariş oluşturuluyor...";
    try {
      const result = await customerApi("/api/orders", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      saveAddressBookEntry(payload.shippingAddress);
      clearCart();
      renderCheckout();
      trackCommerceEvent("purchase", {
        transaction_id: result.order.number,
        currency: result.order.totals.currency || "TRY",
        value: result.order.totals.total || 0,
        coupon: result.order.couponCode || "",
        items: (result.order.items || []).map((item) => ({
          item_id: item.productId,
          item_name: item.name,
          item_variant: `${item.size} / ${item.color}`,
          price: item.price,
          quantity: item.quantity
        }))
      });
      const success = qs("[data-order-success]");
      if (success) {
        success.classList.add("is-visible");
        success.innerHTML = `
          <span>Sipariş alındı</span>
          <strong>${escapeHtml(result.order.number)}</strong>
          <p>Toplam: ${formatPrice({ price: result.order.totals.total, currency: result.order.totals.currency })}. Sipariş durumunu hesabım sayfasından takip edebilirsin.</p>
          <a class="button button-primary" href="account.html">Hesabıma git</a>
        `;
      }
      status.textContent = "Sipariş başarıyla oluşturuldu.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

function loyaltyTierInfo(points = 0) {
  const tiers = [
    { name: "Yeni Üye", min: 0, next: 20 },
    { name: "Silver Üye", min: 20, next: 60 },
    { name: "Gold Üye", min: 60, next: 120 },
    { name: "Black Üye", min: 120, next: 220 }
  ];
  const current = [...tiers].reverse().find((tier) => points >= tier.min) || tiers[0];
  const next = tiers.find((tier) => tier.min > points);
  const rangeEnd = next?.min || current.next;
  const progress = Math.max(0, Math.min(100, Math.round(((points - current.min) / Math.max(1, rangeEnd - current.min)) * 100)));
  return {
    name: current.name,
    progress,
    remaining: next ? Math.max(0, next.min - points) : 0,
    nextName: next?.name || "Black özel drop"
  };
}

function renderAccount(customer, orders = []) {
  const dashboard = qs("[data-account-dashboard]");
  const auth = qs("[data-account-auth]");
  if (!dashboard || !auth) return;
  state.accountOrders = orders;
  if (!customer) {
    auth.classList.remove("is-hidden");
    dashboard.classList.add("is-hidden");
    return;
  }
  auth.classList.add("is-hidden");
  dashboard.classList.remove("is-hidden");
  qs("[data-account-name]").textContent = customer.name;
  qs("[data-account-email]").textContent = customer.email;
  const points = orders.reduce((sum, order) => sum + (Number(order.loyaltyPoints) || Math.floor((Number(order.totals?.total) || 0) / 100)), 0);
  const tier = loyaltyTierInfo(points);
  const profile = qs(".account-profile");
  if (profile && !qs("[data-loyalty-card]", profile)) {
    profile.insertAdjacentHTML(
      "beforeend",
      `<div class="loyalty-card" data-loyalty-card><span>THREON Club</span><strong data-loyalty-tier></strong><p data-loyalty-points></p><div class="loyalty-progress"><i data-loyalty-progress></i></div><small data-loyalty-next></small></div>`
    );
  }
  qs("[data-loyalty-tier]") && (qs("[data-loyalty-tier]").textContent = tier.name);
  qs("[data-loyalty-points]") && (qs("[data-loyalty-points]").textContent = `${points} puan · Bir sonraki özel drop için hazır profil.`);
  qs("[data-loyalty-progress]") && (qs("[data-loyalty-progress]").style.width = `${tier.progress}%`);
  qs("[data-loyalty-next]") &&
    (qs("[data-loyalty-next]").textContent = tier.remaining
      ? `${tier.nextName} seviyesine ${tier.remaining} puan kaldı.`
      : "En üst özel drop seviyesindesin.");
  qs("[data-account-orders]").innerHTML = orders.length
    ? orders
        .map(
          (order) => `
            <article class="account-order">
              <div class="account-order__top">
                <div>
                  <span>${escapeHtml(order.status)}</span>
                  <h3>${escapeHtml(order.number)}</h3>
                  <p>${new Date(order.createdAt).toLocaleDateString("tr-TR")} · ${order.items.length} ürün · ${escapeHtml(order.paymentStatus || "")}</p>
                  <p>${escapeHtml(order.paymentProvider || "Güvenli ödeme")} · ${escapeHtml(order.paymentReference || "Sipariş kaydı oluşturuldu")}</p>
                </div>
                <strong>${formatPrice({ price: order.totals.total, currency: order.totals.currency })}</strong>
              </div>
              <div class="account-order__tracking">
                <span>${escapeHtml(order.shippingCarrier || "Kargo firması atanmadı")}</span>
                <strong>${escapeHtml(order.trackingNumber || "Takip kodu bekliyor")}</strong>
                ${order.trackingNumber ? `<a href="https://www.google.com/search?q=${encodeURIComponent(`${order.shippingCarrier || "kargo"} ${order.trackingNumber}`)}" target="_blank" rel="noreferrer">Takip et</a>` : ""}
              </div>
              <ul>
                ${(order.items || [])
                  .map(
                    (item) => `
                      <li>
                        <span>${escapeHtml(item.name)} · ${escapeHtml(item.size)} · ${escapeHtml(item.color)}</span>
                        <em>${item.quantity} adet</em>
                      </li>
                    `
                  )
                  .join("")}
              </ul>
              ${
                order.returnRequest
                  ? `<div class="account-order__tracking"><span>İade talebi</span><strong>${escapeHtml(order.returnRequest.status)}</strong><p>${escapeHtml(order.returnRequest.reason || "")}</p></div>`
                  : ""
              }
              ${
                Array.isArray(order.timeline) && order.timeline.length
                  ? `<div class="order-timeline">${order.timeline
                      .slice(0, 4)
                      .map((item) => `<span><strong>${escapeHtml(item.status)}</strong>${escapeHtml(item.note || "")}</span>`)
                      .join("")}</div>`
                  : ""
              }
              <div class="row-actions">
                <button class="mini-button" type="button" data-invoice-download="${escapeHtml(order.id)}">Fatura indir</button>
                <button class="mini-button" type="button" data-return-request="${escapeHtml(order.id)}">İade talebi</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state empty-state--small">Henüz siparişin yok.</div>';
  renderAccountExtras();
}

function renderAccountExtras() {
  const addressRoot = qs("[data-account-addresses]");
  const favoriteRoot = qs("[data-account-favorites]");
  const notifyRoot = qs("[data-account-notifications]");
  if (addressRoot) {
    const addresses = readAddressBook();
    addressRoot.innerHTML = addresses.length
      ? addresses
          .map(
            (item) => `
              <article class="account-mini-card">
                <strong>${escapeHtml(item.city)} / ${escapeHtml(item.district)}</strong>
                <p>${escapeHtml(item.neighborhood)} · ${escapeHtml(item.address)}</p>
              </article>
            `
          )
          .join("")
      : '<div class="empty-state empty-state--small">Henüz kayıtlı teslimat adresi yok.</div>';
  }
  if (favoriteRoot) {
    const favorites = wishlistProducts().slice(0, 4);
    favoriteRoot.innerHTML = favorites.length
      ? favorites
          .map(
            (product) => `
              <a class="account-mini-product" href="${productUrl(product)}">
                <img src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
                <span><strong>${escapeHtml(product.name)}</strong><em>${formatPrice(product)}${priceMeta(product).hasSale ? " · Favorinde indirim" : ""}</em></span>
              </a>
            `
          )
          .join("")
      : '<div class="empty-state empty-state--small">Favori listen henüz boş.</div>';
  }
  if (notifyRoot) {
    const requests = readNotifyRequests();
    notifyRoot.innerHTML = requests.length
      ? requests
          .slice(0, 4)
          .map((item) => {
            const product = findProduct(item.productId);
            return `
              <article class="account-mini-card">
                <strong>${escapeHtml(product?.name || item.productId)}</strong>
                <p>${escapeHtml(item.size || "Standart")} · ${escapeHtml(item.color || "Tek renk")} için bildirim bekliyor.</p>
              </article>
            `;
          })
          .join("")
      : '<div class="empty-state empty-state--small">Aktif stok bildirimi yok.</div>';
  }
}

async function refreshAccount() {
  if (!state.customerToken) {
    renderAccount(null, []);
    return;
  }
  try {
    const data = await customerApi("/api/auth/me");
    setCustomerSession(state.customerToken, data.customer);
    renderAccount(data.customer, data.orders || []);
  } catch {
    setCustomerSession("", null);
    renderAccount(null, []);
  }
}

function startOtpResendCountdown(button, seconds = 60) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent || "OTP gönder";
  clearInterval(state.accountOtp.timer);
  state.accountOtp.remaining = seconds;
  const update = () => {
    if (state.accountOtp.remaining <= 0) {
      clearInterval(state.accountOtp.timer);
      state.accountOtp.timer = null;
      button.disabled = false;
      button.textContent = button.dataset.defaultText || "OTP gönder";
      return;
    }
    button.disabled = true;
    button.textContent = `Tekrar gönder (${state.accountOtp.remaining} sn)`;
    state.accountOtp.remaining -= 1;
  };
  update();
  state.accountOtp.timer = setInterval(update, 1000);
}

function setAccountStatus(message = "", type = "info") {
  const status = qs("[data-account-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("is-error", "is-success", "is-info");
  if (message) status.classList.add(`is-${type}`);
}

async function initAccount() {
  await fetchSite();
  await refreshAccount();
  setupTurkishPhoneInputs(qs("[data-account-auth]") || document);
  qs("[data-send-otp]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const form = button.closest("form");
    if (!form) return;
    const email = form.elements.email.value;
    const phone = normalizePhoneInput(form.elements.phone.value);
    if (!isValidEmailAddress(email)) {
      setAccountStatus("Lütfen geçerli bir e-posta adresi gir.", "error");
      return;
    }
    if (!isValidTurkishMobileInput(phone)) {
      setAccountStatus("Telefon numarası +90 5XXXXXXXXX formatında olmalı.", "error");
      return;
    }
    form.elements.phone.value = formatTurkishMobileDisplay(phone);
    button.disabled = true;
    setAccountStatus("SMS OTP gönderiliyor...", "info");
    try {
      await fetchJson("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email, phone })
      });
      setAccountStatus("SMS OTP gönderildi. Lütfen telefonuna gelen 6 haneli kodu gir.", "success");
      form.elements.otpCode?.focus();
      startOtpResendCountdown(button, 60);
    } catch (error) {
      setAccountStatus(error.message, "error");
      button.disabled = false;
    }
  });

  qsa("[data-auth-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const mode = form.dataset.authForm;
      const formData = new FormData(form);
      const payload =
        mode === "register"
          ? {
              name: formData.get("name"),
              email: formData.get("email"),
              phone: normalizePhoneInput(formData.get("phone")),
              password: formData.get("password"),
              otpCode: formData.get("otpCode")
            }
          : { email: formData.get("email"), password: formData.get("password") };
      if (mode === "register" && !isValidEmailAddress(payload.email)) {
        setAccountStatus("Lütfen gerçek ve geçerli bir e-posta adresi gir.", "error");
        return;
      }
      if (mode === "register" && !isValidTurkishMobileInput(payload.phone)) {
        setAccountStatus("Telefon numarası +90 5XXXXXXXXX formatında olmalı.", "error");
        return;
      }
      if (mode === "register" && !String(payload.otpCode || "").trim()) {
        setAccountStatus("Kayıt için SMS OTP kodunu gir.", "error");
        return;
      }
      setAccountStatus(mode === "register" ? "Hesap oluşturuluyor..." : "Giriş yapılıyor...", "info");
      try {
        const result = await fetchJson(mode === "register" ? "/api/auth/register" : "/api/auth/login", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        setCustomerSession(result.token, result.customer);
        setAccountStatus("Giriş başarılı. Hesap panelin hazırlanıyor.", "success");
        await refreshAccount();
      } catch (error) {
        setAccountStatus(error.message || "E-posta veya şifre hatalı.", "error");
      }
    });
  });

  qs("[data-account-logout]")?.addEventListener("click", async () => {
    try {
      await customerApi("/api/auth/logout", { method: "POST" });
    } catch {}
    setCustomerSession("", null);
    renderAccount(null, []);
  });

  qs("[data-account-orders]")?.addEventListener("click", async (event) => {
    const invoiceButton = event.target.closest("[data-invoice-download]");
    if (invoiceButton) {
      downloadInvoice(invoiceButton.dataset.invoiceDownload);
      return;
    }
    const returnButton = event.target.closest("[data-return-request]");
    if (!returnButton) return;
    const reason = prompt("İade/değişim sebebini yaz:");
    if (!reason) return;
    try {
      await customerApi(`/api/orders/${encodeURIComponent(returnButton.dataset.returnRequest)}/return`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      showToast("İade talebin alındı.");
      await refreshAccount();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function makeLocalId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeClientProduct(input, existing = {}) {
  const name = String(input.name || existing.name || "Yeni ürün").trim();
  const slug = slugify(input.slug || name || existing.slug);
  const categoryInput = String(input.category || existing.category || "Üst Giyim").trim();
  const category = categoryAlias(categoryInput) || categoryInput;
  const subcategoryInput = String(input.subcategory ?? existing.subcategory ?? "").trim();
  const subcategory = subcategoryAlias(subcategoryInput, category) || subcategoryInput || categoryRoute(categoryInput).subcategory;
  return {
    id: existing.id || input.id || slug || makeLocalId(),
    name,
    slug: slug || existing.slug || makeLocalId(),
    category,
    subcategory,
    price: String(input.price ?? existing.price ?? "0").trim(),
    comparePrice: String(input.comparePrice ?? existing.comparePrice ?? "").trim(),
    currency: String(input.currency || existing.currency || "TRY").trim(),
    stock: Number.isFinite(Number(input.stock)) ? Number(input.stock) : Number(existing.stock || 0),
    status: input.status === "draft" ? "draft" : "active",
    featured: Boolean(input.featured),
    badge: String(input.badge || existing.badge || "").trim(),
    sku: String(input.sku || existing.sku || "").trim(),
    image: String(input.image || existing.image || "assets/threon-fashion-hero.png").trim(),
    imageFit: normalizeImageFit(input.imageFit || existing.imageFit || "cover"),
    imagePosition: normalizeImagePosition(input.imagePosition || existing.imagePosition || "center center"),
    imageRatio: normalizeImageRatio(input.imageRatio || existing.imageRatio || "portrait"),
    gallery: Array.isArray(input.gallery)
      ? input.gallery.map((item) => String(item).trim()).filter(Boolean)
      : existing.gallery || [],
    collection: String(input.collection || existing.collection || "").trim(),
    fit: String(input.fit || existing.fit || "").trim(),
    modelInfo: String(input.modelInfo || existing.modelInfo || "").trim(),
    shippingNote: String(input.shippingNote || existing.shippingNote || "").trim(),
    sizes: Array.isArray(input.sizes) ? input.sizes.map((item) => String(item).trim()).filter(Boolean) : existing.sizes || [],
    colors: Array.isArray(input.colors) ? input.colors.map((item) => String(item).trim()).filter(Boolean) : existing.colors || [],
    material: String(input.material || existing.material || "").trim(),
    care: String(input.care || existing.care || "").trim(),
    summary: String(input.summary || existing.summary || "").trim(),
    description: String(input.description || existing.description || "").trim(),
    features: Array.isArray(input.features)
      ? input.features.map((item) => String(item).trim()).filter(Boolean)
      : existing.features || [],
    genderSections: Array.isArray(input.genderSections)
      ? input.genderSections.map((item) => String(item).trim()).filter(Boolean)
      : Array.isArray(existing.genderSections)
        ? existing.genderSections
        : [],
    variants: Array.isArray(input.variants)
      ? input.variants
          .map((item) => ({
            size: String(item.size || "Standart").trim(),
            color: String(item.color || "Tek renk").trim(),
            stock: Number.isFinite(Number(item.stock)) ? Number(item.stock) : 0,
            sku: String(item.sku || "").trim(),
            image: String(item.image || "").trim()
          }))
          .filter((item) => item.size || item.color)
      : existing.variants || [],
    reviews: Array.isArray(existing.reviews) ? existing.reviews : Array.isArray(input.reviews) ? input.reviews : [],
    specs: input.specs && typeof input.specs === "object" ? input.specs : existing.specs || {}
  };
}

function persistLocalAdminData(data) {
  const next = {
    settings: data.settings || {},
    products: Array.isArray(data.products) ? data.products : [],
    messages: Array.isArray(data.messages) ? data.messages : [],
    customers: Array.isArray(data.customers) ? data.customers : [],
    orders: Array.isArray(data.orders) ? data.orders : []
  };
  saveStoredSiteData(next);
  state.admin.data = cloneData(next);
  state.site = publicSiteData(next);
  state.sitePromise = Promise.resolve(state.site);
  return cloneData(next);
}

async function getLocalAdminData() {
  const data = state.admin.data || (await loadFallbackSiteData());
  return persistLocalAdminData(data);
}

function parseBody(options = {}) {
  if (!options.body) return {};
  try {
    return JSON.parse(options.body);
  } catch {
    return {};
  }
}

async function localAdminApi(url, options = {}) {
  const method = options.method || "GET";
  const data = await getLocalAdminData();
  const body = parseBody(options);

  if (method === "GET" && url === "/api/admin/data") {
    return data;
  }

  if (method === "POST" && url === "/api/admin/upload") {
    return {
      path: body.dataUrl || "",
      local: true
    };
  }

  if (method === "PUT" && url === "/api/admin/settings") {
    data.settings = { ...data.settings, ...body };
    if (Array.isArray(body.visualBlocks)) data.settings.visualBlocks = body.visualBlocks.map((block, index) => normalizeVisualBlock(block, index));
    if (Array.isArray(body.dynamicShelves)) data.settings.dynamicShelves = body.dynamicShelves.map((shelf, index) => normalizeDynamicShelf(shelf, index));
    if (Array.isArray(body.homeSections)) data.settings.homeSections = body.homeSections.map((section, index) => normalizeHomeSection(section, index));
    if (Array.isArray(body.coupons)) data.settings.coupons = normalizeCoupons(body.coupons);
    data.settings.seo = {
      ...(data.settings.seo || {}),
      ...(body.seo && typeof body.seo === "object" ? body.seo : {}),
      siteUrl: String(body.siteUrl ?? data.settings.seo?.siteUrl ?? "").trim(),
      defaultTitle: String(body.defaultTitle ?? data.settings.seo?.defaultTitle ?? "").trim(),
      defaultDescription: String(body.defaultDescription ?? data.settings.seo?.defaultDescription ?? "").trim(),
      sitemapEnabled: Object.prototype.hasOwnProperty.call(body, "sitemapEnabled")
        ? body.sitemapEnabled !== false
        : data.settings.seo?.sitemapEnabled !== false
    };
    data.settings.analytics = {
      ...(data.settings.analytics || {}),
      ...(body.analytics && typeof body.analytics === "object" ? body.analytics : {}),
      googleAnalyticsId: String(body.googleAnalyticsId ?? data.settings.analytics?.googleAnalyticsId ?? "").trim(),
      metaPixelId: String(body.metaPixelId ?? data.settings.analytics?.metaPixelId ?? "").trim(),
      conversionLabel: String(body.conversionLabel ?? data.settings.analytics?.conversionLabel ?? "").trim(),
      enabled: Object.prototype.hasOwnProperty.call(body, "analyticsEnabled") ? body.analyticsEnabled === true : Boolean(data.settings.analytics?.enabled)
    };
    data.settings.drop = {
      ...(data.settings.drop || {}),
      ...(body.drop && typeof body.drop === "object" ? body.drop : {}),
      title: String(body.dropTitle ?? data.settings.drop?.title ?? "").trim(),
      productSlug: String(body.dropProductSlug ?? data.settings.drop?.productSlug ?? "").trim(),
      endsAt: String(body.dropEndsAt ?? data.settings.drop?.endsAt ?? "").trim(),
      enabled: Object.prototype.hasOwnProperty.call(body, "dropEnabled") ? body.dropEnabled === true : Boolean(data.settings.drop?.enabled)
    };
    return persistLocalAdminData(data);
  }

  if (method === "POST" && url === "/api/admin/products") {
    const product = normalizeClientProduct(body);
    data.products.unshift(product);
    persistLocalAdminData(data);
    return product;
  }

  const productMatch = url.match(/^\/api\/admin\/products\/([^/]+)(?:\/(duplicate))?$/);
  if (productMatch) {
    const productId = decodeURIComponent(productMatch[1]);
    const action = productMatch[2];
    const index = data.products.findIndex((product) => product.id === productId);
    if (index === -1) {
      throw new Error("Ürün bulunamadı.");
    }

    if (method === "PUT" && !action) {
      data.products[index] = normalizeClientProduct(body, data.products[index]);
      persistLocalAdminData(data);
      return data.products[index];
    }

    if (method === "DELETE" && !action) {
      const [removed] = data.products.splice(index, 1);
      persistLocalAdminData(data);
      return removed;
    }

    if (method === "POST" && action === "duplicate") {
      const source = data.products[index];
      const clone = {
        ...source,
        id: makeLocalId(),
        name: `${source.name} Kopya`,
        slug: `${source.slug}-kopya-${Date.now().toString(36)}`,
        featured: false,
        status: "draft"
      };
      data.products.unshift(clone);
      persistLocalAdminData(data);
      return clone;
    }
  }

  const messageMatch = url.match(/^\/api\/admin\/messages\/([^/]+)(?:\/read)?$/);
  if (messageMatch) {
    const messageId = decodeURIComponent(messageMatch[1]);
    const index = data.messages.findIndex((message) => message.id === messageId);
    if (index === -1) {
      throw new Error("Mesaj bulunamadı.");
    }
    if (method === "PUT" && url.endsWith("/read")) {
      data.messages[index].read = true;
      persistLocalAdminData(data);
      return data.messages[index];
    }
    if (method === "DELETE") {
      const [removed] = data.messages.splice(index, 1);
      persistLocalAdminData(data);
      return removed;
    }
  }

  const reviewMatch = url.match(/^\/api\/admin\/products\/([^/]+)\/reviews\/([^/]+)$/);
  if (reviewMatch) {
    const productId = decodeURIComponent(reviewMatch[1]);
    const reviewId = decodeURIComponent(reviewMatch[2]);
    const product = data.products.find((item) => item.id === productId || item.slug === productId);
    if (!product) throw new Error("Ürün bulunamadı.");
    product.reviews = Array.isArray(product.reviews) ? product.reviews : [];
    const index = product.reviews.findIndex((review) => review.id === reviewId);
    if (index === -1) throw new Error("Yorum bulunamadı.");
    if (method === "PUT") {
      product.reviews[index].status = ["approved", "pending", "rejected"].includes(body.status) ? body.status : "approved";
      product.reviews[index].updatedAt = new Date().toISOString();
      persistLocalAdminData(data);
      return product.reviews[index];
    }
    if (method === "DELETE") {
      const [removed] = product.reviews.splice(index, 1);
      persistLocalAdminData(data);
      return removed;
    }
  }

  const orderMatch = url.match(/^\/api\/admin\/orders\/([^/]+)$/);
  if (orderMatch) {
    const orderId = decodeURIComponent(orderMatch[1]);
    const index = data.orders.findIndex((order) => order.id === orderId);
    if (index === -1) {
      throw new Error("Sipariş bulunamadı.");
    }
    if (method === "PUT") {
      const allowedStatuses = ["Yeni", "Hazırlanıyor", "Kargoda", "Tamamlandı", "İptal"];
      const allowedPaymentStatuses = ["Kart ödemesi onaylandı", "Havale bekliyor", "Ödeme alındı", "İade edildi"];
      const order = data.orders[index];
      const now = new Date().toISOString();
      if (allowedStatuses.includes(body.status)) {
        order.status = body.status;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.unshift({ status: body.status, note: `Durum ${body.status} olarak güncellendi.`, createdAt: now });
      }
      if (allowedPaymentStatuses.includes(body.paymentStatus)) {
        order.paymentStatus = body.paymentStatus;
      }
      if (typeof body.shippingCarrier === "string") {
        order.shippingCarrier = String(body.shippingCarrier || "").trim();
      }
      if (typeof body.trackingNumber === "string") {
        order.trackingNumber = String(body.trackingNumber || "").trim() || `TRN${Date.now().toString(36).toUpperCase()}`;
        order.status = order.status === "Yeni" ? "Kargoda" : order.status;
        order.timeline = Array.isArray(order.timeline) ? order.timeline : [];
        order.timeline.unshift({ status: "Kargo", note: `${order.shippingCarrier || "Kargo"} takip kodu: ${order.trackingNumber}`, createdAt: now });
      }
      if (body.returnStatus && order.returnRequest) {
        order.returnRequest.status = String(body.returnStatus || "").trim();
        order.returnRequest.updatedAt = now;
      }
      order.updatedAt = now;
      persistLocalAdminData(data);
      return order;
    }
  }

  if (method === "POST" && url === "/api/admin/import") {
    const imported = {
      settings: body.settings && typeof body.settings === "object" ? { ...data.settings, ...body.settings } : data.settings,
      products: Array.isArray(body.products) ? body.products.map((item) => normalizeClientProduct(item)) : data.products,
      messages: Array.isArray(body.messages) ? body.messages : data.messages,
      customers: Array.isArray(body.customers) ? body.customers : data.customers,
      orders: Array.isArray(body.orders) ? body.orders : data.orders
    };
    return persistLocalAdminData(imported);
  }

  throw new Error("Yerel yedek modda bu işlem bulunamadı.");
}

function adminApi(url, options = {}) {
  if (state.admin.mode === "local") {
    return localAdminApi(url, options);
  }
  return fetchJson(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${state.admin.token}`
    }
  }).catch((error) => {
    if (error.message.includes("giriş")) {
      sessionStorage.removeItem("threonAdminToken");
      state.admin.token = "";
      showLogin();
    }
    throw error;
  });
}

function showLogin() {
  qs("[data-admin-login]")?.classList.remove("is-hidden");
  qs("[data-admin-dashboard]")?.classList.add("is-hidden");
}

function showDashboard() {
  qs("[data-admin-login]")?.classList.add("is-hidden");
  qs("[data-admin-dashboard]")?.classList.remove("is-hidden");
}

function setAdminStatus(message) {
  const status = qs("[data-admin-status]");
  if (status) status.textContent = message;
}

async function loadAdminData() {
  setAdminStatus("Yükleniyor");
  let data;
  try {
    data = await adminApi("/api/admin/data");
  } catch (error) {
    if (state.admin.mode === "api" && looksLikeOfflineApiError(error)) {
      state.admin.mode = "local";
      sessionStorage.setItem(STORAGE_KEYS.adminMode, "local");
      data = await localAdminApi("/api/admin/data");
    } else {
      throw error;
    }
  }
  state.admin.data = data;
  renderAdmin();
  setAdminStatus(state.admin.mode === "local" ? "Yerel yedek mod" : "Güncel");
}

function renderAdmin() {
  renderAdminStats();
  renderAdminInsights();
  renderAdminProducts();
  renderAdminVisuals();
  renderAdminHomeSections();
  renderAdminDynamicShelves();
  renderAdminCoupons();
  renderCategoryList();
  renderSettingsForm();
  renderAdminOrders();
  renderAdminCustomers();
  renderAdminReviews();
  renderMessages();
}

function renderAdminStats() {
  const root = qs("[data-admin-stats]");
  const data = state.admin.data;
  if (!root || !data) return;
  const products = data.products || [];
  const messages = data.messages || [];
  const orders = data.orders || [];
  const customers = data.customers || [];
  const reviewCount = products.reduce((sum, product) => sum + (Array.isArray(product.reviews) ? product.reviews.length : 0), 0);
  const pendingReviews = products.reduce((sum, product) => sum + (product.reviews || []).filter((review) => review.status === "pending").length, 0);
  const revenue = orders.reduce((sum, order) => sum + (Number(order.totals?.total) || 0), 0);
  const stats = [
    ["Toplam ürün", products.length],
    ["Yayında", products.filter((item) => item.status === "active").length],
    ["Taslak", products.filter((item) => item.status === "draft").length],
    ["Sipariş", orders.length],
    ["Yeni sipariş", orders.filter((item) => item.status === "Yeni").length],
    ["Üyeler", customers.length],
    ["Ciro", formatPrice({ price: revenue, currency: "TRY" })],
    ["Yorum", reviewCount],
    ["Onay bekleyen", pendingReviews],
    ["Okunmamış mesaj", messages.filter((item) => !item.read).length]
  ];
  root.innerHTML = stats
    .map(([label, value]) => `<div class="admin-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`)
    .join("");
}

function renderAdminInsights() {
  const root = qs("[data-admin-insights]");
  const data = state.admin.data;
  if (!root || !data) return;
  const products = data.products || [];
  const orders = data.orders || [];
  const lineTotals = new Map();
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const current = lineTotals.get(item.productId) || { quantity: 0, revenue: 0, name: item.name };
      current.quantity += Number(item.quantity) || 0;
      current.revenue += Number(item.subtotal) || 0;
      lineTotals.set(item.productId, current);
    });
  });
  const bestSellers = [...lineTotals.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 4);
  const lowStock = products
    .filter((product) => productAvailableStock(product) <= 8)
    .sort((a, b) => productAvailableStock(a) - productAvailableStock(b))
    .slice(0, 5);
  const categoryRevenue = {};
  orders.forEach((order) => {
    (order.items || []).forEach((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      const category = productMainCategory(product || {}) || "Diğer";
      categoryRevenue[category] = (categoryRevenue[category] || 0) + (Number(item.subtotal) || 0);
    });
  });
  const pendingReviews = products
    .flatMap((product) => (product.reviews || []).map((review) => ({ ...review, productName: product.name })))
    .filter((review) => review.status === "pending")
    .slice(0, 4);
  root.innerHTML = `
    <article class="admin-insight-card">
      <span>Satış ivmesi</span>
      <h3>En çok satanlar</h3>
      ${
        bestSellers.length
          ? bestSellers.map((item) => `<p><strong>${escapeHtml(item.name)}</strong><em>${item.quantity} adet · ${formatPrice({ price: item.revenue, currency: "TRY" })}</em></p>`).join("")
          : "<p>Henüz satış verisi yok.</p>"
      }
    </article>
    <article class="admin-insight-card">
      <span>Operasyon</span>
      <h3>Düşük stok</h3>
      ${
        lowStock.length
          ? lowStock.map((product) => `<p><strong>${escapeHtml(product.name)}</strong><em>${productAvailableStock(product)} adet kaldı</em></p>`).join("")
          : "<p>Riskli stok görünmüyor.</p>"
      }
    </article>
    <article class="admin-insight-card">
      <span>Kategori ciro</span>
      <h3>Raf performansı</h3>
      ${
        Object.keys(categoryRevenue).length
          ? Object.entries(categoryRevenue)
              .sort((a, b) => b[1] - a[1])
              .map(([category, revenue]) => `<p><strong>${escapeHtml(category)}</strong><em>${formatPrice({ price: revenue, currency: "TRY" })}</em></p>`)
              .join("")
          : "<p>Sipariş oluşunca kategori cirosu burada görünür.</p>"
      }
    </article>
    <article class="admin-insight-card">
      <span>İtibar</span>
      <h3>Bekleyen yorumlar</h3>
      ${
        pendingReviews.length
          ? pendingReviews.map((review) => `<p><strong>${escapeHtml(review.productName)}</strong><em>${escapeHtml(review.rating || "5.0")}/5 · ${escapeHtml(review.author || "")}</em></p>`).join("")
          : "<p>Onay bekleyen yorum yok.</p>"
      }
    </article>
  `;
}

function renderCategoryList() {
  const datalist = qs("[data-category-list]");
  const subcategoryDatalist = qs("[data-subcategory-list]");
  const data = state.admin.data;
  if (!datalist || !data) return;
  const categories = [...new Set([...categoryKeys(), ...data.products.map((item) => item.category).filter(Boolean)])];
  datalist.innerHTML = categories.map((category) => `<option value="${escapeHtml(category)}"></option>`).join("");
  if (subcategoryDatalist) updateSubcategoryDatalist(qs("[data-product-form]")?.elements.category.value || "");
}

function updateSubcategoryDatalist(category = "") {
  const datalist = qs("[data-subcategory-list]");
  if (!datalist) return;
  const activeCategory = categoryAlias(category) || category;
  const options = allSubcategories(activeCategory);
  datalist.innerHTML = options.map((subcategory) => `<option value="${escapeHtml(subcategory)}"></option>`).join("");
}

function productFormPayload(form) {
  const formData = new FormData(form);
  const specs = {};
  String(formData.get("specs") || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separator = line.indexOf(":");
      if (separator === -1) return;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (key && value) specs[key] = value;
    });

  return {
    name: formData.get("name"),
    slug: formData.get("slug") || slugify(formData.get("name")),
    category: formData.get("category"),
    subcategory: formData.get("subcategory"),
    price: formData.get("price"),
    comparePrice: formData.get("comparePrice"),
    currency: formData.get("currency"),
    stock: Number(formData.get("stock") || 0),
    status: formData.get("status"),
    featured: Boolean(formData.get("featured")),
    badge: formData.get("badge"),
    sku: formData.get("sku"),
    image: formData.get("image") || "assets/threon-fashion-hero.png",
    imageFit: formData.get("imageFit") || "cover",
    imagePosition: formData.get("imagePosition") || "center center",
    imageRatio: formData.get("imageRatio") || "portrait",
    gallery: String(formData.get("gallery") || "")
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean),
    collection: formData.get("collection"),
    fit: formData.get("fit"),
    modelInfo: formData.get("modelInfo"),
    shippingNote: formData.get("shippingNote"),
    sizes: String(formData.get("sizes") || "")
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean),
    colors: String(formData.get("colors") || "")
      .split(",")
      .map((line) => line.trim())
      .filter(Boolean),
    material: formData.get("material"),
    care: formData.get("care"),
    summary: formData.get("summary"),
    description: formData.get("description"),
    features: String(formData.get("features") || "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    variants: parseVariantLines(formData.get("variants")),
    specs
  };
}

function fillProductForm(product = null) {
  const form = qs("[data-product-form]");
  if (!form) return;
  state.admin.editingProductId = product?.id || "";
  form.elements.id.value = product?.id || "";
  form.elements.name.value = product?.name || "";
  form.elements.slug.value = product?.slug || "";
  form.elements.category.value = product?.category || "";
  if (form.elements.subcategory) form.elements.subcategory.value = product?.subcategory || productSubcategory(product || {}) || "";
  updateSubcategoryDatalist(form.elements.category.value);
  form.elements.price.value = product?.price || "";
  form.elements.comparePrice.value = product?.comparePrice || "";
  form.elements.currency.value = product?.currency || "TRY";
  form.elements.stock.value = product?.stock ?? 0;
  form.elements.status.value = product?.status || "active";
  form.elements.badge.value = product?.badge || "";
  form.elements.sku.value = product?.sku || "";
  form.elements.image.value = product?.image || "assets/threon-fashion-hero.png";
  if (form.elements.imageFit) form.elements.imageFit.value = normalizeImageFit(product?.imageFit || "cover");
  if (form.elements.imagePosition) form.elements.imagePosition.value = normalizeImagePosition(product?.imagePosition || "center center");
  if (form.elements.imageRatio) form.elements.imageRatio.value = normalizeImageRatio(product?.imageRatio || "portrait");
  form.elements.gallery.value = (product?.gallery || []).join(", ");
  form.elements.collection.value = product?.collection || "";
  form.elements.fit.value = product?.fit || "";
  form.elements.modelInfo.value = product?.modelInfo || "";
  form.elements.shippingNote.value = product?.shippingNote || "";
  form.elements.sizes.value = (product?.sizes || []).join(", ");
  form.elements.colors.value = (product?.colors || []).join(", ");
  form.elements.material.value = product?.material || "";
  form.elements.care.value = product?.care || "";
  form.elements.summary.value = product?.summary || "";
  form.elements.description.value = product?.description || "";
  form.elements.features.value = (product?.features || []).join("\n");
  if (form.elements.variants) form.elements.variants.value = formatVariantLines(product?.variants || []);
  form.elements.specs.value = Object.entries(product?.specs || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
  form.elements.featured.checked = Boolean(product?.featured);
  qs("[data-product-status]").textContent = product ? "Ürün düzenleniyor." : "Yeni ürün hazır.";
  renderProductFormPreview(productFormPayload(form));
}

function renderProductFormPreview(product) {
  const root = qs("[data-admin-product-preview]");
  if (!root) return;
  const preview = normalizeClientProduct(product);
  renderVariantStockTable(preview);
  root.innerHTML = `
    <img src="${escapeHtml(preview.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(preview.name)}" style="${escapeHtml(productImageStyle(preview))}" />
    <div>
      <span>${escapeHtml(preview.collection || categoryDisplay(preview) || "Ürün önizleme")}</span>
      <strong>${escapeHtml(preview.name || "Yeni ürün")}</strong>
      <p>${escapeHtml(preview.fit || preview.summary || "Fit ve kısa açıklama burada görünür.")}</p>
      <em>${formatPrice(preview)}</em>
      <small>${escapeHtml(IMAGE_RATIO_LABELS[preview.imageRatio] || "Dikey")} · ${escapeHtml(IMAGE_FITS[preview.imageFit] || "Kırp")}</small>
    </div>
  `;
}

function renderVariantStockTable(product = {}) {
  const root = qs("[data-variant-stock-table]");
  if (!root) return;
  const variants = productVariants(product);
  root.innerHTML = variants.length
    ? `
      <div class="admin-variant-table__head">
        <strong>Varyant stok tablosu</strong>
        <span>${variants.length} varyant</span>
      </div>
      <div class="admin-variant-table__grid">
        <span>Beden</span><span>Renk</span><span>Stok</span><span>SKU</span>
        ${variants
          .map(
            (variant) => `
              <strong>${escapeHtml(variant.size)}</strong>
              <strong>${escapeHtml(variant.color)}</strong>
              <em>${Number(variant.stock) || 0}</em>
              <small>${escapeHtml(variant.sku || product.sku || "-")}</small>
            `
          )
          .join("")}
      </div>
    `
    : '<div class="empty-state empty-state--small">Beden ve renk girildiğinde stok tablosu burada görünür.</div>';
}

function renderAdminProducts() {
  const root = qs("[data-admin-product-list]");
  const data = state.admin.data;
  if (!root || !data) return;

  const query = state.admin.productSearch.trim().toLowerCase();
  const products = data.products.filter((product) => {
    const statusMatch = state.admin.statusFilter === "all" || product.status === state.admin.statusFilter;
    const haystack = `${product.name} ${categoryDisplay(product)} ${product.summary}`.toLowerCase();
    return statusMatch && (!query || haystack.includes(query));
  });
  const visibleProducts = products.slice(0, state.admin.productVisible);
  const hasMore = visibleProducts.length < products.length;

  root.innerHTML = products.length
    ? [
        ...visibleProducts
        .map(
          (product) => `
            <article class="admin-product-item">
              <div class="admin-product-item__top">
                <img class="admin-product-thumb" src="${escapeHtml(product.image || "assets/threon-fashion-hero.png")}" alt="${escapeHtml(product.name)}" />
                <div>
                  <h3>${escapeHtml(product.name)}</h3>
                  <p>${escapeHtml(categoryDisplay(product))} · ${formatPrice(product)} · Stok: ${escapeHtml(productAvailableStock(product))}</p>
                </div>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-product-action="edit" data-id="${escapeHtml(product.id)}">Düzenle</button>
                  <button class="mini-button" type="button" data-product-action="status" data-id="${escapeHtml(product.id)}">${product.status === "active" ? "Taslak yap" : "Yayına al"}</button>
                  <button class="mini-button" type="button" data-product-action="duplicate" data-id="${escapeHtml(product.id)}">Kopyala</button>
                  <button class="mini-button danger" type="button" data-product-action="delete" data-id="${escapeHtml(product.id)}">Sil</button>
                </div>
              </div>
              <div class="status-row">
                <span class="pill">${product.status === "active" ? "Yayında" : "Taslak"}</span>
                ${product.featured ? '<span class="pill pill-strong">Öne çıkan</span>' : ""}
                <span class="pill">${escapeHtml(product.slug)}</span>
              </div>
            </article>
          `
        ),
        hasMore
          ? `<div class="admin-load-more">
              <button class="mini-button" type="button" data-admin-products-more>
                Daha fazla ürün göster (${visibleProducts.length}/${products.length})
              </button>
            </div>`
          : ""
      ].join("")
    : '<div class="empty-state">Bu filtrede ürün yok.</div>';
}

function renderSettingsForm() {
  const form = qs("[data-settings-form]");
  const settings = state.admin.data?.settings;
  if (!form || !settings) return;
  Object.entries(settings).forEach(([key, value]) => {
    if (form.elements[key]) {
      form.elements[key].value = value || "";
    }
  });
  const fieldValues = {
    siteUrl: settings.seo?.siteUrl || "",
    defaultTitle: settings.seo?.defaultTitle || "",
    defaultDescription: settings.seo?.defaultDescription || "",
    googleAnalyticsId: settings.analytics?.googleAnalyticsId || "",
    metaPixelId: settings.analytics?.metaPixelId || "",
    conversionLabel: settings.analytics?.conversionLabel || "",
    dropTitle: settings.drop?.title || "",
    dropProductSlug: settings.drop?.productSlug || "",
    dropEndsAt: formatDateTimeLocal(settings.drop?.endsAt || "")
  };
  Object.entries(fieldValues).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value;
  });
  if (form.elements.sitemapEnabled) form.elements.sitemapEnabled.checked = settings.seo?.sitemapEnabled !== false;
  if (form.elements.analyticsEnabled) form.elements.analyticsEnabled.checked = Boolean(settings.analytics?.enabled);
  if (form.elements.dropEnabled) form.elements.dropEnabled.checked = Boolean(settings.drop?.enabled);
}

function formatDateTimeLocal(value = "") {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function settingsFormPayload(form) {
  const formData = new FormData(form);
  return {
    brandName: formData.get("brandName"),
    tagline: formData.get("tagline"),
    heroTitle: formData.get("heroTitle"),
    heroSubtitle: formData.get("heroSubtitle"),
    announcement: formData.get("announcement"),
    contactEmail: formData.get("contactEmail"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    heroImage: formData.get("heroImage"),
    siteUrl: formData.get("siteUrl"),
    defaultTitle: formData.get("defaultTitle"),
    defaultDescription: formData.get("defaultDescription"),
    sitemapEnabled: Boolean(formData.get("sitemapEnabled")),
    googleAnalyticsId: formData.get("googleAnalyticsId"),
    metaPixelId: formData.get("metaPixelId"),
    conversionLabel: formData.get("conversionLabel"),
    analyticsEnabled: Boolean(formData.get("analyticsEnabled")),
    dropTitle: formData.get("dropTitle"),
    dropProductSlug: formData.get("dropProductSlug"),
    dropEndsAt: formData.get("dropEndsAt"),
    dropEnabled: Boolean(formData.get("dropEnabled"))
  };
}

function currentAdminCoupons() {
  return normalizeCoupons(state.admin.data?.settings?.coupons);
}

function couponValueText(coupon = {}) {
  if (coupon.type === "shipping") return "Ücretsiz kargo";
  if (coupon.type === "fixed") return `${Number(coupon.value || 0).toLocaleString("tr-TR")} TL indirim`;
  return `%${Number(coupon.value || 0).toLocaleString("tr-TR")} indirim`;
}

function couponFormPayload(form) {
  const formData = new FormData(form);
  return normalizeCoupon(
    {
      id: formData.get("id") || state.admin.editingCouponId || "",
      code: formData.get("code"),
      label: formData.get("label"),
      status: formData.get("status"),
      type: formData.get("type"),
      value: formData.get("value"),
      minSubtotal: formData.get("minSubtotal"),
      maxDiscount: formData.get("maxDiscount"),
      startsAt: formData.get("startsAt"),
      endsAt: formData.get("endsAt"),
      note: formData.get("note")
    },
    currentAdminCoupons().length + 1
  );
}

function renderCouponFormPreview(coupon = null) {
  const root = qs("[data-admin-coupon-preview]");
  if (!root) return;
  if (!coupon?.code) {
    root.innerHTML = `
      <span>Kupon önizleme</span>
      <strong>Aktif kampanyalar burada düzenlenir.</strong>
    `;
    return;
  }
  root.innerHTML = `
    <span>${coupon.status === "active" ? "Aktif kampanya" : "Pasif kampanya"}</span>
    <strong>${escapeHtml(coupon.code)}</strong>
    <p>${escapeHtml(coupon.label || couponValueText(coupon))}</p>
    <em>${escapeHtml(couponValueText(coupon))} · Min. ${formatPrice({ price: coupon.minSubtotal || 0, currency: "TRY" })}</em>
  `;
}

function fillCouponForm(coupon = null) {
  const form = qs("[data-coupon-form]");
  if (!form) return;
  const normalized = coupon ? normalizeCoupon(coupon) : null;
  state.admin.editingCouponId = normalized?.id || "";
  form.reset();
  form.elements.id.value = normalized?.id || "";
  form.elements.code.value = normalized?.code || "";
  form.elements.label.value = normalized?.label || "";
  form.elements.status.value = normalized?.status || "active";
  form.elements.type.value = normalized?.type || "percent";
  form.elements.value.value = normalized?.value ?? 10;
  form.elements.minSubtotal.value = normalized?.minSubtotal ?? 0;
  form.elements.maxDiscount.value = normalized?.maxDiscount || "";
  form.elements.startsAt.value = formatDateTimeLocal(normalized?.startsAt || "");
  form.elements.endsAt.value = formatDateTimeLocal(normalized?.endsAt || "");
  form.elements.note.value = normalized?.note || "";
  renderCouponFormPreview(normalized);
  const status = qs("[data-coupon-status]");
  if (status) status.textContent = normalized ? "Kupon düzenleniyor." : "Yeni kupon hazır.";
}

function renderAdminCoupons() {
  const root = qs("[data-admin-coupon-list]");
  if (!root) return;
  const coupons = currentAdminCoupons();
  if (!qs("[data-coupon-form]")?.elements.id.value && !qs("[data-coupon-form]")?.elements.code.value) {
    renderCouponFormPreview(null);
  }
  root.innerHTML = coupons.length
    ? coupons
        .map(
          (coupon) => `
            <article class="admin-coupon-item">
              <div>
                <div class="admin-visual-item__top">
                  <span class="pill ${coupon.status === "active" ? "pill-strong" : ""}">${coupon.status === "active" ? "Aktif" : "Pasif"}</span>
                  <span class="pill">${escapeHtml(couponValueText(coupon))}</span>
                </div>
                <h3>${escapeHtml(coupon.code)}</h3>
                <p>${escapeHtml(coupon.label || coupon.note || "Kupon kampanyası")}</p>
                <small>Min. ${formatPrice({ price: coupon.minSubtotal || 0, currency: "TRY" })}${coupon.endsAt ? ` · Bitiş ${new Date(coupon.endsAt).toLocaleString("tr-TR")}` : ""}</small>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-coupon-action="edit" data-id="${escapeHtml(coupon.id)}">Düzenle</button>
                  <button class="mini-button" type="button" data-coupon-action="status" data-id="${escapeHtml(coupon.id)}">${coupon.status === "active" ? "Pasif yap" : "Aktif yap"}</button>
                  <button class="mini-button" type="button" data-coupon-action="duplicate" data-id="${escapeHtml(coupon.id)}">Kopyala</button>
                  <button class="mini-button danger" type="button" data-coupon-action="delete" data-id="${escapeHtml(coupon.id)}">Sil</button>
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">Henüz kampanya kuponu yok.</div>';
}

async function saveAdminCoupons(coupons) {
  await adminApi("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ coupons: normalizeCoupons(coupons) })
  });
}

function currentAdminVisualBlocks() {
  return visualBlocks(state.admin.data?.settings || {}, { includeDrafts: true });
}

function renderVisualProductOptions(query = "") {
  const datalist = qs("[data-visual-product-list]");
  const products = state.admin.data?.products || [];
  if (!datalist || !products.length) return;
  const normalized = String(query || "").trim().toLowerCase();
  const matches = products
    .filter((product) => {
      if (!normalized) return product.status === "active" || product.featured;
      return `${product.name || ""} ${product.slug || ""} ${categoryDisplay(product)}`.toLowerCase().includes(normalized);
    })
    .sort((a, b) => productMerchandisingScore(b) - productMerchandisingScore(a))
    .slice(0, 120);
  datalist.innerHTML = matches
    .map(
      (product) =>
        `<option value="${escapeHtml(product.slug || product.id)}">${escapeHtml(product.name)} · ${escapeHtml(categoryDisplay(product))}</option>`
    )
    .join("");
}

function renderVisualPlacementControls() {
  const placementOptions = Object.entries(VISUAL_PLACEMENTS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  const placementSelect = qs("[data-visual-placement-select]");
  if (placementSelect) {
    const current = placementSelect.value || "home-hero";
    placementSelect.innerHTML = placementOptions;
    placementSelect.value = VISUAL_PLACEMENTS[current] ? current : "home-hero";
  }
  const filterSelect = qs("[data-visual-placement-filter]");
  if (filterSelect) {
    const current = state.admin.visualPlacementFilter || filterSelect.value || "all";
    filterSelect.innerHTML = `<option value="all">Tüm vitrin alanları</option>${placementOptions}`;
    filterSelect.value = current === "all" || VISUAL_PLACEMENTS[current] ? current : "all";
    state.admin.visualPlacementFilter = filterSelect.value;
  }
}

function adminVisualMatchesFilters(block) {
  const query = String(state.admin.visualSearch || "").trim().toLowerCase();
  const placement = state.admin.visualPlacementFilter || "all";
  if (placement !== "all" && block.placement !== placement) return false;
  if (!query) return true;
  const product = productByVisualKey(block.productSlug, state.admin.data?.products || []);
  return [
    block.title,
    block.kicker,
    block.subtitle,
    block.productSlug,
    block.href,
    VISUAL_PLACEMENTS[block.placement],
    product?.name
  ]
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function visualFormPayload(form) {
  const formData = new FormData(form);
  const productInput = String(formData.get("productSlug") || "").trim();
  const product = productByVisualKey(productInput, state.admin.data?.products || []);
  return normalizeVisualBlock(
    {
      id: formData.get("id") || state.admin.editingVisualId || "",
      placement: formData.get("placement"),
      status: formData.get("status"),
      title: formData.get("title"),
      kicker: formData.get("kicker"),
      subtitle: formData.get("subtitle"),
      image: formData.get("image"),
      productSlug: product?.slug || productInput,
      href: formData.get("href"),
      cta: formData.get("cta"),
      theme: formData.get("theme"),
      shape: formData.get("shape"),
      crop: formData.get("crop"),
      objectPosition: formData.get("objectPosition"),
      showText: form.elements.showText?.checked !== false,
      sortOrder: formData.get("sortOrder")
    },
    currentAdminVisualBlocks().length + 10
  );
}

function renderVisualFormPreview(block = null) {
  const root = qs("[data-admin-visual-preview]");
  if (!root) return;
  if (!block?.image) {
    root.innerHTML = `
      <span>Vitrin önizleme</span>
      <strong>Bir görsel seçildiğinde burada görünür.</strong>
    `;
    return;
  }
  const title = visualBlockTitle(block, "Vitrin görseli");
  root.innerHTML = `
    <img src="${escapeHtml(block.image)}" alt="${escapeHtml(title)}" style="${escapeHtml(visualImageStyle(block))}" />
    <div>
      <span>${escapeHtml(VISUAL_PLACEMENTS[block.placement] || "Vitrin")}</span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(block.subtitle || block.kicker || "Tıklanınca seçilen ürün açılır.")}</p>
      <small>${escapeHtml(VISUAL_SHAPES[block.shape] || "Kare")} · ${escapeHtml(IMAGE_FITS[block.crop] || "Kırp")}</small>
      <em>${escapeHtml(productByVisualKey(block.productSlug, state.admin.data?.products || [])?.name || block.productSlug || block.href || "Ürün veya link seçilmedi")}</em>
    </div>
  `;
}

function fillVisualForm(block = null) {
  const form = qs("[data-visual-form]");
  if (!form) return;
  renderVisualPlacementControls();
  const visual = block ? normalizeVisualBlock(block) : null;
  state.admin.editingVisualId = visual?.id || "";
  form.reset();
  form.elements.id.value = visual?.id || "";
  form.elements.placement.value = visual?.placement || "home-hero";
  form.elements.status.value = visual?.status || "active";
  form.elements.title.value = visual?.title || "";
  form.elements.kicker.value = visual?.kicker || "";
  form.elements.productSlug.value = visual?.productSlug || "";
  if (form.elements.href) form.elements.href.value = visual?.href || "";
  form.elements.sortOrder.value = visual?.sortOrder ?? 10;
  form.elements.theme.value = visual?.theme || "editorial";
  if (form.elements.shape) form.elements.shape.value = visual?.shape || "square";
  if (form.elements.crop) form.elements.crop.value = normalizeImageFit(visual?.crop || "cover");
  if (form.elements.objectPosition) form.elements.objectPosition.value = normalizeImagePosition(visual?.objectPosition || "center center");
  form.elements.cta.value = visual?.cta || "";
  if (form.elements.showText) form.elements.showText.checked = visual?.showText !== false;
  form.elements.image.value = visual?.image || "";
  form.elements.subtitle.value = visual?.subtitle || "";
  renderVisualProductOptions(visual?.productSlug || "");
  renderVisualFormPreview(visual);
  const status = qs("[data-visual-status]");
  if (status) status.textContent = visual ? "Vitrin görseli düzenleniyor." : "Yeni vitrin görseli hazır.";
}

function reorderItemsById(items = [], sourceId = "", targetId = "") {
  const ordered = [...items];
  const sourceIndex = ordered.findIndex((item) => item.id === sourceId);
  const targetIndex = ordered.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return ordered;
  const [source] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, source);
  return ordered.map((item, index) => ({
    ...item,
    sortOrder: (index + 1) * 10
  }));
}

function moveItemById(items = [], id = "", direction = 0) {
  const ordered = [...items];
  const index = ordered.findIndex((item) => item.id === id);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= ordered.length) return ordered;
  const [source] = ordered.splice(index, 1);
  ordered.splice(targetIndex, 0, source);
  return ordered.map((item, nextIndex) => ({
    ...item,
    sortOrder: (nextIndex + 1) * 10
  }));
}

function renderAdminVisuals() {
  const root = qs("[data-admin-visual-list]");
  if (!root) return;
  renderVisualPlacementControls();
  renderVisualProductOptions(qs("[data-visual-product-input]")?.value || "");
  const allBlocks = currentAdminVisualBlocks();
  const blocks = allBlocks.filter(adminVisualMatchesFilters);
  if (!qs("[data-visual-form]")?.elements.id.value && !qs("[data-visual-form]")?.elements.image.value) {
    renderVisualFormPreview(null);
  }
  root.innerHTML = blocks.length
    ? blocks
        .map((block) => {
          const product = productByVisualKey(block.productSlug, state.admin.data?.products || []);
          const title = visualBlockTitle(block, "Mevcut site görseli");
          return `
            <article class="admin-visual-item" draggable="true" data-visual-drag="${escapeHtml(block.id)}">
              <img src="${escapeHtml(block.image)}" alt="${escapeHtml(title)}" />
              <div>
                <div class="admin-visual-item__top">
                  <span class="pill ${block.status === "active" ? "pill-strong" : ""}">${block.status === "active" ? "Yayında" : "Taslak"}</span>
                  <span class="pill">${escapeHtml(VISUAL_PLACEMENTS[block.placement] || block.placement)}</span>
                  <span class="pill">${escapeHtml(VISUAL_SHAPES[block.shape] || "Kare")}</span>
                </div>
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(product?.name || block.productSlug || block.href || "Ürün/link bağlantısı yok")}</p>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-visual-action="up" data-id="${escapeHtml(block.id)}">Yukarı</button>
                  <button class="mini-button" type="button" data-visual-action="down" data-id="${escapeHtml(block.id)}">Aşağı</button>
                  <button class="mini-button" type="button" data-visual-action="edit" data-id="${escapeHtml(block.id)}">Düzenle</button>
                  <button class="mini-button" type="button" data-visual-action="status" data-id="${escapeHtml(block.id)}">${block.status === "active" ? "Taslak yap" : "Yayına al"}</button>
                  <button class="mini-button" type="button" data-visual-action="duplicate" data-id="${escapeHtml(block.id)}">Kopyala</button>
                  <button class="mini-button danger" type="button" data-visual-action="delete" data-id="${escapeHtml(block.id)}">Sil</button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : allBlocks.length
      ? '<div class="empty-state">Bu filtrede vitrin görseli yok. Lookbook, ödeme veya marka alanını seçerek diğer görselleri görebilirsin.</div>'
      : '<div class="empty-state">Henüz vitrin görseli eklenmedi.</div>';
}

async function saveAdminVisualBlocks(blocks) {
  const normalizedBlocks = blocks.map((block, index) => normalizeVisualBlock(block, index)).filter((block) => block.image);
  await adminApi("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ visualBlocks: normalizedBlocks })
  });
}

function currentAdminHomeSections() {
  return homeSections(state.admin.data?.settings || {}, { includeDrafts: true });
}

function renderAdminHomeSections() {
  const root = qs("[data-admin-home-section-list]");
  if (!root) return;
  const sections = currentAdminHomeSections();
  root.innerHTML = sections
    .map(
      (section, index) => `
        <article class="admin-shelf-item" draggable="true" data-home-section-drag="${escapeHtml(section.id)}">
          <div>
            <div class="admin-visual-item__top">
              <span class="pill ${section.status === "active" ? "pill-strong" : ""}">${section.status === "active" ? "Yayında" : "Gizli"}</span>
              <span class="pill">${String(index + 1).padStart(2, "0")}</span>
            </div>
            <h3>${escapeHtml(section.label || HOME_SECTION_LABELS[section.id] || section.id)}</h3>
            <p>${escapeHtml(section.id)}</p>
            <div class="row-actions">
              <button class="mini-button" type="button" data-home-section-action="up" data-id="${escapeHtml(section.id)}">Yukarı</button>
              <button class="mini-button" type="button" data-home-section-action="down" data-id="${escapeHtml(section.id)}">Aşağı</button>
              <button class="mini-button" type="button" data-home-section-action="status" data-id="${escapeHtml(section.id)}">${section.status === "active" ? "Gizle" : "Göster"}</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

async function saveAdminHomeSections(sections) {
  const normalizedSections = sections.map((section, index) => normalizeHomeSection(section, index));
  await adminApi("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ homeSections: normalizedSections })
  });
}

function currentAdminDynamicShelves() {
  return dynamicShelves(state.admin.data?.settings || {}, { includeDrafts: true });
}

function shelfFormPayload(form) {
  const formData = new FormData(form);
  return normalizeDynamicShelf(
    {
      id: formData.get("id") || state.admin.editingShelfId || "",
      title: formData.get("title"),
      label: formData.get("label"),
      status: formData.get("status"),
      mode: formData.get("mode"),
      limit: formData.get("limit"),
      sortOrder: formData.get("sortOrder"),
      category: formData.get("category"),
      subcategory: formData.get("subcategory"),
      productSlugs: formData.get("productSlugs")
    },
    currentAdminDynamicShelves().length + 10
  );
}

function renderShelfFormPreview(shelf = null) {
  const root = qs("[data-admin-shelf-preview]");
  if (!root) return;
  if (!shelf?.title) {
    root.innerHTML = `
      <span>Raf önizleme</span>
      <strong>Bir raf seçildiğinde burada görünür.</strong>
    `;
    return;
  }
  const products = productsForDynamicShelf(shelf, state.admin.data?.products || []);
  const firstProduct = products[0] || null;
  root.innerHTML = `
    ${firstProduct?.image ? `<img src="${escapeHtml(firstProduct.image)}" alt="${escapeHtml(firstProduct.name)}" />` : ""}
    <div>
      <span>${escapeHtml(shelf.label || DYNAMIC_SHELF_MODES[shelf.mode] || "Canlı raf")}</span>
      <strong>${escapeHtml(shelf.title)}</strong>
      <p>${products.length} ürün · ${escapeHtml(DYNAMIC_SHELF_MODES[shelf.mode] || shelf.mode)}</p>
      <em>${products.slice(0, 3).map((product) => escapeHtml(product.name)).join(" · ") || "Ürün seçimi yok"}</em>
    </div>
  `;
}

function fillShelfForm(shelf = null) {
  const form = qs("[data-shelf-form]");
  if (!form) return;
  const normalizedShelf = shelf ? normalizeDynamicShelf(shelf) : null;
  state.admin.editingShelfId = normalizedShelf?.id || "";
  form.reset();
  form.elements.id.value = normalizedShelf?.id || "";
  form.elements.title.value = normalizedShelf?.title || "";
  form.elements.label.value = normalizedShelf?.label || "";
  form.elements.status.value = normalizedShelf?.status || "active";
  form.elements.mode.value = normalizedShelf?.mode || "manual";
  form.elements.limit.value = normalizedShelf?.limit || 4;
  form.elements.sortOrder.value = normalizedShelf?.sortOrder ?? 10;
  form.elements.category.value = normalizedShelf?.category || "";
  form.elements.subcategory.value = normalizedShelf?.subcategory || "";
  form.elements.productSlugs.value = (normalizedShelf?.productSlugs || []).join("\n");
  updateSubcategoryDatalist(form.elements.category.value);
  renderShelfFormPreview(normalizedShelf);
  const status = qs("[data-shelf-status]");
  if (status) status.textContent = normalizedShelf ? "Canlı raf düzenleniyor." : "Yeni canlı raf hazır.";
}

function renderAdminDynamicShelves() {
  const root = qs("[data-admin-shelf-list]");
  if (!root) return;
  const shelves = currentAdminDynamicShelves();
  if (!qs("[data-shelf-form]")?.elements.id.value && !qs("[data-shelf-form]")?.elements.title.value) {
    renderShelfFormPreview(null);
  }
  root.innerHTML = shelves.length
    ? shelves
        .map((shelf) => {
          const products = productsForDynamicShelf(shelf, state.admin.data?.products || []);
          return `
            <article class="admin-shelf-item" draggable="true" data-shelf-drag="${escapeHtml(shelf.id)}">
              <div>
                <div class="admin-visual-item__top">
                  <span class="pill ${shelf.status === "active" ? "pill-strong" : ""}">${shelf.status === "active" ? "Yayında" : "Taslak"}</span>
                  <span class="pill">${escapeHtml(DYNAMIC_SHELF_MODES[shelf.mode] || shelf.mode)}</span>
                </div>
                <h3>${escapeHtml(shelf.title)}</h3>
                <p>${products.length} ürün · ${escapeHtml([shelf.category, shelf.subcategory].filter(Boolean).join(" / ") || "Tüm katalog")}</p>
                <small>${products.slice(0, 4).map((product) => escapeHtml(product.name)).join(" · ") || "Ürün bulunamadı"}</small>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-shelf-action="up" data-id="${escapeHtml(shelf.id)}">Yukarı</button>
                  <button class="mini-button" type="button" data-shelf-action="down" data-id="${escapeHtml(shelf.id)}">Aşağı</button>
                  <button class="mini-button" type="button" data-shelf-action="edit" data-id="${escapeHtml(shelf.id)}">Düzenle</button>
                  <button class="mini-button" type="button" data-shelf-action="status" data-id="${escapeHtml(shelf.id)}">${shelf.status === "active" ? "Taslak yap" : "Yayına al"}</button>
                  <button class="mini-button" type="button" data-shelf-action="duplicate" data-id="${escapeHtml(shelf.id)}">Kopyala</button>
                  <button class="mini-button danger" type="button" data-shelf-action="delete" data-id="${escapeHtml(shelf.id)}">Sil</button>
                </div>
              </div>
            </article>
          `;
        })
        .join("")
    : '<div class="empty-state">Henüz canlı raf eklenmedi.</div>';
}

async function saveAdminDynamicShelves(shelves) {
  const normalizedShelves = shelves.map((shelf, index) => normalizeDynamicShelf(shelf, index));
  await adminApi("/api/admin/settings", {
    method: "PUT",
    body: JSON.stringify({ dynamicShelves: normalizedShelves })
  });
}

function renderMessages() {
  const root = qs("[data-message-list]");
  const messages = state.admin.data?.messages || [];
  if (!root) return;
  root.innerHTML = messages.length
    ? messages
        .map(
          (message) => `
            <article class="message-item ${message.read ? "" : "is-unread"}">
              <div class="message-item__top">
                <div>
                  <h3>${escapeHtml(message.name)}</h3>
                  <p>${escapeHtml(message.email)} · ${new Date(message.createdAt).toLocaleString("tr-TR")}</p>
                </div>
                <div class="row-actions">
                  ${
                    message.read
                      ? ""
                      : `<button class="mini-button" type="button" data-message-action="read" data-id="${escapeHtml(message.id)}">Okundu</button>`
                  }
                  <button class="mini-button danger" type="button" data-message-action="delete" data-id="${escapeHtml(message.id)}">Sil</button>
                </div>
              </div>
              <p>${escapeHtml(message.message)}</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">Henüz mesaj yok.</div>';
}

function renderAdminOrders() {
  const root = qs("[data-admin-orders]");
  const orders = state.admin.data?.orders || [];
  if (!root) return;
  root.innerHTML = orders.length
    ? orders
        .map(
          (order) => `
            <article class="admin-order-item">
              <div class="admin-order-item__top">
                <div>
                  <span class="pill pill-strong">${escapeHtml(order.status)}</span>
                  <h3>${escapeHtml(order.number)}</h3>
                  <p>${escapeHtml(order.contact?.name || "")} · ${escapeHtml(order.contact?.email || "")} · ${new Date(order.createdAt).toLocaleString("tr-TR")}</p>
                </div>
                <strong>${formatPrice({ price: order.totals?.total || 0, currency: order.totals?.currency || "TRY" })}</strong>
              </div>
              <div class="admin-order-details">
                <div>
                  <span>Teslimat</span>
                  <p>${escapeHtml(order.shippingAddress?.city || "")} / ${escapeHtml(order.shippingAddress?.district || "")} / ${escapeHtml(order.shippingAddress?.neighborhood || "")}</p>
                  <small>${escapeHtml(order.shippingAddress?.address || "")}</small>
                </div>
                <div>
                  <span>Ödeme</span>
                  <p>${escapeHtml(order.paymentStatus || "")}</p>
                  <small>${escapeHtml(order.paymentProvider || order.paymentMethod || "")} · ${escapeHtml(order.paymentReference || "")}</small>
                </div>
                <div>
                  <span>Kargo takip</span>
                  <p>${escapeHtml(order.shippingCarrier || "Firma yok")} / ${escapeHtml(order.trackingNumber || "Kod yok")}</p>
                  <small>${order.giftWrap ? "Hediye paketli" : "Standart paket"} · ${escapeHtml(order.invoiceType || "personal")}</small>
                </div>
              </div>
              ${
                order.returnRequest
                  ? `<div class="admin-order-alert"><strong>İade talebi: ${escapeHtml(order.returnRequest.status)}</strong><p>${escapeHtml(order.returnRequest.reason || "")}</p></div>`
                  : ""
              }
              ${
                Array.isArray(order.timeline) && order.timeline.length
                  ? `<div class="order-timeline">${order.timeline
                      .slice(0, 4)
                      .map((item) => `<span><strong>${escapeHtml(item.status)}</strong>${escapeHtml(item.note || "")}</span>`)
                      .join("")}</div>`
                  : ""
              }
              ${
                Array.isArray(order.notifications) && order.notifications.length
                  ? `<div class="order-timeline">${order.notifications
                      .slice(0, 3)
                      .map((item) => `<span><strong>${escapeHtml(item.type || "bildirim")}</strong>${escapeHtml(item.message || "")}</span>`)
                      .join("")}</div>`
                  : ""
              }
              <div class="admin-order-lines">
                ${(order.items || [])
                  .map(
                    (item) => `
                      <span>${escapeHtml(item.name)} · ${escapeHtml(item.size)} · ${escapeHtml(item.color)} · ${item.quantity} adet</span>
                    `
                  )
                  .join("")}
              </div>
              <div class="admin-shipping-editor">
                <input data-order-carrier="${escapeHtml(order.id)}" placeholder="Kargo firması" value="${escapeHtml(order.shippingCarrier || "")}" />
                <input data-order-tracking="${escapeHtml(order.id)}" placeholder="Takip kodu" value="${escapeHtml(order.trackingNumber || "")}" />
                <button class="mini-button" type="button" data-order-save-shipping="${escapeHtml(order.id)}">Takip kaydet</button>
              </div>
              <div class="row-actions">
                <button class="mini-button" type="button" data-order-action="Hazırlanıyor" data-id="${escapeHtml(order.id)}">Hazırlanıyor</button>
                <button class="mini-button" type="button" data-order-action="Kargoda" data-id="${escapeHtml(order.id)}">Kargoda</button>
                <button class="mini-button" type="button" data-order-action="Tamamlandı" data-id="${escapeHtml(order.id)}">Tamamlandı</button>
                <button class="mini-button" type="button" data-order-payment="Ödeme alındı" data-id="${escapeHtml(order.id)}">Ödeme alındı</button>
                <button class="mini-button" type="button" data-invoice-download="${escapeHtml(order.id)}">Fatura</button>
                ${
                  order.returnRequest
                    ? `<button class="mini-button" type="button" data-return-status="Onaylandı" data-id="${escapeHtml(order.id)}">İade onay</button><button class="mini-button" type="button" data-return-status="Reddedildi" data-id="${escapeHtml(order.id)}">İade ret</button>`
                    : ""
                }
                <button class="mini-button danger" type="button" data-order-action="İptal" data-id="${escapeHtml(order.id)}">İptal</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">Henüz sipariş yok.</div>';
}

function renderAdminCustomers() {
  const root = qs("[data-admin-customers]");
  const customers = state.admin.data?.customers || [];
  const orders = state.admin.data?.orders || [];
  if (!root) return;
  root.innerHTML = customers.length
    ? customers
        .map((customer) => {
          const customerOrders = orders.filter((order) => order.customerId === customer.id);
          const total = customerOrders.reduce((sum, order) => sum + (Number(order.totals?.total) || 0), 0);
          const segment = total >= 5000 ? "VIP" : customerOrders.length >= 2 ? "Tekrar müşteri" : "Yeni müşteri";
          return `
            <article class="admin-customer-item">
              <div>
                <h3>${escapeHtml(customer.name)}</h3>
                <p>${escapeHtml(customer.email)} · ${escapeHtml(customer.phone || "Telefon yok")} · ${escapeHtml(segment)}</p>
              </div>
              <div>
                <span>${customerOrders.length} sipariş</span>
                <strong>${formatPrice({ price: total, currency: "TRY" })}</strong>
              </div>
            </article>
          `;
        })
        .join("")
    : '<div class="empty-state">Henüz üye yok.</div>';
}

function renderAdminReviews() {
  const root = qs("[data-admin-reviews]");
  const products = state.admin.data?.products || [];
  if (!root) return;
  const reviews = products.flatMap((product) =>
    (product.reviews || []).map((review) => ({
      ...review,
      productId: product.id,
      productName: product.name
    }))
  );
  root.innerHTML = reviews.length
    ? reviews
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .map(
          (review) => `
            <article class="message-item ${review.status === "pending" ? "is-unread" : ""}">
              <div class="message-item__top">
                <div>
                  <h3>${escapeHtml(review.productName)} · ${escapeHtml(review.rating || "5.0")}/5</h3>
                  <p>${escapeHtml(review.author || "Müşteri")} · ${escapeHtml(review.email || "E-posta yok")} · ${escapeHtml(review.status || "pending")}</p>
                </div>
                <div class="row-actions">
                  <button class="mini-button" type="button" data-review-action="approved" data-product-id="${escapeHtml(review.productId)}" data-id="${escapeHtml(review.id)}">Onayla</button>
                  <button class="mini-button" type="button" data-review-action="rejected" data-product-id="${escapeHtml(review.productId)}" data-id="${escapeHtml(review.id)}">Reddet</button>
                  <button class="mini-button danger" type="button" data-review-action="delete" data-product-id="${escapeHtml(review.productId)}" data-id="${escapeHtml(review.id)}">Sil</button>
                </div>
              </div>
              <p>${escapeHtml(review.text || "")}</p>
            </article>
          `
        )
        .join("")
    : '<div class="empty-state">Henüz ürün yorumu yok.</div>';
}

function downloadJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `threon-veri-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadInvoice(orderId) {
  const order = state.accountOrders?.find((item) => item.id === orderId) || state.admin.data?.orders?.find((item) => item.id === orderId);
  if (!order) return;
  const lines = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.size)} / ${escapeHtml(item.color)}</td>
          <td>${item.quantity}</td>
          <td>${formatPrice({ price: item.subtotal, currency: order.totals.currency })}</td>
        </tr>
      `
    )
    .join("");
  const html = `<!doctype html><html lang="tr"><meta charset="utf-8"><title>${escapeHtml(order.number)} Fatura</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:32px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border:1px solid #ddd;padding:10px;text-align:left}.total{font-size:22px;font-weight:800;text-align:right}</style><h1>THREON Fatura</h1><p><strong>Sipariş:</strong> ${escapeHtml(order.number)}</p><p><strong>Müşteri:</strong> ${escapeHtml(order.contact?.name || "")} · ${escapeHtml(order.contact?.email || "")}</p><p><strong>Ödeme:</strong> ${escapeHtml(order.paymentProvider || "")} · ${escapeHtml(order.paymentReference || "")}</p><table><thead><tr><th>Ürün</th><th>Varyant</th><th>Adet</th><th>Tutar</th></tr></thead><tbody>${lines}</tbody></table><p class="total">Toplam: ${formatPrice({ price: order.totals.total, currency: order.totals.currency })}</p></html>`;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${order.number}-fatura.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(new Error("Görsel okunamadı.")));
    reader.readAsDataURL(file);
  });
}

function optimizedImageDataUrl(file, maxSize = 2600, quality = 0.9) {
  if (!file?.type?.startsWith("image/")) {
    return Promise.reject(new Error("Lütfen bir görsel dosyası seçin."));
  }
  if (/svg|gif/i.test(file.type)) {
    return readFileAsDataUrl(file);
  }
  return new Promise((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.addEventListener("load", () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        readFileAsDataUrl(file).then(resolve);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", quality));
    });
    image.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      readFileAsDataUrl(file).then(resolve);
    });
    image.src = url;
  });
}

async function uploadAdminImage(file, options = {}) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Lütfen bir görsel dosyası seçin.");
  }
  const maxSize = Number(options.maxSize) || 2800;
  const quality = Number(options.quality) || 0.9;
  const dataUrl = await optimizedImageDataUrl(file, maxSize, quality);
  const result = await adminApi("/api/admin/upload", {
    method: "POST",
    body: JSON.stringify({
      name: file.name || "threon-gorsel.jpg",
      context: options.context || "admin",
      dataUrl
    })
  });
  return result.path || result.url || dataUrl;
}

function initAdminEvents() {
  qs("[data-login-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-login-status]");
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "");
    const password = String(formData.get("password") || "");
    status.textContent = "Giriş yapılıyor...";
    try {
      const data = await fetchJson("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username,
          password
        })
      });
      if (!data.token) {
        throw new Error("API giriş anahtarı dönmedi.");
      }
      state.admin.mode = "api";
      state.admin.token = data.token;
      sessionStorage.setItem(STORAGE_KEYS.adminMode, "api");
      sessionStorage.setItem("threonAdminToken", data.token);
      showDashboard();
      await loadAdminData();
      status.textContent = "";
    } catch (error) {
      if (username === "admin" && password === "admin1" && looksLikeOfflineApiError(error)) {
        state.admin.mode = "local";
        state.admin.token = `local-${Date.now().toString(36)}`;
        sessionStorage.setItem(STORAGE_KEYS.adminMode, "local");
        sessionStorage.setItem("threonAdminToken", state.admin.token);
        showDashboard();
        await loadAdminData();
        status.textContent = "";
        return;
      }
      status.textContent = error.message || "Giriş tamamlanamadı.";
    }
  });

  qs("[data-logout]")?.addEventListener("click", () => {
    sessionStorage.removeItem("threonAdminToken");
    sessionStorage.removeItem(STORAGE_KEYS.adminMode);
    state.admin.token = "";
    state.admin.mode = "api";
    showLogin();
  });

  qs("[data-new-product]")?.addEventListener("click", () => fillProductForm());
  qs("[data-reset-product]")?.addEventListener("click", () => fillProductForm());

  const productForm = qs("[data-product-form]");
  productForm?.elements.name.addEventListener("input", () => {
    if (!productForm.elements.slug.value.trim()) {
      productForm.elements.slug.value = slugify(productForm.elements.name.value);
    }
  });

  productForm?.elements.category.addEventListener("input", () => {
    updateSubcategoryDatalist(productForm.elements.category.value);
  });

  qs("[data-product-image-upload]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const status = qs("[data-product-status]");
    if (!file || !productForm) return;
    if (status) status.textContent = "Yüksek çözünürlüklü görsel optimize edilip yükleniyor...";
    try {
      const imagePath = await uploadAdminImage(file, { context: "product", maxSize: 3000, quality: 0.9 });
      productForm.elements.image.value = imagePath;
      renderProductFormPreview(productFormPayload(productForm));
      if (status) status.textContent = "Görsel yüklendi. Ürünü kaydettiğinde sitede kullanılacak.";
    } catch (error) {
      if (status) status.textContent = error.message || "Görsel yüklenemedi.";
    }
  });

  productForm?.addEventListener("input", () => {
    renderProductFormPreview(productFormPayload(productForm));
  });

  productForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-product-status]");
    const payload = productFormPayload(productForm);
    const editingId = state.admin.editingProductId;
    status.textContent = "Kaydediliyor...";
    try {
      if (editingId) {
        await adminApi(`/api/admin/products/${encodeURIComponent(editingId)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
      } else {
        await adminApi("/api/admin/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }
      await loadAdminData();
      fillProductForm();
      status.textContent = "Ürün kaydedildi.";
    } catch (error) {
      status.textContent = error.message;
    }
  });

  qs("[data-admin-product-search]")?.addEventListener("input", (event) => {
    state.admin.productSearch = event.currentTarget.value;
    state.admin.productVisible = 120;
    renderAdminProducts();
  });

  qs("[data-admin-status-filter]")?.addEventListener("change", (event) => {
    state.admin.statusFilter = event.currentTarget.value;
    state.admin.productVisible = 120;
    renderAdminProducts();
  });

  qs("[data-admin-product-list]")?.addEventListener("click", async (event) => {
    if (event.target.closest("[data-admin-products-more]")) {
      state.admin.productVisible += 120;
      renderAdminProducts();
      return;
    }
    const button = event.target.closest("[data-product-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.productAction;
    const product = state.admin.data.products.find((item) => item.id === id);
    if (!product) return;

    if (action === "edit") {
      fillProductForm(product);
      qs("[data-product-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete" && !confirm(`${product.name} silinsin mi?`)) {
      return;
    }

    try {
      if (action === "status") {
        await adminApi(`/api/admin/products/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({ ...product, status: product.status === "active" ? "draft" : "active" })
        });
      }
      if (action === "duplicate") {
        await adminApi(`/api/admin/products/${encodeURIComponent(id)}/duplicate`, { method: "POST" });
      }
      if (action === "delete") {
        await adminApi(`/api/admin/products/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  qs("[data-new-visual]")?.addEventListener("click", () => fillVisualForm());
  qs("[data-reset-visual]")?.addEventListener("click", () => fillVisualForm());

  const visualForm = qs("[data-visual-form]");
  renderVisualPlacementControls();
  qs("[data-visual-placement-filter]")?.addEventListener("change", (event) => {
    state.admin.visualPlacementFilter = event.currentTarget.value || "all";
    renderAdminVisuals();
  });
  qs("[data-visual-search]")?.addEventListener("input", (event) => {
    state.admin.visualSearch = event.currentTarget.value || "";
    renderAdminVisuals();
  });
  visualForm?.addEventListener("input", (event) => {
    if (event.target.matches("[data-visual-product-input]")) {
      renderVisualProductOptions(event.target.value);
    }
    renderVisualFormPreview(visualFormPayload(visualForm));
  });

  qs("[data-visual-image-upload]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    const status = qs("[data-visual-status]");
    if (!file || !visualForm) return;
    if (status) status.textContent = "Yüksek çözünürlüklü görsel optimize edilip yükleniyor...";
    try {
      const imagePath = await uploadAdminImage(file, { context: "visual", maxSize: 3200, quality: 0.9 });
      visualForm.elements.image.value = imagePath;
      renderVisualFormPreview(visualFormPayload(visualForm));
      if (status) status.textContent = "Görsel yüklendi. Kaydettiğinde sitede kullanılacak.";
    } catch (error) {
      if (status) status.textContent = error.message || "Görsel yüklenemedi.";
    }
  });

  visualForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-visual-status]");
    const payload = visualFormPayload(visualForm);
    const blocks = currentAdminVisualBlocks();
    const editingId = state.admin.editingVisualId;
    const index = blocks.findIndex((block) => block.id === editingId);
    if (status) status.textContent = "Vitrin görseli kaydediliyor...";
    try {
      if (index >= 0) {
        blocks[index] = payload;
      } else {
        blocks.unshift({ ...payload, id: payload.id || makeLocalId() });
      }
      await saveAdminVisualBlocks(blocks);
      await loadAdminData();
      fillVisualForm();
      const nextStatus = qs("[data-visual-status]");
      if (nextStatus) nextStatus.textContent = "Vitrin görseli kaydedildi.";
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  qs("[data-admin-visual-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-visual-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.visualAction;
    const blocks = currentAdminVisualBlocks();
    const index = blocks.findIndex((block) => block.id === id);
    const block = blocks[index];
    if (!block) return;

    if (action === "edit") {
      fillVisualForm(block);
      qs("[data-visual-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete" && !confirm(`${block.title || "Bu vitrin görseli"} silinsin mi?`)) {
      return;
    }

    try {
      if (action === "up" || action === "down") {
        await saveAdminVisualBlocks(moveItemById(blocks, id, action === "up" ? -1 : 1));
        await loadAdminData();
        return;
      }
      if (action === "status") {
        blocks[index] = { ...block, status: block.status === "active" ? "draft" : "active" };
      }
      if (action === "duplicate") {
        blocks.unshift({
          ...block,
          id: makeLocalId(),
          title: `${block.title || "Vitrin görseli"} Kopya`,
          status: "draft",
          sortOrder: Number(block.sortOrder || 0) + 1
        });
      }
      if (action === "delete") {
        blocks.splice(index, 1);
      }
      await saveAdminVisualBlocks(blocks);
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });
  let draggedVisualId = "";
  qs("[data-admin-visual-list]")?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-visual-drag]");
    draggedVisualId = item?.dataset.visualDrag || "";
    event.dataTransfer?.setData("text/plain", draggedVisualId);
  });
  qs("[data-admin-visual-list]")?.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-visual-drag]")) event.preventDefault();
  });
  qs("[data-admin-visual-list]")?.addEventListener("drop", async (event) => {
    const target = event.target.closest("[data-visual-drag]");
    const sourceId = event.dataTransfer?.getData("text/plain") || draggedVisualId;
    const targetId = target?.dataset.visualDrag || "";
    if (!sourceId || !targetId || sourceId === targetId) return;
    event.preventDefault();
    try {
      await saveAdminVisualBlocks(reorderItemsById(currentAdminVisualBlocks(), sourceId, targetId));
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    } finally {
      draggedVisualId = "";
    }
  });

  qs("[data-admin-home-section-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-home-section-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.homeSectionAction;
    const sections = currentAdminHomeSections();
    const index = sections.findIndex((section) => section.id === id);
    const section = sections[index];
    if (!section) return;
    try {
      if (action === "up" || action === "down") {
        await saveAdminHomeSections(moveItemById(sections, id, action === "up" ? -1 : 1));
        await loadAdminData();
        return;
      }
      if (action === "status") {
        sections[index] = { ...section, status: section.status === "active" ? "draft" : "active" };
        await saveAdminHomeSections(sections);
        await loadAdminData();
      }
    } catch (error) {
      setAdminStatus(error.message);
    }
  });
  let draggedHomeSectionId = "";
  qs("[data-admin-home-section-list]")?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-home-section-drag]");
    draggedHomeSectionId = item?.dataset.homeSectionDrag || "";
    event.dataTransfer?.setData("text/plain", draggedHomeSectionId);
  });
  qs("[data-admin-home-section-list]")?.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-home-section-drag]")) event.preventDefault();
  });
  qs("[data-admin-home-section-list]")?.addEventListener("drop", async (event) => {
    const target = event.target.closest("[data-home-section-drag]");
    const sourceId = event.dataTransfer?.getData("text/plain") || draggedHomeSectionId;
    const targetId = target?.dataset.homeSectionDrag || "";
    if (!sourceId || !targetId || sourceId === targetId) return;
    event.preventDefault();
    try {
      await saveAdminHomeSections(reorderItemsById(currentAdminHomeSections(), sourceId, targetId));
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    } finally {
      draggedHomeSectionId = "";
    }
  });

  qs("[data-new-shelf]")?.addEventListener("click", () => fillShelfForm());
  qs("[data-reset-shelf]")?.addEventListener("click", () => fillShelfForm());

  const shelfForm = qs("[data-shelf-form]");
  shelfForm?.elements.category.addEventListener("input", () => {
    updateSubcategoryDatalist(shelfForm.elements.category.value);
    renderShelfFormPreview(shelfFormPayload(shelfForm));
  });
  shelfForm?.addEventListener("input", () => {
    renderShelfFormPreview(shelfFormPayload(shelfForm));
  });
  shelfForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-shelf-status]");
    const payload = shelfFormPayload(shelfForm);
    const shelves = currentAdminDynamicShelves();
    const editingId = state.admin.editingShelfId;
    const index = shelves.findIndex((shelf) => shelf.id === editingId);
    if (status) status.textContent = "Canlı raf kaydediliyor...";
    try {
      if (index >= 0) {
        shelves[index] = payload;
      } else {
        const nextId = shelves.some((shelf) => shelf.id === payload.id) ? makeLocalId() : payload.id || makeLocalId();
        shelves.unshift({ ...payload, id: nextId });
      }
      await saveAdminDynamicShelves(shelves);
      await loadAdminData();
      fillShelfForm();
      const nextStatus = qs("[data-shelf-status]");
      if (nextStatus) nextStatus.textContent = "Canlı raf kaydedildi.";
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  qs("[data-admin-shelf-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-shelf-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.shelfAction;
    const shelves = currentAdminDynamicShelves();
    const index = shelves.findIndex((shelf) => shelf.id === id);
    const shelf = shelves[index];
    if (!shelf) return;

    if (action === "edit") {
      fillShelfForm(shelf);
      qs("[data-shelf-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete" && !confirm(`${shelf.title || "Bu canlı raf"} silinsin mi?`)) {
      return;
    }

    try {
      if (action === "up" || action === "down") {
        await saveAdminDynamicShelves(moveItemById(shelves, id, action === "up" ? -1 : 1));
        await loadAdminData();
        return;
      }
      if (action === "status") {
        shelves[index] = { ...shelf, status: shelf.status === "active" ? "draft" : "active" };
      }
      if (action === "duplicate") {
        shelves.unshift({
          ...shelf,
          id: makeLocalId(),
          title: `${shelf.title || "Canlı raf"} Kopya`,
          status: "draft",
          sortOrder: Number(shelf.sortOrder || 0) + 1
        });
      }
      if (action === "delete") {
        shelves.splice(index, 1);
      }
      await saveAdminDynamicShelves(shelves);
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });
  let draggedShelfId = "";
  qs("[data-admin-shelf-list]")?.addEventListener("dragstart", (event) => {
    const item = event.target.closest("[data-shelf-drag]");
    draggedShelfId = item?.dataset.shelfDrag || "";
    event.dataTransfer?.setData("text/plain", draggedShelfId);
  });
  qs("[data-admin-shelf-list]")?.addEventListener("dragover", (event) => {
    if (event.target.closest("[data-shelf-drag]")) event.preventDefault();
  });
  qs("[data-admin-shelf-list]")?.addEventListener("drop", async (event) => {
    const target = event.target.closest("[data-shelf-drag]");
    const sourceId = event.dataTransfer?.getData("text/plain") || draggedShelfId;
    const targetId = target?.dataset.shelfDrag || "";
    if (!sourceId || !targetId || sourceId === targetId) return;
    event.preventDefault();
    try {
      await saveAdminDynamicShelves(reorderItemsById(currentAdminDynamicShelves(), sourceId, targetId));
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    } finally {
      draggedShelfId = "";
    }
  });

  qs("[data-new-coupon]")?.addEventListener("click", () => fillCouponForm());
  qs("[data-reset-coupon]")?.addEventListener("click", () => fillCouponForm());

  const couponForm = qs("[data-coupon-form]");
  couponForm?.addEventListener("input", () => {
    renderCouponFormPreview(couponFormPayload(couponForm));
  });
  couponForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-coupon-status]");
    const payload = couponFormPayload(couponForm);
    const coupons = currentAdminCoupons();
    const editingId = state.admin.editingCouponId;
    const index = coupons.findIndex((coupon) => coupon.id === editingId);
    if (status) status.textContent = "Kupon kaydediliyor...";
    try {
      if (index >= 0) {
        coupons[index] = payload;
      } else {
        coupons.unshift({ ...payload, id: payload.id || makeLocalId() });
      }
      await saveAdminCoupons(coupons);
      await loadAdminData();
      fillCouponForm();
      const nextStatus = qs("[data-coupon-status]");
      if (nextStatus) nextStatus.textContent = "Kupon kaydedildi.";
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  qs("[data-admin-coupon-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-coupon-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.couponAction;
    const coupons = currentAdminCoupons();
    const index = coupons.findIndex((coupon) => coupon.id === id);
    const coupon = coupons[index];
    if (!coupon) return;

    if (action === "edit") {
      fillCouponForm(coupon);
      qs("[data-coupon-form]")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (action === "delete" && !confirm(`${coupon.code} kuponu silinsin mi?`)) {
      return;
    }

    try {
      if (action === "status") {
        coupons[index] = { ...coupon, status: coupon.status === "active" ? "draft" : "active" };
      }
      if (action === "duplicate") {
        coupons.unshift({
          ...coupon,
          id: makeLocalId(),
          code: `${coupon.code}-KOPYA`.slice(0, 32),
          label: `${coupon.label || coupon.code} Kopya`,
          status: "draft"
        });
      }
      if (action === "delete") {
        coupons.splice(index, 1);
      }
      await saveAdminCoupons(coupons);
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  qs("[data-settings-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-settings-status]");
    const payload = settingsFormPayload(event.currentTarget);
    status.textContent = "Ayarlar kaydediliyor...";
    try {
      await adminApi("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      await loadAdminData();
      status.textContent = "Ayarlar kaydedildi.";
    } catch (error) {
      status.textContent = error.message;
    }
  });

  qs("[data-message-list]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-message-action]");
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.messageAction;
    try {
      if (action === "read") {
        await adminApi(`/api/admin/messages/${encodeURIComponent(id)}/read`, { method: "PUT" });
      }
      if (action === "delete") {
        await adminApi(`/api/admin/messages/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
      await loadAdminData();
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  qs("[data-admin-reviews]")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-review-action]");
    if (!button) return;
    const productId = button.dataset.productId;
    const reviewId = button.dataset.id;
    const action = button.dataset.reviewAction;
    try {
      if (action === "delete") {
        await adminApi(`/api/admin/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(reviewId)}`, {
          method: "DELETE"
        });
      } else {
        await adminApi(`/api/admin/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(reviewId)}`, {
          method: "PUT",
          body: JSON.stringify({ status: action })
        });
      }
      await loadAdminData();
      setAdminStatus("Yorum güncellendi");
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  qs("[data-admin-orders]")?.addEventListener("click", async (event) => {
    const invoiceButton = event.target.closest("[data-invoice-download]");
    if (invoiceButton) {
      downloadInvoice(invoiceButton.dataset.invoiceDownload);
      return;
    }
    const shippingButton = event.target.closest("[data-order-save-shipping]");
    if (shippingButton) {
      const id = shippingButton.dataset.orderSaveShipping;
      try {
        await adminApi(`/api/admin/orders/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: JSON.stringify({
            shippingCarrier: qsa("[data-order-carrier]").find((input) => input.dataset.orderCarrier === id)?.value || "",
            trackingNumber: qsa("[data-order-tracking]").find((input) => input.dataset.orderTracking === id)?.value || ""
          })
        });
        await loadAdminData();
        setAdminStatus("Kargo takip kaydedildi");
      } catch (error) {
        setAdminStatus(error.message);
      }
      return;
    }
    const paymentButton = event.target.closest("[data-order-payment]");
    if (paymentButton) {
      try {
        await adminApi(`/api/admin/orders/${encodeURIComponent(paymentButton.dataset.id)}`, {
          method: "PUT",
          body: JSON.stringify({ paymentStatus: paymentButton.dataset.orderPayment })
        });
        await loadAdminData();
        setAdminStatus("Ödeme durumu güncellendi");
      } catch (error) {
        setAdminStatus(error.message);
      }
      return;
    }
    const returnButton = event.target.closest("[data-return-status]");
    if (returnButton) {
      try {
        await adminApi(`/api/admin/orders/${encodeURIComponent(returnButton.dataset.id)}`, {
          method: "PUT",
          body: JSON.stringify({ returnStatus: returnButton.dataset.returnStatus })
        });
        await loadAdminData();
        setAdminStatus("İade talebi güncellendi");
      } catch (error) {
        setAdminStatus(error.message);
      }
      return;
    }
    const button = event.target.closest("[data-order-action]");
    if (!button) return;
    try {
      await adminApi(`/api/admin/orders/${encodeURIComponent(button.dataset.id)}`, {
        method: "PUT",
        body: JSON.stringify({ status: button.dataset.orderAction })
      });
      await loadAdminData();
      setAdminStatus("Sipariş güncellendi");
    } catch (error) {
      setAdminStatus(error.message);
    }
  });

  qs("[data-export-json]")?.addEventListener("click", () => {
    if (state.admin.data) {
      downloadJson(state.admin.data);
    }
  });

  qs("[data-import-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = qs("[data-import-status]");
    const value = event.currentTarget.elements.json.value.trim();
    if (!value) {
      status.textContent = "Ice aktarilacak JSON verisini yapistirin.";
      return;
    }
    try {
      const payload = JSON.parse(value);
      status.textContent = "Veri ice aktariliyor...";
      await adminApi("/api/admin/import", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      event.currentTarget.reset();
      await loadAdminData();
      status.textContent = "Veri ice aktarildi.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
}

async function initAdmin() {
  initAdminEvents();
  if (!state.admin.token) {
    showLogin();
    return;
  }
  showDashboard();
  try {
    await loadAdminData();
  } catch {
    showLogin();
  }
}

async function boot() {
  initCommon();
  const page = document.body.dataset.page;

  if (page !== "admin" && page !== "product-detail") {
    fetchSite()
      .then((data) => {
        applySettings(data.settings);
        renderVisualSlots(data.settings);
      })
      .catch(() => {});
  }

  if (page === "home") await initHome();
  if (page === "products") await initCatalog();
  if (page === "collection") await initCollection();
  if (page === "lookbook") await initLookbook();
  if (page === "product-detail") await initProductDetail();
  if (page === "checkout") await initCheckout();
  if (page === "account") await initAccount();
  if (page === "contact") {
    initContact();
    fetchSite().then((data) => applySettings(data.settings)).catch(() => {});
  }
  if (page === "admin") await initAdmin();

}

boot();
