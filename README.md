# Threon Store

THREON giyim markasi icin hazirlanan cok sayfali profesyonel e-ticaret vitrini ve gelismis admin paneli.

## Calistirma

```bash
npm start
```

Ardindan tarayicida:

Varsayilan adres `http://localhost:4173` olur. Port doluysa farkli portla acabilirsiniz:

```bash
PORT=4174 npm start
```

## Admin paneli

```text
http://localhost:4173/admin.html
```

- Kullanici adi: `admin`
- Sifre: `admin1`

Admin panelinden giyim urunu ekleyebilir, duzenleyebilir, silebilir, kopyalayabilir, taslak/yayin durumunu degistirebilir, one cikan urunleri belirleyebilir, eski fiyat/indirim, beden, renk, SKU, materyal ve bakim bilgilerini yonetebilirsiniz. Ayrica site ayarlarini guncelleyebilir, iletisim mesajlarini gorebilir ve JSON veri aktarimi yapabilirsiniz.

## Dosya yapisi

- `index.html`: Ana sayfa
- `products.html`: Shop / urun katalogu
- `product.html`: Urun detay sayfasi
- `about.html`: Hakkimizda sayfasi
- `contact.html`: Iletisim sayfasi
- `admin.html`: Admin paneli
- `styles.css`: Tum tasarim ve responsive kurallar
- `script.js`: Site ve panel etkilesimleri
- `server.js`: Yerel sunucu ve admin API
- `data/site-data.json`: Urunler, site ayarlari ve mesajlar
- `assets/threon-fashion-hero.png`: Yeni sezon moda hero gorseli
- `assets/product-*.png`: Urun ve koleksiyon gorselleri

Not: Yayina almadan once admin sifresini degistirmeniz onerilir.
