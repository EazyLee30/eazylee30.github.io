#!/usr/bin/env python3
"""Render the existing avatar/wordmark as share assets; requires rsvg-convert."""
from pathlib import Path
import base64, re, struct, subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/brand';OUT.mkdir(exist_ok=True)
portrait=base64.b64encode((ROOT/'assets/avatar-head.png').read_bytes()).decode()
ink='''<defs><filter id="avatar-ink" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComponentTransfer in="shade" result="line"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="line" in2="SourceAlpha" operator="in" result="glyph"/><feFlood flood-color="#100f0f" result="ink"/><feComposite in="ink" in2="glyph" operator="in"/></filter></defs>'''
def avatar(x,y,width,height):
    return f'<svg x="{x}" y="{y}" width="{width}" height="{height}" viewBox="16 18 64 76"><image width="100" height="100" href="data:image/png;base64,{portrait}" filter="url(#avatar-ink)"/></svg>'
def svg(width,height,body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="#fffcf0"/>{ink}{body}</svg>'
icon=svg(600,600,avatar(60,45,480,510))
(OUT/'avatar-icon-v1.svg').write_text(icon)
for size,name in [(32,'favicon-32-v1.png'),(192,'favicon-192-v1.png'),(180,'apple-touch-icon-v1.png'),(600,'share-avatar-v1.png')]:
    subprocess.run(['rsvg-convert','-w',str(size),'-h',str(size),'-o',str(OUT/name),str(OUT/'avatar-icon-v1.svg')],check=True)
# A PNG-backed ICO also covers clients that request the root favicon by convention.
raw=(OUT/'favicon-32-v1.png').read_bytes()
(ROOT/'favicon.ico').write_bytes(struct.pack('<HHH',0,1,1)+struct.pack('<BBBBHHII',32,32,0,0,1,32,len(raw),22)+raw)
(ROOT/'apple-touch-icon.png').write_bytes((OUT/'apple-touch-icon-v1.png').read_bytes())
word=(ROOT/'assets/art/eazylee-wordmark.svg').read_text()
for var,value in [('crest','#163b73'),('hover','#205ea6'),('lit','#205ea6'),('mid','#739ac0'),('dim','#b0c7dc')]:
    word=word.replace(f'var(--field-{var})',value)
word=word.replace('<svg viewBox=', '<svg x="445" y="240" width="670" height="143" viewBox=',1)
cover=svg(1200,630,avatar(60,100,325,420)+word)
(OUT/'share-cover-v1.svg').write_text(cover)
subprocess.run(['rsvg-convert','-o',str(OUT/'share-cover-v1.png'),str(OUT/'share-cover-v1.svg')],check=True)
print('Rendered avatar favicons, touch icon, square share image and wordmark cover.')
