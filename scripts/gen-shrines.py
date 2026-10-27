# Generates the legendary shrine layouts (LEGENDARY_SHRINES.md) and writes src/data/world/shrines.json.
# Usage: python scripts/gen-shrines.py   (checks every arena is clear of blockers; exits 1 if not)
import math, json, sys, os

WALK = set(',.:=xwP+&12%')  # walkable (% = cracked wall: walkable once smashed, counted as gate)


class G:
    def __init__(s, w, h, fill=','):
        s.w, s.h = w, h
        s.g = [[fill] * w for _ in range(h)]

    def put(s, x, y, ch):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h:
            s.g[y][x] = ch

    def disc(s, cx, cy, r, ch):
        for y in range(s.h):
            for x in range(s.w):
                if math.hypot(x - cx, y - cy) <= r + 0.25:
                    s.g[y][x] = ch

    def ring(s, cx, cy, r, ch, w=1.0, gaps=(), gapw=22):
        for y in range(s.h):
            for x in range(s.w):
                d = math.hypot(x - cx, y - cy)
                if abs(d - r) <= w / 2 + 0.2:
                    a = math.degrees(math.atan2(y - cy, x - cx)) % 360
                    if any(min(abs(a - g) % 360, 360 - abs(a - g) % 360) <= gapw for g in gaps):
                        continue
                    s.g[y][x] = ch

    def polar(s, cx, cy, r, angles, ch):
        for a in angles:
            s.put(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), ch)

    def rect(s, x0, y0, x1, y1, ch):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                s.put(x, y, ch)

    def box(s, x0, y0, x1, y1, ch):
        for x in range(x0, x1 + 1):
            s.put(x, y0, ch); s.put(x, y1, ch)
        for y in range(y0, y1 + 1):
            s.put(x0, y, ch); s.put(x1, y, ch)

    def vline(s, x, y0, y1, ch):
        for y in range(y0, y1 + 1):
            s.put(x, y, ch)

    def hline(s, y, x0, x1, ch):
        for x in range(x0, x1 + 1):
            s.put(x, y, ch)

    def spokes(s, cx, cy, r0, r1, angles, ch):
        for a in angles:
            for k in range(int(r0 * 2), int(r1 * 2) + 1):
                rr = k / 2
                s.put(cx + rr * math.cos(math.radians(a)), cy + rr * math.sin(math.radians(a)), ch)

    def text(s):
        return '\n'.join(''.join(r) for r in s.g)


def check(name, g, cx, cy, R, allow=''):
    """Blockers strictly inside the arena (radius R-1) other than the allowed cover chars."""
    bad = []
    for y in range(g.h):
        for x in range(g.w):
            if math.hypot(x - cx, y - cy) <= R - 1 and g.g[y][x] not in WALK and g.g[y][x] not in allow:
                bad.append((x, y, g.g[y][x]))
    return bad


L = {}
ARENA = {}
problems = []


def done(name, g, arena=None, allow=''):
    L[name] = g
    ARENA[name] = (arena, allow)
    if arena:
        b = check(name, g, *arena, allow=allow)
        if b:
            problems.append((name, b[:8], len(b)))


# ───────────── Tam Thần Điểu (cùng họ: sân lục giác ~ đĩa, 3 tượng lông vũ phía bắc, lõi nguyên tố ở tâm vỡ khi thức giấc)
g = G(27, 25); cx, cy = 13, 12
g.rect(0, 0, 26, 3, '~'); g.disc(cx, cy, 12.6, ','); g.ring(cx, cy, 12, '#', 1.2, gaps=(90,), gapw=9)
g.disc(cx, cy, 10.6, '.'); g.ring(cx, cy, 8, ':', 0.6); g.ring(cx, cy, 4, ':', 0.6)
g.polar(cx, cy, 11, (45, 135, 225, 315), 'O'); g.polar(cx, cy, 11.2, (230, 270, 310), 'S')
g.put(cx, cy, 'A'); g.put(cx, cy + 3, 'P'); g.vline(cx, 23, 24, '='); g.put(cx, 22, '^'); g.put(cx - 1, 22, '^'); g.put(cx + 1, 22, '^')
done('articuno', g, (cx, cy, 10), allow='A')

