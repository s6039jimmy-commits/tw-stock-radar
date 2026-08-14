import os
import re

src_dir = r"C:\Users\Administrator\.gemini\antigravity\scratch\tw-stock-radar\server\src"

db_funcs = [
    "addPosition", "getActivePositions", "getPositionById", "updatePosition",
    "exitPosition", "addRadarSignal", "getRadarSignals", "addExitAlert",
    "getExitAlerts", "getSetting", "setSetting", "getTradeHistory", "getTradeStats"
]

def patch_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    for func in db_funcs:
        # Replace `func(` with `await func(` if it's not already awaited
        # But we need to be careful.
        # Let's use regex: look for `func(` that is not preceded by `await `
        # This is a bit tricky, let's just do a simple replace and fix double awaits
        content = re.sub(r'(?<!await\s)\b' + func + r'\s*\(', r'await ' + func + '(', content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {filepath}")

for root, dirs, files in os.walk(src_dir):
    for file in files:
        if file.endswith('.js') and file != 'database.js':
            patch_file(os.path.join(root, file))
