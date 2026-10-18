#!/usr/bin/env python3
"""Rebuilds assets/fonts/ from the Google Fonts sources (SIL OFL 1.1).

Static instances at Istari's weights, subset to the scripts Mathdown needs,
with all OpenType layout features kept (small caps, old-style figures, ...).
Needs: pip install fonttools
"""
import os, urllib.request
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

BASE = 'https://raw.githubusercontent.com/google/fonts/main/ofl/'
SRC = {
    'serif': 'ebgaramond/EBGaramond%5Bwght%5D.ttf',
    'serif-i': 'ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf',
    'title': 'cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf',
    'title-i': 'cormorantgaramond/CormorantGaramond-Italic%5Bwght%5D.ttf',
    'mono': 'jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf',
}
TEXT_RANGES = [(0x20, 0x7E), (0xA0, 0x24F), (0x2B0, 0x36F), (0x370, 0x3FF), (0x1E00, 0x1EFF), (0x2000, 0x20C0),
               (0x2100, 0x214F), (0x2190, 0x21FF), (0x2200, 0x22FF), (0x25A0, 0x25FF), (0x2700, 0x27BF), (0xFB00, 0xFB06)]
TITLE_RANGES = [(0x20, 0x7E), (0xA0, 0x17F), (0x2000, 0x206F), (0x2190, 0x2193), (0xFB00, 0xFB06)]
JOBS = [
    ('serif', 400, 'IstariSerif-Regular', TEXT_RANGES),
    ('serif', 600, 'IstariSerif-SemiBold', TEXT_RANGES),
    ('serif-i', 400, 'IstariSerif-Italic', TEXT_RANGES),
    ('serif-i', 600, 'IstariSerif-SemiBoldItalic', TEXT_RANGES),
    ('title', 500, 'IstariTitle-Medium', TITLE_RANGES),
    ('title-i', 500, 'IstariTitle-MediumItalic', TITLE_RANGES),
    ('mono', 400, 'IstariMono-Regular', TEXT_RANGES),
]

here = os.path.dirname(os.path.abspath(__file__))
cache = os.path.join(here, '.cache', 'fonts')
out_dir = os.path.join(here, '..', 'assets', 'fonts')
os.makedirs(cache, exist_ok=True)
for key, url in SRC.items():
    dest = os.path.join(cache, key + '.ttf')
    if not os.path.exists(dest):
        urllib.request.urlretrieve(BASE + url, dest)
for key, weight, name, ranges in JOBS:
    font = instancer.instantiateVariableFont(TTFont(os.path.join(cache, key + '.ttf')), {'wght': weight})
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.hinting = False
    opts.notdef_outline = True
    sub = subset.Subsetter(options=opts)
    sub.populate(unicodes=[u for a, b in ranges for u in range(a, b + 1)])
    sub.subset(font)
    font.save(os.path.join(out_dir, name + '.ttf'))
    print('wrote', name)
