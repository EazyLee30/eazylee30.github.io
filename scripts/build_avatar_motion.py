#!/usr/bin/env python3
"""Precompute numerical motion vectors from the registered avatar atlases.

Optional authoring tool: requires Pillow, NumPy and OpenCV. It never rewrites the artwork.
The static binary is shipped with the site; Pages doesn't need these dependencies.
"""
from pathlib import Path
import json
import numpy as np
import cv2
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT, STEP = 240, 440, 8


def views(path, boxes):
    sheet = Image.open(path).convert('RGBA')
    result = []
    for box in boxes:
        crop = np.array(sheet.crop((box['x'], box['y'], box['x'] + box['width'], box['y'] + box['height'])), dtype=np.float32)
        scale = 410 / box['height']
        draw_width = box['width'] * scale
        yy, xx = np.mgrid[:HEIGHT, :WIDTH]
        if box.get('flip'):
            xx = WIDTH - 1 - xx
        sx = (xx + .5 - (WIDTH - draw_width) / 2) / scale - .5
        sy = (yy + .5 - 15) / scale - .5
        inside = (sx >= -.5) & (sx < box['width'] - .5) & (sy >= -.5) & (sy < box['height'] - .5)
        x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
        fx = (sx - x0)[..., None]; fy = (sy - y0)[..., None]
        sample = lambda x, y: crop[np.clip(y, 0, box['height'] - 1), np.clip(x, 0, box['width'] - 1)]
        pixels = (sample(x0, y0)*(1-fx)+sample(x0+1, y0)*fx)*(1-fy)+(sample(x0, y0+1)*(1-fx)+sample(x0+1, y0+1)*fx)*fy
        pixels *= inside[..., None]
        luminance = pixels[..., :3] @ np.array([.2126, .7152, .0722]) / 255
        alpha = pixels[..., 3]
        result.append(np.stack((alpha*luminance**.9, alpha*(1-luminance)**.82), axis=-1))
    return result


def pair_flow(a, b):
    gray = lambda v: np.clip(255-v[..., 1], 0, 255).astype(np.uint8)
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    dis.setFinestScale(0); dis.setPatchSize(12); dis.setPatchStride(4)
    dis.setGradientDescentIterations(25); dis.setVariationalRefinementIterations(15)
    dis.setVariationalRefinementAlpha(30); dis.setVariationalRefinementDelta(5); dis.setVariationalRefinementGamma(10)
    flow = cv2.GaussianBlur(dis.calc(gray(a), gray(b), None), (0, 0), 5)
    flow[..., 0] = np.clip(flow[..., 0], -38, 38)
    flow[..., 1] = np.clip(flow[..., 1], -12, 12)
    foreground = cv2.dilate((a[..., 1]>4).astype(np.uint8), np.ones((21, 21), np.uint8)).astype(bool)
    sigma = 3
    for _ in range(8):
        flow = cv2.GaussianBlur(flow, (0, 0), sigma)
        dxx = cv2.Sobel(flow[..., 0], cv2.CV_32F, 1, 0, ksize=3)/8
        dxy = cv2.Sobel(flow[..., 0], cv2.CV_32F, 0, 1, ksize=3)/8
        dyx = cv2.Sobel(flow[..., 1], cv2.CV_32F, 1, 0, ksize=3)/8
        dyy = cv2.Sobel(flow[..., 1], cv2.CV_32F, 0, 1, ksize=3)/8
        # Bound the halfway warp's Jacobian so the face and garment cannot fold.
        minimum = min(float(((1+s*.5*dxx)*(1+s*.5*dyy)-.25*dxy*dyx)[foreground].min()) for s in (-1, 1)) if foreground.any() else 1
        if minimum>.4: break
        sigma = 5
    ys = np.minimum(np.arange(HEIGHT//STEP+1)*STEP, HEIGHT-1)
    xs = np.minimum(np.arange(WIDTH//STEP+1)*STEP, WIDTH-1)
    grid = flow[ys[:, None], xs[None, :]]
    data = np.zeros((*grid.shape[:2], 4), dtype=np.uint8)
    data[..., :2] = np.round(128+grid*3).astype(np.uint8)
    data[..., 3] = 255
    return data.tobytes()


def build():
    cells = json.loads((ROOT/'assets/data/avatar-frames.json').read_text())
    chunks = []
    for filename, key in [('eazylee-turnaround-v3.png', 'frames'), ('eazylee-athletic-v3.png', 'athletic')]:
        atlas = views(ROOT/'assets/art'/filename, cells[key])
        for i, a in enumerate(atlas):
            b = atlas[(i+1) % len(atlas)]
            chunks.extend((pair_flow(a, b), pair_flow(b, a)))
    binary = b''.join(chunks)
    assert len(binary) == 48 * 31 * 56 * 4
    (ROOT/'assets/data/avatar-flow.bin').write_bytes(binary)
    print(f'Built {len(chunks)} motion fields ({len(binary):,} bytes).')


if __name__ == '__main__':
    build()
