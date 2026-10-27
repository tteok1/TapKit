from pathlib import Path
from pypdf import PdfReader
import unicodedata
import hashlib
import json

directory = Path(__file__).resolve().parent / 'exported'
reader = PdfReader(directory / 'chinese-pages.pdf')
raw = [page.extract_text() for page in reader.pages]
text = '\n'.join(unicodedata.normalize('NFKC', value) for value in raw)
checks = {name: value in text for name, value in {
    'first': '中文会话导出验收', 'last': '最后一段中文结束',
    'table80': '项目80', 'code99': 'line99',
}.items()}
actions = [str(annotation.get_object().get('/A')) for page in reader.pages
           for annotation in page.get('/Annots', []) if annotation.get_object().get('/A')]
result = {
    'pages': len(reader.pages), 'normalizedTextChecks': checks,
    'pdfActions': actions, 'openAction': str(reader.trailer['/Root'].get('/OpenAction')),
    'rawExactUnicodeGuaranteed': False,
    'rawCompatibilityNote': 'Some Han glyphs extract as compatibility characters. NFKC checks do not claim raw Unicode identity. TXT/MD preserve exact UTF-8 text.',
    'files': {path.name: {'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
              for path in directory.iterdir() if path.is_file() and path.suffix in ['.pdf', '.html']},
}
(directory / 'format-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
assert all(checks.values()) and not actions and reader.trailer['/Root'].get('/OpenAction') is None
print(json.dumps({'pages': len(reader.pages), 'checks': checks, 'actions': actions}))