g = G(27, 25, ','); cx, cy = 13, 12
g.rect(0, 0, 26, 1, '~'); g.rect(0, 0, 1, 24, '~'); g.disc(cx, cy, 12.6, ','); g.rect(0, 0, 26, 0, '~'); g.rect(0, 0, 0, 24, '~')
g.ring(cx, cy, 12, '#', 1.0, gaps=(90,), gapw=9); g.disc(cx, cy, 10.6, '.')
g.spokes(cx, cy, 2, 9.5, range(0, 360, 45), ':')
g.polar(cx, cy, 11, (45, 135, 225, 315), 'O'); g.polar(cx, cy, 7, (0, 90, 180, 270), '&'); g.polar(cx, cy, 11.2, (230, 270, 310), 'S')
g.put(cx, cy, 'A'); g.put(cx, cy + 2, 'P'); g.vline(cx, 23, 24, '='); g.hline(22, cx - 1, cx + 1, '^')
done('zapdos', g, (cx, cy, 10), allow='A&')

g = G(27, 27, ','); cx, cy = 13, 12
g.ring(cx, cy, 12.3, 'L', 1.8); g.ring(cx, cy, 14, '#', 0.8, gaps=(90,), gapw=10)
g.disc(cx, cy, 10.8, '.'); g.ring(cx, cy, 5, ':', 0.6)
g.polar(cx, cy, 9, (30, 90, 150, 210, 270, 330), '*'); g.polar(cx, cy, 11, (235, 270, 305), 'S')
g.put(cx, cy, 'A'); g.put(cx, cy + 3, 'P'); g.vline(cx, 22, 26, '='); g.vline(cx - 1, 23, 26, '='); g.vline(cx + 1, 23, 26, '=')
done('moltres', g, (cx, cy, 10), allow='A*')

# ───────────── Lugia — đảo xoáy, đền cột đôi
g = G(37, 37, '~'); cx, cy = 18, 17
g.disc(cx, cy, 16.4, ','); g.disc(cx, cy, 13.6, '.'); g.ring(cx, cy, 9, ':', 0.6); g.ring(cx, cy, 4.5, ':', 0.6)
g.polar(cx, cy, 14.6, [a for a in range(0, 360, 24) if a not in (168, 192)], 'O')
g.polar(cx, cy, 16, (215, 270, 325), 'S'); g.put(cx, cy - 13, 'A'); g.put(cx, cy - 11, 'P'); g.put(cx, cy, '+')
g.hline(cy, 0, 4, '='); g.hline(cy - 1, 0, 4, '='); g.hline(cy + 1, 0, 4, '=')  # đê đá nối bờ phía tây
done('lugia', g, (cx, cy, 13))

# Kyogre — cổng xoáy (mặt đất) + Vực Nguyên Hải (bản đồ riêng)
g = G(21, 17, '~'); cx, cy = 10, 7
g.polar(cx, cy, 5, range(0, 360, 45), 'O'); g.disc(cx, cy, 1.2, '@'); g.disc(cx, 14, 2.2, ','); g.put(cx, 13, 'P'); g.put(cx, 12, '=')
g.hline(13, 0, cx - 3, '=')  # đê đá nối bờ phía tây (bờ biển duy nhất của Bờ Biển San Hô chạy dọc)
done('kyogre-gate', g)
g = G(41, 37, '#'); cx, cy = 20, 19
g.disc(cx, cy, 16.5, '~'); g.disc(cx, cy, 15, 'w'); g.disc(cx, cy, 10.5, '.'); g.ring(cx, cy, 13, 'x', 1.6)
g.polar(cx, cy, 16, [a for a in range(0, 360, 30) if a != 90], 'O'); g.put(cx, cy - 15, 'A'); g.put(cx, cy - 13, 'P'); g.put(cx, cy, '+')
g.vline(cx, 34, 36, '='); g.vline(cx, 31, 33, 'w'); g.hline(35, cx - 1, cx + 1, '^')
done('kyogre', g, (cx, cy, 14))

