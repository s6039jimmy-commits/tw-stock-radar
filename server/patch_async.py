import os
import re

src_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\tw-stock-radar\server\src"

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content
    
    # Fix express routes: router.get('/...', (req, res) => { ... await ...
    content = re.sub(r'router\.(\w+)\(([^,]+),\s*\(\s*req,\s*res\s*\)\s*=>\s*\{', r'router.\1(\2, async (req, res) => {', content)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.js'):
            patch_file(os.path.join(root, file))
