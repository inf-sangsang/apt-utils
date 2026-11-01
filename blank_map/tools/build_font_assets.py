"""Package existing map SVGs and selected fonts for offline image/export use.

python3 blank_map/tools/build_font_assets.py /path/to/google-font-ttfs
Input files: sans.ttf, nanum.ttf, serif.ttf (Google Fonts, licenses in data/fonts).
Requires fontTools. Existing maps and shared local fonts are read without changes.
"""
from pathlib import Path
import base64, gzip, io, json, sys
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data'
SOURCE = Path(sys.argv[1])
texts = ''.join(p.read_text() for p in ROOT.glob('maps/*/*-labeled.svg'))
texts += ''.join((ROOT / name).read_text() for name in ['blankMap.html', 'app.js', 'font-engine.js', 'data/regions.js'])
chars = set(texts) | set(chr(n) for n in range(32, 127))

def script(folder, key, value):
    dest = OUT / folder
    dest.mkdir(exist_ok=True)
    (dest / f'{key}.js').write_text('window.BLANK_MAP_ASSETS[' + json.dumps(f'{folder}/{key}') + ']=' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ';\n')

for key, family in [('sans', 'Noto Sans KR'), ('nanum', 'Nanum Gothic'), ('serif', 'Noto Serif KR')]:
    # Preserve the original Nanum file, including its reserved font names.
    if key == 'nanum':
        script('fonts', key, {'family': family, 'format': 'truetype', 'mime': 'font/ttf', 'data': base64.b64encode((SOURCE / f'{key}.ttf').read_bytes()).decode()})
        continue
    font = TTFont(SOURCE / f'{key}.ttf', recalcTimestamp=False)
    options = subset.Options()
    options.name_IDs = ['*']
    sub = subset.Subsetter(options=options)
    sub.populate(text=''.join(sorted(chars)))
    sub.subset(font)
    stream = io.BytesIO()
    font.save(stream)
    script('fonts', key, {'family': family, 'format': 'truetype', 'mime': 'font/ttf', 'data': base64.b64encode(stream.getvalue()).decode()})

for source in sorted((ROOT.parent / 'fonts').glob('*.woff2')):
    script('fonts', source.stem, {'family': source.stem, 'format': 'woff2', 'mime': 'font/woff2', 'data': base64.b64encode(source.read_bytes()).decode()})

for folder in sorted((ROOT / 'maps').iterdir()):
    if not folder.is_dir():
        continue
    maps = {kind: (folder / f'{kind}-labeled.svg').read_text() for kind in ['admin', 'legal']}
    packed = gzip.compress(json.dumps(maps, ensure_ascii=False, separators=(',', ':')).encode(), mtime=0)
    script('font-maps', folder.name, base64.b64encode(packed).decode())
print('Packaged 11 fonts and 127 original labeled map pairs.')