# ───────────── Ho-Oh — tháp chuông, 3 tầng thềm
g = G(37, 37, 'T'); cx, cy = 18, 18
g.disc(cx, cy, 16.5, ','); g.disc(cx, cy, 13.8, '.'); g.ring(cx, cy, 9.5, '=', 0.6, gaps=(270,), gapw=20); g.ring(cx, cy, 5, '=', 0.6, gaps=(270,), gapw=25)
g.disc(cx, cy, 2.5, ':')
g.rect(cx - 3, 0, cx + 3, 2, '#'); g.put(cx, 3, 'A'); g.put(cx, 5, 'P'); g.put(cx, cy, '+')
g.polar(cx, cy, 15.5, (180, 0), 'S'); g.polar(cx, cy, 14.4, (180, 0), '*'); g.put(cx, 31, '*')
g.polar(cx, cy, 15.6, (215, 325), 'O')
g.vline(cx - 2, 33, 36, '='); g.vline(cx + 2, 33, 36, '='); g.hline(32, cx - 3, cx + 3, '^'); g.put(cx, 33, 'S')
done('ho-oh', g, (cx, cy, 13))

# ───────────── Groudon — hào dung nham, đại điện
g = G(37, 37, ','); cx, cy = 18, 18
g.ring(cx, cy, 15.5, 'L', 1.6); g.disc(cx, cy, 14.3, '.')
g.spokes(cx, cy, 4, 12, (30, 150, 210, 330), 'x')
g.polar(cx, cy, 14, (45, 135, 225, 315), 'S')
g.disc(cx, cy - 15.5, 1.6, 'L'); g.put(cx, cy - 14, 'A'); g.put(cx, cy - 12, 'P'); g.put(cx, cy, '+')
g.vline(cx, 31, 36, '='); g.vline(cx - 1, 31, 36, '='); g.vline(cx + 1, 31, 36, '=')
done('groudon', g, (cx, cy, 13))

# ───────────── Rayquaza — bệ trời trên đỉnh
g = G(37, 37, '#'); cx, cy = 18, 17
g.disc(cx, cy, 16, ','); g.disc(cx, cy, 13.8, '.'); g.ring(cx, cy, 7, ':', 0.6); g.spokes(cx, cy, 1.5, 6.5, (0, 120, 240), ':')
g.polar(cx, cy, 15, [a for a in range(0, 360, 45) if a != 90], 'O'); g.polar(cx, cy, 16.3, (200, 270, 340), 'o')
g.put(cx, cy, 'A'); g.put(cx, cy + 3, 'P')
for k in range(6):  # cầu thang xoắn
    g.put(cx + (k % 2), 31 + k, '='); g.put(cx + (k % 2) - 1, 31 + k, '=')
done('rayquaza', g, (cx, cy, 13), allow='A')

# ───────────── Giratina — đền méo, cổng gương
g = G(37, 37, ','); cx, cy = 18, 18
for a in range(0, 360, 17):
    r = 16 + (a % 3)
    g.put(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), 'T')
g.disc(cx, cy, 14, '.'); g.polar(cx, cy, 14.6, [a for a in range(10, 360, 28) if not 80 < a < 110], 'O'); g.polar(cx, cy, 13.8, (24, 136, 208, 304), 'o')
for (dx, dy) in ((-6, -3), (5, -6), (7, 4), (-4, 7), (-9, 3), (2, 9)):
    g.put(cx + dx, cy + dy, 'x'); g.put(cx + dx + 1, cy + dy, 'x')
