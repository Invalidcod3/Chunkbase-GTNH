"""Import the user's local design assets without modifying the Illustrator source."""
from pathlib import Path
import shutil
import zipfile
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'C:\Users\28317\Documents\ChunkbaseNHWeb')
out = ROOT / 'dist/assets/ui'
out.mkdir(parents=True, exist_ok=True)
for source in SOURCE.glob('*.svg'):
    shutil.copyfile(source, out / source.name)
for archive, filename in [('minecraft-font.zip', 'MinecraftRegular-Bmg3.otf'), ('minecraft-ten-font.zip', 'MinecraftTen-VGORe.ttf')]:
    with zipfile.ZipFile(SOURCE / archive) as z:
        (out / filename).write_bytes(z.read(filename))

# Preserve the actual vector NH emblem, including its offset blue shadow.
# Illustrator draws it as filled paths under translation matrices.
ops = PdfReader(SOURCE / 'ChunkbaseNH网页.pdf').pages[0].get_contents().operations
matrix = (1, 0, 0, 1, 0, 0)
color = 'white'
stack, paths, commands, points = [], [], [], []
for args, op in ops:
    if op == b'q':
        stack.append((matrix, color))
    elif op == b'Q':
        matrix, color = stack.pop()
    elif op == b'cm':
        a,b,c,d,e,f = matrix
        A,B,C,D,E,F = map(float,args)
        matrix = (a*A+c*B,b*A+d*B,a*C+c*D,b*C+d*D,a*E+c*F+e,b*E+d*F+f)
    elif op in (b'scn', b'rg') and len(args) == 3:
        color = '#'+''.join(f'{round(float(v)*255):02x}' for v in args)
    elif op in (b'm', b'l', b'c'):
        vals = list(map(float,args))
        commands.append(op.decode().upper()+' '+' '.join(map(str,vals)))
        a,b,c,d,e,f = matrix
        points.extend((a*x+c*y+e,b*x+d*y+f) for x,y in zip(vals[::2],vals[1::2]))
    elif op == b'h':
        commands.append('Z')
    elif op == b're':
        commands, points = [], []
    elif op in (b'f', b'f*', b'n', b'S', b'B'):
        if op in (b'f',b'f*') and points and all(10 <= x <= 118 and 995 <= y <= 1078 for x,y in points):
            paths.append(f'<path fill="{color}" transform="matrix({" ".join(map(str,matrix))})" d="{" ".join(commands)}"/>')
        commands, points = [], []
assert len(paths) >= 2, 'NH emblem paths not found'
(out / 'nh-logo.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 108 84"><g transform="translate(0 1080) scale(1 -1)">'+''.join(paths)+'</g></svg>', encoding='utf-8')
icons = ROOT.parent / 'src/main/resources/amidst/icon/profileicons'
for name in ['Grass','Netherrack','End_Stone','Mycelium','Stone','Diamond_Ore','Water']:
    shutil.copyfile(icons / (name+'.png'), out / (name.lower()+'.png'))
print('Imported SVG controls, fonts, NH emblem and original Amidst block icons.')
