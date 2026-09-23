"""Generate the app's image assets (pure stdlib, no image libraries):

  www/icon-192.png, www/icon-512.png, www/icon-maskable-512.png   PWA / manifest icons
  assets/icon-only.png                                             source for the Android launcher icon
  assets/splash.png, assets/splash-dark.png                        source for the Android launch splash screen

Run from the repo root:  python make_icons.py
"""
import zlib, struct

BG = (12, 17, 36)          # icon tile background
SPLASH_BG = (7, 9, 15)     # launch splash background -- keep in sync with backgroundColor in capacitor.config.json


def inside(x, y, x0, y0, x1, y1): return x0 <= x <= x1 and y0 <= y <= y1
def circ(x, y, cx, cy, r): return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def robot_px(a, b):
    """The robot in normalized (0..1) coordinates. Returns an RGB tuple, or None where there's no robot."""
    c = None
    if inside(a, b, .455, .18, .49, .30): c = (117, 133, 156)   # antenna stem
    if circ(a, b, .4725, .165, .026): c = (255, 82, 82)         # antenna tip (recording light)
    if inside(a, b, .365, .295, .58, .46):                      # head
        c = (233, 240, 249)
        if inside(a, b, .40, .335, .545, .415): c = (10, 16, 32)             # visor
        if circ(a, b, .445, .373, .022) or circ(a, b, .50, .373, .022): c = (57, 245, 255)  # eyes
    if inside(a, b, .30, .46, .345, .62): c = (130, 148, 171)   # left arm
    if inside(a, b, .60, .46, .645, .62): c = (130, 148, 171)   # right arm
    if inside(a, b, .375, .46, .57, .72):                       # torso
        c = (207, 224, 240)
        if circ(a, b, .4725, .565, .05): c = (247, 147, 26)     # crypto chest badge
        if circ(a, b, .4725, .565, .026): c = (255, 255, 255)   # badge highlight dot
    if inside(a, b, .40, .72, .445, .82) or inside(a, b, .50, .72, .545, .82): c = (58, 70, 88)  # feet
    return c


def write_png(path, width, height, rows):
    """rows: iterable of bytes objects, each width*3 bytes of RGB."""
    raw = bytearray()
    for row in rows:
        raw.append(0)        # PNG filter type 0 (none) for this scanline
        raw += row
    def chunk(t, d):
        body = t + d
        return struct.pack('>I', len(d)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))


def icon(path, size, safe):
    # safe = fraction of the tile the artwork occupies (smaller for maskable icons)
    rows = []
    for j in range(size):
        row = bytearray()
        for i in range(size):
            a = (i / size - .5) / safe + .5; b = (j / size - .5) / safe + .5
            row += bytes(robot_px(a, b) or BG)
        rows.append(bytes(row))
    write_png(path, size, size, rows)


# ---- launch splash: robot + "BANK JOB" pixel-font wordmark on the dark app background ----
FONT = {  # 5x7 pixel glyphs, just the letters the wordmark needs
    'B': ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    'A': [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    'N': ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
    'K': ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    'J': ["..###", "...#.", "...#.", "...#.", "...#.", "#..#.", ".##.."],
    'O': [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    ' ': ["....."] * 7,
}


def splash(path, size=2732, scale=4):
    """Drawn on a size/scale grid, then enlarged by pixel repetition (fast, and keeps the blocky pixel-art look).
    The artwork is kept inside the central ~1200px: @capacitor/assets crops the edges for tall/wide phone shapes."""
    grid = size // scale                    # 683
    R = 300                                 # robot's square region, in grid px
    rx, ry = (grid - R) // 2, 145
    word, px_, gap = "BANK JOB", 6, 1
    cols = len(word) * (5 + gap) - gap
    wx, wy = (grid - cols * px_) // 2, 440
    def wordmark(gx, gy):
        col, row = (gx - wx) // px_, (gy - wy) // px_
        if not (0 <= col < cols and 0 <= row < 7): return None
        cell, gc = divmod(col, 5 + gap)
        if gc >= 5 or FONT[word[cell]][row][gc] != '#': return None
        t = (gx - wx) / (cols * px_)        # orange -> pink, same as the in-game title
        return (int(255), int(179 + (94 - 179) * t), int(71 + (138 - 71) * t))
    rows = []
    for gy in range(grid):
        row = bytearray()
        for gx in range(grid):
            c = None
            if ry <= gy < ry + R and rx <= gx < rx + R:
                c = robot_px((gx - rx) / R, (gy - ry) / R)
            row += bytes(c or wordmark(gx, gy) or SPLASH_BG) * scale
        row = bytes(row)
        rows.extend([row] * scale)
    write_png(path, size, size, rows)


if __name__ == '__main__':
    icon('www/icon-192.png', 192, 1.0)
    icon('assets/icon-only.png', 1024, .8)
    icon('www/icon-512.png', 512, 1.0)
    icon('www/icon-maskable-512.png', 512, .72)
    splash('assets/splash.png')
    splash('assets/splash-dark.png')
    print('images written')