g.put(cx, cy - 14, 'A'); g.put(cx, cy - 12, 'P'); g.put(cx, cy, '+'); g.polar(cx, cy, 15.5, (235, 305), 'S')
g.vline(cx, 32, 36, '='); g.vline(cx + 1, 33, 36, '=')
done('giratina', g, (cx, cy, 13))

# ───────────── Mewtwo — hố tâm linh
g = G(31, 31, 'T'); cx, cy = 15, 15
g.disc(cx, cy, 14, '#'); g.disc(cx, cy, 12.6, '.'); g.ring(cx, cy, 12.6, '*', 0.6, gaps=(90,), gapw=12)
g.polar(cx, cy, 7, (45, 135, 225, 315), 'o'); g.ring(cx, cy, 3, ':', 0.6); g.put(cx, cy, 'A'); g.put(cx, cy + 4, 'P')
g.vline(cx, 27, 30, '='); g.vline(cx + 1, 28, 30, '=')
done('mewtwo', g, (cx, cy, 12), allow='Ao')

# ───────────── Thần Điện Khởi Nguyên (bản đồ riêng): Dialga, Palkia, Arceus
g = G(31, 29, '#'); cx, cy = 15, 15
g.rect(1, 1, 29, 27, '.'); g.ring(cx, cy, 11, ':', 0.6); g.polar(cx, cy, 12.4, range(0, 360, 30), 'o')
g.ring(cx, cy, 6, ':', 0.6); g.spokes(cx, cy, 0, 5.5, (270, 330), ':')
for (x, y) in ((2, 2), (28, 2), (2, 26), (28, 26)): g.put(x, y, 'O')
g.put(cx, 1, 'A'); g.put(cx, 3, 'P'); g.put(cx, cy, '+'); g.hline(28, cx - 1, cx + 1, '^')
done('dialga', g, (cx, cy, 11))

g = G(31, 29, '#'); cx, cy = 15, 15
g.rect(1, 1, 29, 27, '.'); g.polar(cx, cy, 12.6, range(15, 360, 30), '*')
for (a, c) in ((200, '1'), (20, '1'), (160, '2'), (340, '2')): g.polar(cx, cy, 8, (a,), c)
g.ring(cx, cy, 4, ':', 0.6); g.put(cx, 1, 'A'); g.put(cx, 3, 'P'); g.put(cx, cy, '+'); g.hline(28, cx - 1, cx + 1, '^')
done('palkia', g, (cx, cy, 11))

g = G(41, 39, '#'); cx, cy = 20, 21
g.rect(2, 4, 38, 37, '.'); g.rect(8, 1, 32, 3, '='); g.rect(15, 0, 25, 0, '#')
g.put(cx, 0, 'A'); g.put(cx, 2, 'P')
g.polar(cx, cy, 15.4, [a for a in range(0, 360, 20) if a not in (80, 100, 260, 280)], 'o')
g.vline(3, 6, 36, '.'); [g.put(3, y, 'O') for y in range(6, 37, 5)]; [g.put(37, y, 'O') for y in range(6, 37, 5)]
g.spokes(cx, cy, 0, 12.5, (0, 90, 180, 270), ':'); g.ring(cx, cy, 6, ':', 0.6); g.put(cx, cy, '+')
g.hline(38, cx - 2, cx + 2, '^')
done('arceus', g, (cx, cy, 14))

g = G(33, 21, ','); cx = 16
g.rect(6, 0, 26, 3, '#'); g.hline(3, 12, 20, '^'); g.rect(10, 4, 22, 16, '='); g.hline(2, 11, 21, 'o')
for y in (5, 9, 13): g.put(8, y, 'O'); g.put(24, y, 'O')
g.vline(cx, 17, 20, '='); g.put(cx, 5, 'P')
done('arceus-gate', g)

