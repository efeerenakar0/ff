#!/usr/bin/env python3
import argparse
from collections import deque
import json
import math
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


CANVAS = (1080, 1350)
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LOGO = Path("/Users/efeerenakar/Desktop/threon_logo_black_transparent.png")
OUT_DIR = ROOT / "exports" / "instagram-magaza-ilk-20"

FONT_CANDIDATES = [
    "/System/Library/Fonts/Avenir.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
]


def font(size, index=0):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size=size, index=index)
        except Exception:
            continue
    return ImageFont.load_default()


FONT_LABEL = font(25)
FONT_TITLE = font(38)
FONT_TITLE_SMALL = font(34)
FONT_PRICE = font(66)
FONT_OLD_PRICE = font(34)
FONT_DESC = font(24)
FONT_META = font(24)


def read_products(limit):
    with (ROOT / "data" / "site-public.json").open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data.get("products", [])[:limit]


def money(value, currency="TRY"):
    if value is None or value == "":
        return ""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    if amount.is_integer():
        text = f"{int(amount):,}".replace(",", ".")
    else:
        text = f"{amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{text} TL" if currency == "TRY" else f"{text} {currency}"


def description_copy(product):
    name = str(product.get("name") or "").strip()
    fit = str(product.get("fit") or "").strip()
    summary = str(product.get("summary") or product.get("description") or "").strip()
    if name and summary.lower().startswith(name.lower()):
        summary = summary[len(name) :].strip(" .-")
    summary = re.sub(r"\s+", " ", summary)
    if "THREON kataloğuna eklenen" in summary:
        summary = summary.replace("THREON kataloğuna eklenen ", "")
    parts = []
    if fit:
        normalized_fit = fit.replace("Oversıze", "Oversize")
        parts.append(f"{normalized_fit} kalıp")
    if summary:
        parts.append(summary[0].lower() + summary[1:] if summary else summary)
    if not parts:
        parts.append("THREON seçkisine eklenen premium sezon parçası")
    text = "; ".join(parts)
    return text.rstrip(".") + "."


def slugify(value):
    value = str(value or "").lower()
    value = re.sub(r"[^a-z0-9-]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "product"


def palette_for(product):
    text = f"{product.get('name', '')} {product.get('slug', '')}".lower()
    if "siyah" in text or "black" in text:
        return {
            "top": (232, 231, 225),
            "bottom": (190, 188, 179),
            "panel": (33, 32, 30),
            "accent": (83, 83, 78),
            "ink": (25, 24, 22),
        }
    if "haki" in text or "nefti" in text or "petrol" in text:
        return {
            "top": (235, 235, 226),
            "bottom": (205, 211, 192),
            "panel": (57, 70, 57),
            "accent": (112, 124, 95),
            "ink": (26, 29, 24),
        }
    if "beyaz" in text or "ekru" in text or "kemik" in text:
        return {
            "top": (246, 244, 236),
            "bottom": (217, 213, 200),
            "panel": (202, 196, 181),
            "accent": (143, 134, 113),
            "ink": (25, 24, 22),
        }
    if "vizon" in text or "taba" in text or "bej" in text:
        return {
            "top": (244, 239, 229),
            "bottom": (213, 202, 183),
            "panel": (184, 164, 132),
            "accent": (135, 112, 82),
            "ink": (27, 24, 20),
        }
    return {
        "top": (242, 240, 233),
        "bottom": (205, 205, 194),
        "panel": (38, 38, 35),
        "accent": (130, 125, 108),
        "ink": (25, 24, 22),
    }


def preserve_studio_photo(product):
    text = f"{product.get('name', '')} {product.get('slug', '')}".lower()
    return any(token in text for token in ["beyaz", "ekru", "kemik", "gri", "white"])


def linear_gradient(size, top, bottom):
    width, height = size
    image = Image.new("RGB", size, top)
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / max(1, height - 1)
        color = tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color)
    return image.convert("RGBA")


