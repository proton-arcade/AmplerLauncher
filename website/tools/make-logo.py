#!/usr/bin/env python3
"""
Ampler Launcher - draw the wordmark (website/images/ampler-title.png).

"AMPLER" over "LAUNCHER", every letter a cracked Minecraft stone block, the
A of AMPLER carrying a creeper face, and a short dark reflection under each
row - like the blocks stand on a glossy black floor. Transparent background,
so the artwork behind it shows through.

Deterministic: same script, same pixels. Pure standard library.

    python3 website/tools/make-logo.py [--out website/images/ampler-title.png]
"""

import argparse
import random
import struct
import zlib

# ------------------------------------------------------------------ #
# Geometry: one letter is an 8x10 grid of units, one unit is U px.    #
# ------------------------------------------------------------------ #

U = 16
GW, GH = 8, 10
LETTER_W, LETTER_H = GW * U, GH * U
GAP = 6                       # between letters inside a word (nearly touching)
ROW_GAP = 44                  # between the two words
MARGIN_X = 48
TOP = 36
REFLECT_H = 58                # reflection under the bottom word
BOTTOM = 26

WORD_TOP = "AMPLER"           # its A gets the creeper face
WORD_BOTTOM = "LAUNCHER"

# ------------------------------------------------------------------ #
# Glyphs: the black ("carve") rectangles that make a stone block read #
# as a letter. Coordinates are (col_start, col_end, row_start,        #
# row_end), end-exclusive, on the 8x10 grid.                          #
# ------------------------------------------------------------------ #

CARVES = {
    'A_creeper': [
        (1, 3, 2, 4),        # left creeper eye
        (5, 7, 2, 4),        # right creeper eye
        (3, 5, 4, 5),        # mouth, top notch
        (2, 6, 5, 7),        # mouth, wide band
        (2, 3, 7, 8),        # left fang
        (5, 6, 7, 8),        # right fang
    ],
    'A': [
        (3, 5, 3, 6),        # counter
        (2, 3, 8, 10),       # left leg notch
        (5, 6, 8, 10),       # right leg notch
    ],
    'M': [
        (2, 3, 1, 5),        # left slot
        (5, 6, 1, 5),        # right slot
        (3, 5, 1, 4),        # centre V, down to two thirds
    ],
    'P': [
        (4, 7, 2, 5),        # bowl counter
        (6, 7, 5, 8),        # stem slot under the bowl
    ],
    'L': [
        (3, 5, 6, 9),        # the foot slot
    ],
    'E': [
        (4, 8, 2, 4),        # slot under the top arm
        (4, 8, 6, 8),        # slot over the bottom arm
    ],
    'R': [
        (4, 7, 2, 5),        # bowl counter
        (5, 8, 6, 9),        # leg slot
    ],
    'U': [
        (3, 5, 3, 9),        # bottom slot
    ],
    'N': [
        (1, 3, 1, 3),        # the diagonal, two units wide...
        (2, 4, 2, 4),
        (3, 5, 3, 5),
        (4, 6, 4, 6),
        (5, 7, 5, 7),
        (6, 8, 6, 8),        # ...from top left to bottom right
    ],
    'C': [
        (5, 8, 2, 4),        # top bar, open to the right
        (6, 8, 4, 6),        # the mouth of the C
        (6, 8, 6, 8),        # ...and open below it too
        (5, 8, 8, 9),        # bottom bar
    ],
    'H': [
        (2, 4, 1, 4),        # left slot, top
        (4, 6, 1, 4),        # right slot, top
        (2, 4, 6, 9),        # left slot, bottom
        (4, 6, 6, 9),        # right slot, bottom
    ],
}


def glyph_grid(letter, creeper_a):
    """10 rows x 8 cols of True (stone) / False (carved away)."""
    key = 'A_creeper' if (letter == 'A' and creeper_a) else letter
    grid = [[True] * GW for _ in range(GH)]
    for c0, c1, r0, r1 in CARVES[key]:
        for r in range(r0, r1):
            for c in range(c0, c1):
                grid[r][c] = False
    return grid


# ------------------------------------------------------------------ #
# Palette                                                             #
# ------------------------------------------------------------------ #

CARVE = (0, 0, 0, 0)              # carved away = transparent: the
                                  # background shows through the holes
CRACK = (26, 26, 30, 255)         # crack lines on the stone
EDGE_DARK = (156, 154, 161, 255)  # bottom / right bevel
EDGE_LIGHT = (227, 225, 231, 255) # top bevel
SHINE = (240, 238, 245, 255)      # a few bright chips
STONES = [(200, 198, 206), (192, 190, 198), (208, 206, 213), (184, 182, 191)]
REFLECT = (66, 65, 71)            # reflection silhouette (alpha fades out)


# Small crack shapes, in unit offsets from a corner.
CRACK_SHAPES = [
    [(0, 0), (1, 0), (2, 0), (2, 1)],
    [(0, 1), (0, 0), (1, 0), (2, 0)],
    [(0, 0), (0, 1), (0, 2), (1, 2)],
    [(0, 0), (1, 0), (1, 1), (1, 2), (2, 2)],
]