# ───────────── Hộ thần hồ (Azelf ở đầm, Uxie ở Thánh Địa): hồ + đảo hang, arena trên bờ
g = G(27, 29, ','); cx = 13
g.disc(cx, 7, 6.5, '~'); g.disc(cx, 7, 1.6, '.'); g.put(cx, 6, 'A')
g.disc(cx, 19, 8.6, '.'); g.ring(cx, 19, 3, ':', 0.6); g.put(cx, 19, 'P')
g.polar(cx, 7, 7.8, (160, 270, 20), 'o'); g.ring(cx, 19, 10, 'T', 0.8, gaps=(90, 270), gapw=14)
g.vline(cx, 28, 28, '=')
done('azelf', g, (cx, 19, 8))

g = G(31, 25, ','); cy = 12
g.disc(7, cy, 6.5, '~'); g.disc(7, cy, 1.6, '.'); g.put(6, cy, 'A')
g.disc(20, cy, 8.6, '.'); g.ring(20, cy, 4, ':', 0.6); g.put(20, cy, 'P')
g.polar(7, cy, 7.8, (250, 110, 180), 'o'); g.polar(20, cy, 10, (230, 270, 310), 'S'); g.hline(cy, 29, 30, '=')
done('uxie', g, (20, cy, 8))

# ───────────── Cresselia — hồ trăng phản chiếu
g = G(27, 27, 'T'); cx, cy = 13, 13
g.disc(cx, cy, 12.4, ','); g.disc(cx, cy, 11, ':'); g.disc(cx, cy, 9.2, '~'); g.disc(cx, cy, 1.5, '.'); g.put(cx, cy, 'A')
g.polar(cx, cy, 10.5, (215, 270, 325), '&'); g.polar(cx, cy, 12, (180, 0), 'o'); g.put(cx, cy + 10, 'P'); g.vline(cx, 24, 26, '=')
done('cresselia', g)  # arena = mặt hồ sau khi đông ánh trăng (xem mô tả)

# ───────────── Heatran — lòng chảo
g = G(27, 25, '#'); cx, cy = 13, 13
g.disc(cx, cy, 11.8, ','); g.disc(cx, cy, 10.4, '.')
for a in (210, 330, 90):
    g.disc(cx + 6 * math.cos(math.radians(a)), cy + 6 * math.sin(math.radians(a)), 0.8, 'L')
g.disc(cx, 2, 1.2, 'L'); g.put(cx, 3, 'A'); g.put(cx, 5, 'P'); g.put(cx, cy, '+')
g.vline(cx + 9, 18, 24, '='); g.vline(cx + 10, 19, 24, '=')
done('heatran', g, (cx, cy, 10), allow='L')