def add_texture(image, strength=9):
    width, height = image.size
    noise = Image.effect_noise((width, height), 42).convert("L")
    noise = noise.point(lambda p: 128 + int((p - 128) * strength / 100))
    overlay = Image.new("RGBA", image.size, (255, 255, 255, 0))
    overlay.putalpha(noise.point(lambda p: max(0, min(18, abs(p - 128)))))
    return Image.alpha_composite(image, overlay)


def background(product):
    pal = palette_for(product)
    base = linear_gradient(CANVAS, pal["top"], pal["bottom"])
    base = add_texture(base, 7)
    draw = ImageDraw.Draw(base, "RGBA")
    draw.rectangle([0, 0, 1080, 1350], outline=(255, 255, 255, 52), width=18)
    draw.polygon([(0, 0), (316, 0), (224, 1350), (0, 1350)], fill=(*pal["panel"], 44))
    draw.polygon([(746, 0), (1080, 0), (1080, 1350), (842, 1350)], fill=(*pal["accent"], 34))
    draw.rectangle([72, 1028, 1008, 1276], fill=(248, 246, 238, 214))
    draw.line([(96, 1004), (984, 1004)], fill=(*pal["ink"], 54), width=2)
    draw.line([(96, 1290), (984, 1290)], fill=(*pal["ink"], 42), width=2)
    return base


def subject_cutout(path):
    img = Image.open(path).convert("RGBA")
    arr = np.array(img, dtype=np.uint8)
    rgb = arr[:, :, :3].astype(np.int16)
    original_alpha = arr[:, :, 3]
    bright = rgb.mean(axis=2)
    spread = rgb.max(axis=2) - rgb.min(axis=2)
    min_channel = rgb.min(axis=2)
    height = arr.shape[0]
    lower_cleanup_zone = np.arange(height)[:, None] > height * 0.78
    background = ((bright > 210) & (spread < 34)) | ((bright > 225) & (spread < 48) & (min_channel > 200))
    floor_residue = lower_cleanup_zone & (
        ((bright > 168) & (spread < 42) & (min_channel > 145))
        | ((bright > 155) & (spread < 28) & (min_channel > 135))
    )
    candidates = background | floor_residue
    connected_background = np.zeros(candidates.shape, dtype=bool)
    queue = deque()
    h, w = candidates.shape
    for x in range(w):
        if candidates[0, x]:
            connected_background[0, x] = True
            queue.append((0, x))
        if candidates[h - 1, x]:
            connected_background[h - 1, x] = True
            queue.append((h - 1, x))
    for y in range(h):
        if candidates[y, 0] and not connected_background[y, 0]:
            connected_background[y, 0] = True
            queue.append((y, 0))
        if candidates[y, w - 1] and not connected_background[y, w - 1]:
            connected_background[y, w - 1] = True
            queue.append((y, w - 1))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and candidates[ny, nx] and not connected_background[ny, nx]:
                connected_background[ny, nx] = True
                queue.append((ny, nx))
    alpha_arr = np.where(connected_background, 0, 255).astype(np.uint8)
    alpha_arr = np.minimum(alpha_arr, original_alpha)
    rgba = Image.fromarray(arr, "RGBA")
    alpha = Image.fromarray(alpha_arr, "L").filter(ImageFilter.GaussianBlur(0.65))
    rgba.putalpha(alpha)
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def subject_image(product):
    image_path = ROOT / product["image"]
    if preserve_studio_photo(product):
        return Image.open(image_path).convert("RGBA")
    return subject_cutout(image_path)


def fit(image, max_size):
    max_w, max_h = max_size
    scale = min(max_w / image.width, max_h / image.height)
    return image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)


def wrap_text(draw, text, font_obj, max_width, max_lines=3):
    words = str(text).split()
    lines = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        width = draw.textbbox((0, 0), trial, font=font_obj)[2]
        if width <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textbbox((0, 0), lines[-1] + "...", font=font_obj)[2] > max_width and len(lines[-1]) > 3:
            lines[-1] = lines[-1][:-1].rstrip()
        lines[-1] = lines[-1] + "..."
    return lines