def draw_letter(pix, ox, oy, letter, creeper_a, rng):
    """Stamp one letter at offset (ox, oy) into the RGBA pix array."""
    grid = glyph_grid(letter, creeper_a)

    # per 2x2-unit cell mottling - the "stone brick" tiling of the reference
    shade = {}
    for cy in range(0, GH, 2):
        for cx in range(0, GW, 2):
            shade[(cx, cy)] = rng.choice(STONES)

    for r in range(GH):
        for c in range(GW):
            x0, y0 = ox + c * U, oy + r * U
            if not grid[r][c]:
                for y in range(y0, y0 + U):
                    for x in range(x0, x0 + U):
                        pix[y][x] = CARVE
                continue

            base = shade[(c - c % 2, r - r % 2)]
            for y in range(y0, y0 + U):
                for x in range(x0, x0 + U):
                    j = rng.randint(-2, 2)
                    px = (max(0, min(255, base[0] + j)),
                          max(0, min(255, base[1] + j)),
                          max(0, min(255, base[2] + j + 2)), 255)
                    if y == y0:
                        px = EDGE_LIGHT
                    elif y == y0 + U - 1:
                        px = EDGE_DARK
                    elif x == x0 + U - 1:
                        px = (px[0] - 8, px[1] - 8, px[2] - 8, 255)
                    pix[y][x] = px

            # thin seam under each 2x2 cell, so the stone reads as blocks
            if c % 2 == 1 and x0 + U < ox + LETTER_W:
                for y in range(y0, y0 + U):
                    pix[y][x0 + U - 1] = (px[0] - 10, px[1] - 10, px[2] - 9, 255)
            if r % 2 == 1 and y0 + U < oy + LETTER_H:
                for x in range(x0, x0 + U):
                    q = pix[y0 + U - 1][x]
                    pix[y0 + U - 1][x] = (max(0, q[0] - 10), max(0, q[1] - 10),
                                          max(0, q[2] - 9), 255)

    # a few jagged crack polylines: a 2px dark walk with a 1px light lip
    def stone_cells():
        out = []
        for r in range(GH):
            for c in range(GW):
                if grid[r][c]:
                    out.append((c, r))
        return out

    W, H = LETTER_W, LETTER_H
    def in_stone(x, y):
        if not (0 <= x < W and 0 <= y < H):
            return False
        return grid[y // U][x // U]

    for _ in range(7):
        c, r = rng.choice(stone_cells())
        x, y = ox + c * U + rng.randint(2, U - 3), oy + r * U + rng.randint(2, U - 3)
        steps = rng.randint(8, 16)
        for _ in range(steps):
            dx, dy = rng.choice([(1, 0), (1, 0), (-1, 0), (0, 1), (0, 1), (0, -1)])
            for _ in range(rng.randint(2, 5)):
                nx, ny = x + dx, y + dy
                if not in_stone(nx - ox, ny - oy):
                    break
                x, y = nx, ny
                pix[y][x] = CRACK
                pix[y + 1][x] = CRACK
                if pix[y - 1][x][3] == 255 and pix[y - 1][x] != CRACK:
                    pix[y - 1][x] = (214, 212, 220, 255)

    for _ in range(3):
        c, r = rng.choice(stone_cells())
        x0, y0 = ox + c * U + rng.randint(2, U - 4), oy + r * U + rng.randint(2, U - 4)
        for y in range(y0, y0 + 2):
            for x in range(x0, x0 + 2):
                pix[y][x] = SHINE


def draw_reflection(pix, ox, oy, letter, creeper_a, height, rng):
    """A short, dark, fading mirror of the letter below its feet."""
    grid = glyph_grid(letter, creeper_a)
    for y in range(height):
        src_r = (GH - 1) - int(y * (GH * 0.62) / height)
        alpha = max(0, 96 - int(y * 102 / height))
        for c in range(GW):
            if not grid[src_r][c]:
                continue
            x0 = ox + c * U
            for x in range(x0, x0 + U):
                j = rng.randint(-2, 2)
                pix[oy + y][x] = (REFLECT[0] + j, REFLECT[1] + j,
                                  REFLECT[2] + j, alpha)


def build():
    def word_width(word):
        return len(word) * LETTER_W + (len(word) - 1) * GAP

    W = max(word_width(WORD_TOP), word_width(WORD_BOTTOM)) + 2 * MARGIN_X
    y_top = TOP
    y_bottom = TOP + LETTER_H + ROW_GAP
    H = y_bottom + LETTER_H + REFLECT_H + BOTTOM

    # RGBA rows, everything transparent to begin with
    pix = [[(0, 0, 0, 0)] * W for _ in range(H)]
    rng = random.Random(20260918)   # deterministic

    def draw_word(word, y, creeper_first_a):
        x = (W - word_width(word)) // 2
        for i, ch in enumerate(word):
            ca = creeper_first_a and i == 0
            draw_letter(pix, x, y, ch, ca, rng)
            draw_reflection(pix, x, y + LETTER_H, ch, ca,
                            min(REFLECT_H, ROW_GAP - 4) if y == y_top else REFLECT_H,
                            rng)
            x += LETTER_W + GAP

    draw_word(WORD_TOP, y_top, creeper_first_a=True)
    draw_word(WORD_BOTTOM, y_bottom, creeper_first_a=False)
    return pix, W, H


def write_png(path, pix, W, H):
    raw = b""
    for row in pix:
        raw += b"\x00" + b"".join(struct.pack("4B", *p) for p in row)

    def chunk(tag, data):
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(png)


def main():
    ap = argparse.ArgumentParser(description="Draw the Ampler Launcher wordmark.")
    ap.add_argument("--out", default="website/images/ampler-title.png")
    args = ap.parse_args()

    pix, W, H = build()
    write_png(args.out, pix, W, H)
    print("wrote %s (%dx%d)" % (args.out, W, H))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
