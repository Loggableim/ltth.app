#!/usr/bin/env python3
import os
import json
import re
from bs4 import BeautifulSoup

# List of target files
TARGETS = [
    "features/index.html",
    "docs.html",
    "changelog.html",
    "community.html",
    "faq.html",
    "support.html",
    "roadmap.html",
    "impressum.html",
    "thank-you.html",
    "support-the-developement.html",
]

# Helper to slugify class names to keys

def class_to_key(page, class_name):
    key = class_name.replace('-', '.')
    return f"{page}.{key}"

# Find elements with text and add data-i18n

def process_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    page = os.path.splitext(os.path.basename(path))[0]
    # For features/index.html, page should be 'features'
    if page == 'index' and 'features' in path:
        page = 'features'
    # Collect translations
    translations = {}
    # Elements to consider
    tags = ['h1','h2','h3','h4','h5','h6','p','a','button','label','span']
    for el in soup.find_all(tags):
        # Skip if already has data-i18n
        if el.has_attr('data-i18n'):
            continue
        text = el.get_text(strip=True)
        if not text:
            continue
        # Try to use class
        key = None
        if el.has_attr('class'):
            for cls in el['class']:
                if any(sub in cls for sub in ['title','subtitle','desc','tag','label','button','link']):
                    key = class_to_key(page, cls)
                    break
        # Fallback: use tag and index
        if not key:
            # generate a simple key
            key = f"{page}.{el.name}.{len(translations)+1}"
        el['data-i18n'] = key
        translations[key] = text
    # Write back file
    with open(path, 'w', encoding='utf-8') as f:
        f.write(str(soup))
    return translations

# Main
if __name__ == "__main__":
    all_translations = {}
    for tgt in TARGETS:
        abs_path = os.path.join(os.getcwd(), tgt)
        if not os.path.isfile(abs_path):
            print(f"Warning: {abs_path} not found")
            continue
        print(f"Processing {tgt}")
        trans = process_file(abs_path)
        all_translations.update(trans)
    # Load existing locale files
    locales = ['de','en','es','fr']
    for loc in locales:
        loc_path = os.path.join(os.getcwd(), f"locales/{loc}.json")
        if os.path.isfile(loc_path):
            with open(loc_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        else:
            data = {}
        # Add German translations
        if loc == 'de':
            data.update(all_translations)
        else:
            # placeholder: copy German text
            for k,v in all_translations.items():
                if k not in data:
                    data[k] = v
        # Write back
        with open(loc_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    # Copy to build-src/locales and public/locales
    for loc in locales:
        src = os.path.join(os.getcwd(), f"locales/{loc}.json")
        dst1 = os.path.join(os.getcwd(), f"build-src/locales/{loc}.json")
        dst2 = os.path.join(os.getcwd(), f"public/locales/{loc}.json")
        os.makedirs(os.path.dirname(dst1), exist_ok=True)
        os.makedirs(os.path.dirname(dst2), exist_ok=True)
        with open(src, 'r', encoding='utf-8') as fsrc:
            content = fsrc.read()
        with open(dst1, 'w', encoding='utf-8') as fdst:
            fdst.write(content)
        with open(dst2, 'w', encoding='utf-8') as fdst:
            fdst.write(content)
    print("Done.")
