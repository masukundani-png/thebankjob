"""Generate PWA icons (pure stdlib): the robot alone on a dark tile."""
import zlib, struct

def png(path, size, safe):
    # safe = fraction of the tile the artwork occupies (smaller for maskable icons)
    px = bytearray()
    def inside(x, y, x0, y0, x1, y1): return x0 <= x <= x1 and y0 <= y <= y1
    def circ(x, y, cx, cy, r): return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    for j in range(size):
        px.append(0)
        for i in range(size):
            u, v = i / size, j / size
            a = (u - .5) / safe + .5; b = (v - .5) / safe + .5
            c = (12, 17, 36)                                            # background tile
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
            px += bytes(c)
    def chunk(t, d):
        body = t + d
        return struct.pack('>I', len(d)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    raw = zlib.compress(bytes(px), 9)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b''))

png('www/icon-192.png', 192, 1.0)
png('assets/icon-only.png', 1024, .8)
png('www/icon-512.png', 512, 1.0)
png('www/icon-maskable-512.png', 512, .72)
print('icons written')
