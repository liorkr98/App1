"""Crops the captures in ../work/cap into the images compose.html loads (../work/img)."""
import glob
import os
import shutil

from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
cap, out = os.path.join(here, '../work/cap/'), os.path.join(here, '../work/img/')
fixtures = os.path.join(here, '../../web/public/fixtures/')
os.makedirs(out, exist_ok=True)
for t in ['aurora', 'poster', 'blueprint', 'heliograph', 'zine', 'keytag', 'monolith']:
    im = Image.open(f'{cap}{t}-full.png').convert('RGB')
    im.crop((0, 0, 1170, min(im.height, 7200))).save(f'{out}{t}.jpg', quality=90)
for f in sorted(glob.glob(f'{cap}e[0-9]*.png')):
    Image.open(f).convert('RGB').save(out + os.path.basename(f).replace('.png', '.jpg'), quality=92)
Image.open(f'{cap}card-aurora.png').convert('RGB').save(f'{out}card.jpg', quality=92)
for n in ['living', 'kitchen', 'balcony', 'bath']:
    shutil.copy(f'{fixtures}tlv-{n}-1200.webp', out)