# ───────────── Regi — lăng chữ nhật có khóa
def chamber(name, w, h, inner, extra):
    g = G(w, h, ',')
    g.rect(0, 0, w - 1, h - 7, '#'); g.rect(2, 2, w - 3, h - 9, '.')
    g.put(w // 2, 1, '+'); g.put(w // 2, 2, 'A'); g.put(w // 2, 4, 'P')
    g.hline(h - 8, w // 2 - 1, w // 2 + 1, '='); g.hline(h - 7, w // 2 - 1, w // 2 + 1, '^'); g.put(w // 2 - 3, h - 6, 'S')
    g.rect(1, h - 6, w - 2, h - 1, ','); g.vline(w // 2, h - 3, h - 1, '=')
    inner(g); extra(g)
    return g


def rock_in(g):
    for y in (3, 8, 13):
        g.put(3, y, 'O'); g.put(19, y, 'O')
def rock_out(g):
    g.put(5, 20, 'B'); g.put(17, 20, 'B'); g.put(8, 18, '&'); g.put(14, 18, '&')
g = chamber('regirock', 23, 23, rock_in, rock_out); done('regirock', g, (11, 8, 7), allow='A')

def ice_in(g):
    for (x, y) in ((3, 3), (19, 3), (3, 14), (19, 14)): g.put(x, y, '*')
    g.ring(11, 9, 3, ':', 0.6); g.put(11, 9, '&')
g = chamber('regice', 23, 23, ice_in, lambda g: None); done('regice', g, (11, 8, 7), allow='A*&')

def steel_in(g):
    for (x, y) in ((4, 4), (18, 4), (11, 15)): g.put(x, y, '*')
    g.spokes(11, 9, 2, 6, (210, 330, 90), ':')
    for (x, y) in ((7, 11), (15, 11), (9, 6), (13, 6)): g.put(x, y, '&')
g = chamber('registeel', 23, 23, steel_in, lambda g: None); done('registeel', g, (11, 8, 7), allow='A*&')

g = G(37, 33, '#'); cx = 18
g.rect(2, 2, 34, 27, '.'); g.rect(cx - 1, 1, cx + 1, 3, 'A'); g.put(cx, 5, 'P')
for x in (cx - 6, cx, cx + 6): g.put(x, 6, '&')
for y in range(4, 27, 5): g.put(4, y, 'O'); g.put(32, y, 'O')
g.hline(28, cx - 2, cx + 2, '^'); g.rect(cx - 2, 29, cx + 2, 32, '='); g.put(cx, 16, '+'); g.ring(cx, 16, 6, ':', 0.6)
done('regigigas', g, (cx, 16, 11))

# ───────────── Mythic
g = G(21, 19, ','); cx, cy = 10, 10
g.ring(cx, cy, 8.4, '#', 1.0); g.disc(cx, cy, 7.4, '.'); g.put(cx, cy + 8, '%'); g.put(cx, cy + 9, '=')
g.polar(cx, cy, 6.6, (45, 135, 225, 315), 'S'); g.put(cx, cy - 6, 'A'); g.put(cx, cy - 4, 'P')
for (x, y) in ((1, 3), (18, 15), (3, 16), (17, 2)): g.put(x, y, '#')
done('mew', g, (cx, cy + 1, 6))

g = G(21, 19, 'T'); cx, cy = 10, 9
g.disc(cx, cy, 8.2, ','); g.ring(cx, cy, 5, ':', 0.7); g.polar(cx, cy, 3.4, (210, 330, 90), 'o'); g.put(cx, cy, 'A'); g.put(cx, cy + 2, 'P')
g.vline(cx, 17, 18, '=')
done('celebi', g)

g = G(25, 23, '~'); cx, cy = 12, 10
g.disc(cx, cy, 8.6, ','); g.disc(cx, cy, 7.2, '.'); g.polar(cx, cy, 8.3, (200, 250, 290, 340, 20), 'T')
g.put(cx, cy - 7, 'A'); g.put(cx, cy - 5, 'P'); g.put(cx, cy, '+')
path = [(12, 22), (12, 21), (11, 21), (11, 20), (11, 19), (12, 19), (12, 18)]
for (x, y) in path: g.put(x, y, '=')
for (x, y) in ((10, 20), (9, 20), (8, 21), (13, 19), (14, 19), (15, 20)): g.put(x, y, '=')  # lối giả cụt
done('darkrai', g, (cx, cy, 7))

g = G(21, 19, ','); cx, cy = 10, 9
g.disc(cx, cy, 7.4, '.')
for (x, y) in ((4, 5), (6, 4), (8, 5), (10, 6), (11, 9), (14, 9), (15, 6)): g.put(x, y, 'o')
g.put(cx, cy + 2, 'A'); g.put(cx, cy + 4, 'P'); g.vline(cx, 17, 18, '=')
done('jirachi', g)

g = G(21, 19, ','); cx, cy = 10, 9
g.disc(cx, cy, 7.4, ':'); g.polar(cx, cy, 5, (270, 342, 54, 126, 198), '&'); g.put(cx, cy, 'A'); g.put(cx, cy + 2, 'P'); g.vline(cx, 17, 18, '=')
done('shaymin', g)

g = G(25, 23, ','); cx, cy = 12, 11
g.ring(cx, cy, 9.6, '#', 1.0, gaps=(90, 210, 330), gapw=10); g.disc(cx, cy, 8.4, '.')
for k in range(12):
    a = k * 30; r = 2 + k * 0.45
    g.put(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a)), ':')
g.put(cx, cy - 8, 'A'); g.put(cx, cy - 6, 'P'); g.put(cx, cy, '+')
done('deoxys', g, (cx, cy, 8))

g = G(21, 19, '~'); cx, cy = 10, 9
g.disc(cx, cy, 8.2, ','); g.disc(cx, cy, 6.8, 'w'); g.polar(cx, cy, 6, (20, 70, 160, 200, 250, 290, 340), '*'); g.put(cx, cy, 'A'); g.put(cx, cy + 2, 'P')
g.vline(cx, 17, 18, '=')
done('manaphy', g)

# ───────────── Điểm kích hoạt lang thang
g = G(17, 11, '~'); cx = 8
g.rect(0, 3, 16, 10, ','); g.disc(cx, 3, 5.2, '.'); g.rect(0, 0, 16, 1, '~'); g.rect(0, 2, 16, 2, '#')
g.put(cx - 3, 3, 'S'); g.put(cx + 3, 3, 'S'); g.put(cx, 4, 'A'); g.put(cx, 6, 'P'); g.polar(cx, 3, 5.6, (20, 160, 60, 120), 'o'); g.vline(cx, 9, 10, '=')
done('lati', g)

g = G(13, 9, ','); g.rect(0, 0, 12, 2, '~'); g.put(6, 3, 'A'); g.put(4, 4, 'o'); g.put(8, 4, 'o'); g.put(6, 5, 'P'); g.vline(6, 7, 8, '=')
done('mesprit', g)


# ───────────── Placement & materials
# map: region id (or 'instanced' = its own plane, built in a later step) · x, y: map tile of the anchor (arena centre,
# else the altar) · tier 1–4 · m: materials of the stamp (floor '.', rune ':', 'x' ground, '*' kind, '#' wall style)
ICE = {'floor': 'Ice', 'rune': 'Snow', 'star': 'crystal'}
ASHF = {'floor': 'AshRock', 'rune': 'Ruin', 'star': 'torch'}
STONE = {'floor': 'Rocky', 'rune': 'Ruin', 'star': 'crystal'}
TEMPLE = {'floor': 'Ruin', 'rune': 'Sanctum', 'star': 'crystal'}
WHITE = {'floor': 'Sanctum', 'rune': 'Ruin', 'star': 'crystal', 'pillar': 'white'}
META = {
    'articuno': ('articuno', 2, 'frozen-mountains', 22, 40, {**ICE, 'pillar': 'ice'}),
    'zapdos': ('zapdos', 2, 'coral-coast', 16, 78, {**STONE, 'pillar': 'rod'}),
    'moltres': ('moltres', 2, 'volcanic-lands', 16, 40, ASHF),
    'lugia': ('lugia', 1, 'coral-coast', 88, 20, {**WHITE, 'ground': 'Sand'}),
    'kyogre': ('kyogre', 1, 'instanced', 0, 0, WHITE),
    'ho-oh': ('ho-oh', 1, 'emerald-woods', 28, 22, {**TEMPLE, 'star': 'torch'}),
    'groudon': ('groudon', 1, 'volcanic-lands', 88, 24, {**STONE, 'star': 'torch', 'x': 'AshRock'}),
    'rayquaza': ('rayquaza', 1, 'frozen-mountains', 88, 22, {**STONE, 'rune': 'Sanctum'}),
    'giratina': ('giratina', 1, 'misty-swamp', 92, 22, {**TEMPLE, 'pillar': 'broken'}),
    'mewtwo': ('mewtwo', 1, 'starter-valley', 136, 20, WHITE),
    'dialga': ('dialga', 1, 'instanced', 0, 0, TEMPLE),
    'palkia': ('palkia', 1, 'instanced', 0, 0, {**TEMPLE, 'plate': 'pad'}),
    'arceus': ('arceus', 1, 'instanced', 0, 0, TEMPLE),
    'azelf': ('azelf', 2, 'misty-swamp', 40, 22, TEMPLE),
    'uxie': ('uxie', 2, 'legendary-sanctuary', 23, 58, TEMPLE),
    'cresselia': ('cresselia', 2, 'emerald-woods', 76, 38, {**WHITE, 'plate': 'moon'}),
    'heatran': ('heatran', 2, 'volcanic-lands', 40, 16, ASHF),
    'regirock': ('regirock', 2, 'coral-coast', 30, 26, {**TEMPLE, 'rune': 'Sand'}),
    'regice': ('regice', 2, 'frozen-mountains', 84, 76, {**ICE, 'pillar': 'ice'}),
    'registeel': ('registeel', 2, 'misty-swamp', 60, 78, STONE),
    'regigigas': ('regigigas', 2, 'legendary-sanctuary', 74, 56, TEMPLE),
    'mew': ('mew', 4, 'starter-valley', 14, 34, {**TEMPLE, 'rune': 'Tuft'}),
    'celebi': ('celebi', 4, 'emerald-woods', 22, 68, {**TEMPLE, 'rune': 'Flowers'}),
    'darkrai': ('darkrai', 4, 'misty-swamp', 14, 40, STONE),
    'jirachi': ('jirachi', 4, 'frozen-mountains', 24, 80, {**WHITE, 'stone': 'star'}),
    'shaymin': ('shaymin', 4, 'volcanic-lands', 56, 80, {**TEMPLE, 'rune': 'TallGrass', 'plate': 'flower'}),
    'deoxys': ('deoxys', 4, 'legendary-sanctuary', 16, 18, STONE),
    'manaphy': ('manaphy', 4, 'coral-coast', 96, 84, WHITE),
    'lati': ('latias', 3, 'emerald-woods', 84, 6, WHITE),
    'mesprit': ('mesprit', 3, 'starter-valley', 116, 62, WHITE),
}


def find(g, ch):
    for y in range(g.h):
        for x in range(g.w):
            if g.g[y][x] == ch:
                return [x, y]
    return None


# Every shrine now stands in a plane of its own (LEGENDARY_SHRINES.md mục 8: a tier-1 dimension or the map's hidden
# sanctum, built by scripts/gen-legend-planes.ts); x, y above stay as the designed overworld spot of its entrance.
# The old gates (kyogre-gate, arceus-gate) became hidden entrances: their layouts are no longer written.
out = []
for name, g in L.items():
    if name not in META:
        continue
    legend, tier, region, x, y, m = META[name]
    region = 'instanced'
    arena, allow = ARENA[name]
    anchor = [int(arena[0]), int(arena[1])] if arena else (find(g, 'A') or find(g, '@') or find(g, 'P'))
    e = {'id': name, 'legend': legend, 'tier': tier, 'region': region, 'x': x, 'y': y, 'anchor': anchor,
         'arena': int(arena[2]) if arena else 0, 'cover': allow, 'materials': {'x': 'Mud', **m},
         'rows': [''.join(r) for r in g.g]}
    out.append(e)

for p in problems:
    print('ARENA', p)
path = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'world', 'shrines.json')
with open(path, 'w', encoding='utf8', newline='\n') as f:
    f.write('[\n' + ',\n'.join(' ' + json.dumps(e, ensure_ascii=False) for e in out) + '\n]\n')
print(len(out), 'shrines ->', os.path.normpath(path))
sys.exit(1 if problems else 0)