def draw_logo(canvas, logo_path, product_box, pal):
    logo = Image.open(logo_path).convert("RGBA")
    target_w = 290
    target_h = int(target_w * logo.height / logo.width)
    logo = logo.resize((target_w, target_h), Image.Resampling.LANCZOS)
    x = int((1080 - target_w) / 2)
    y = 70
    canvas.alpha_composite(logo, (x, y))


def render_post(product, index, logo_path, out_dir):
    pal = palette_for(product)
    canvas = background(product)
    draw = ImageDraw.Draw(canvas, "RGBA")
    photo_panel = preserve_studio_photo(product)
    subject = subject_image(product)
    subject = fit(subject, (780, 850))
    x = int((1080 - subject.width) / 2 + 42)
    y = 140
    if not photo_panel:
        shadow = Image.new("RGBA", subject.size, (0, 0, 0, 0))
        shadow.putalpha(subject.getchannel("A").filter(ImageFilter.GaussianBlur(20)).point(lambda p: int(p * 0.32)))
        shadow_y = y + 36
        canvas.alpha_composite(shadow, (x + 18, shadow_y))
    canvas.alpha_composite(subject, (x, y))
    product_box = (x, y, x + subject.width, y + subject.height)
    draw_logo(canvas, logo_path, product_box, pal)

    panel_luminance = sum(pal["panel"]) / 3
    label_fill = (244, 242, 236, 188) if panel_luminance < 92 else (*pal["ink"], 178)
    draw.text((96, 958), "MAĞAZA SEÇİLERİ", font=FONT_LABEL, fill=label_fill)
    title_font = FONT_TITLE
    lines = wrap_text(draw, product.get("name", ""), title_font, 548, max_lines=2)
    if len(lines) > 1 and any(draw.textbbox((0, 0), line, font=title_font)[2] > 540 for line in lines):
        title_font = FONT_TITLE_SMALL
        lines = wrap_text(draw, product.get("name", ""), title_font, 548, max_lines=2)
    title_y = 1064
    for line in lines:
        draw.text((96, title_y), line, font=title_font, fill=(*pal["ink"], 255))
        title_y += title_font.size + 4

    desc_lines = wrap_text(draw, description_copy(product), FONT_DESC, 560, max_lines=2)
    desc_y = 1170
    for line in desc_lines:
        draw.text((96, desc_y), line, font=FONT_DESC, fill=(*pal["ink"], 168))
        desc_y += 31

    price = money(product.get("price"), product.get("currency", "TRY"))
    old_price = money(product.get("comparePrice"), product.get("currency", "TRY"))
    price_x = 720
    price_y = 1084
    draw.text((price_x, price_y), price, font=FONT_PRICE, fill=(*pal["ink"], 255))
    if old_price:
        old_y = price_y + 86
        draw.text((price_x + 6, old_y), old_price, font=FONT_OLD_PRICE, fill=(*pal["ink"], 150))
        bbox = draw.textbbox((price_x + 6, old_y), old_price, font=FONT_OLD_PRICE)
        draw.line([(bbox[0], bbox[1] + 18), (bbox[2], bbox[1] + 18)], fill=(*pal["ink"], 154), width=3)

    draw.text((96, 1240), f"THREON DROP {index:02d}", font=FONT_META, fill=(*pal["ink"], 150))
    out_dir.mkdir(parents=True, exist_ok=True)
    output = out_dir / f"{index:02d}-{slugify(product.get('slug') or product.get('name'))}.png"
    canvas.convert("RGB").save(output, "PNG", optimize=True)
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=1)
    parser.add_argument("--logo", type=Path, default=DEFAULT_LOGO)
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()
    products = read_products(args.count)
    outputs = []
    for idx, product in enumerate(products, start=1):
        outputs.append(render_post(product, idx, args.logo, args.out))
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
