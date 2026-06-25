#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_PRODUCTS = ROOT / "exports" / "instagram-magaza-ilk-20" / "source-products.json"
RENDERER = ROOT / "scripts" / "render-instagram-posts.py"


def main():
    spec = importlib.util.spec_from_file_location("threon_instagram_renderer", RENDERER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def read_products(limit):
        with SOURCE_PRODUCTS.open("r", encoding="utf-8") as handle:
            return json.load(handle)[:limit]

    module.read_products = read_products
    module.main()


if __name__ == "__main__":
    main()
