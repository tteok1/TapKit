"""Read-only PDF visual QA. Run with bundled Python and explicit Poppler binary."""
import json
import pathlib
import subprocess
import sys
from PIL import Image, ImageDraw

base = pathlib.Path(__file__).resolve().parent
poppler = pathlib.Path(sys.argv[1])
reports = []
for directory in sorted((base / 'native').iterdir()):
    if not directory.is_dir():
        continue
    target = base / 'visual' / directory.name
    target.mkdir(parents=True, exist_ok=True)
    subprocess.run([str(poppler), '-r', '90', '-png', str(directory / 'deck.pdf'), str(target / 'page')], check=True, capture_output=True)
    pages = sorted(target.glob('page-*.png'), key=lambda p: int(p.stem.split('-')[-1]))
    if len(pages) != 10:
        raise ValueError('Expected ten rendered pages')
    tile_w = 480
    with Image.open(pages[0]) as first:
        tile_h = round(tile_w * first.height / first.width)
    contact = Image.new('RGB', (3 * (tile_w + 12) + 12, 4 * (tile_h + 34) + 12), '#e3e8e4')
    draw = ImageDraw.Draw(contact)
    for index, path in enumerate(pages):
        with Image.open(path) as source:
            thumbnail = source.convert('RGB').resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        x = 12 + (index % 3) * (tile_w + 12)
        y = 12 + (index // 3) * (tile_h + 34)
        draw.text((x, y), f'{directory.name} / page {index+1}', fill='#16231b')
        contact.paste(thumbnail, (x, y + 22))
    contact.save(target / 'contact.png')
    reports.append({'deck': directory.name, 'renderedPages': len(pages), 'contact': str((target / 'contact.png').relative_to(base))})
(base / 'visual' / 'render-report.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print(json.dumps(reports))
