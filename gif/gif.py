import math
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

S = 2                      # supersample factor
W, H = 1600, 900           # logical canvas
OUT_W, OUT_H = 1280, 720

NAVY = (11, 37, 69)
BLUE = (31, 95, 168)
LIGHT = (214, 228, 243)
PALE = (234, 241, 249)
WHITE = (255, 255, 255)
GREY = (150, 165, 185)
ACC = (238, 146, 10)
ACC_TINT = (255, 240, 208)

# Output directory: gif folder in workspace
OUT_DIR = Path(__file__).resolve().parent
OUT_DIR.mkdir(parents=True, exist_ok=True)

_fc = {}


def get_font_path(bold=True, fallback=False):
    # Try Linux paths first
    if fallback and os.path.exists("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        return "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    linux_poppins = f"/usr/share/fonts/truetype/google-fonts/{'Poppins-Bold.ttf' if bold else 'Poppins-Medium.ttf'}"
    if os.path.exists(linux_poppins):
        return linux_poppins

    # Windows standard fonts
    win_fonts = [
        ("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        ("C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf"),
        ("C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf"),
    ]
    for wf in win_fonts:
        if os.path.exists(wf):
            return wf
    return None


def font(size, bold=True, fallback=False):
    key = (size, bold, fallback)
    if key not in _fc:
        fp = get_font_path(bold, fallback)
        if fp:
            _fc[key] = ImageFont.truetype(fp, int(size * S))
        else:
            _fc[key] = ImageFont.load_default()
    return _fc[key]


def mix(c, a, base=WHITE):
    a = max(0.0, min(1.0, a))
    return tuple(int(round(base[i] + (c[i] - base[i]) * a)) for i in range(3))


def lerp(c1, c2, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(round(c1[i] + (c2[i] - c1[i]) * t)) for i in range(3))


def ramp(f, start, dur=8):
    return max(0.0, min(1.0, (f - start) / dur))


# ---------------------------------------------------------------- layout
def box(key, x, y, w, h, title, sub, fill, start):
    return dict(key=key, x=x, y=y, w=w, h=h, title=title, sub=sub, fill=fill, start=start)


tel = box("tel", 60, 140, 400, 110, "Site telemetry", "PV · wind · battery · gensets · load · weather", PALE, 6)
mqtt = box("mqtt", 560, 140, 400, 110, "MQTT telemetry bus", "edge I/O", PALE, 12)
ctrl = box("ctrl", 1060, 140, 480, 110, "Site controller (Modbus)", "genset and battery setpoints", PALE, 18)

CYC_Y, CYC_H, CYC_W = 400, 200, 250
cyc_data = [
    ("1 Detect", "sensor integrity · physics residuals · Isolation Forest"),
    ("2 Repair", "frozen or spiked readings fixed before forecasting"),
    ("3 Forecast", "XGBoost PV, wind, load · 24 h · p10/p90 bands"),
    ("4 Optimise", "MILP (OR-Tools): unit commitment + battery"),
    ("5 Dispatch", "execute hour 1, hold plan as context"),
]
cyc = [box("c%d" % i, 95 + 290 * i, CYC_Y, CYC_W, CYC_H, t, s, WHITE, 34 + 6 * i)
       for i, (t, s) in enumerate(cyc_data)]

sup_data = [
    ("Real-time balancing", "battery → gensets → emergency start → shed"),
    ("Safe mode", "rule-based fallback if the solver fails"),
    ("SQLite store", "telemetry, decisions, alerts, outbox"),
    ("FastAPI + dashboard", "operator view, overrides, fault injection"),
]
sup = [box("s%d" % i, 60 + 380 * i, 665, 340, 100, t, s, WHITE, 66 + 4 * i)
       for i, (t, s) in enumerate(sup_data)]

sat = box("sat", 60, 800, 1480, 80, "Satellite link (optional)",
          "in: weather forecast  |  out: store-and-forward logs and alerts  |  if it drops for 12 h, forecasting switches to the offline model",
          PALE, 84)

EMS = dict(x=60, y=320, w=1480, h=305, start=26)
EMS_LABEL = "EMS DECISION CYCLE  |  hourly  |  runs entirely on station hardware"

pulse_boxes = [tel, mqtt] + cyc + [ctrl]


# ---------------------------------------------------------------- drawing
def R(v):
    return int(round(v * S))


def wrap(text, fsize, bold, maxw):
    words = text.split(" ")
    lines, cur = [], ""
    dummy = ImageDraw.Draw(Image.new("RGB", (4, 4)))

    def tw(s):
        return dummy.textlength(s, font=font(fsize, bold)) / S

    for wd in words:
        t = (cur + " " + wd).strip()
        if tw(t) <= maxw or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def draw_line_text(d, cx, y, line, fsize, bold, color):
    """centered text; tokens containing an arrow use a fallback font"""
    toks = line.split(" ")
    parts = []
    for t in toks:
        fb = "→" in t
        parts.append((t, fb))
    sp = d.textlength(" ", font=font(fsize, bold)) / S
    widths = []
    for t, fb in parts:
        fnt = font(fsize * (0.85 if fb else 1), bold, fb)
        widths.append(d.textlength(t, font=fnt) / S)
    total = sum(widths) + sp * (len(parts) - 1)
    x = cx - total / 2
    for (t, fb), wd in zip(parts, widths):
        fnt = font(fsize * (0.85 if fb else 1), bold, fb)
        yy = y + (fsize * 0.08 if fb else 0)
        d.text((R(x), R(yy)), t, font=fnt, fill=color)
        x += wd + sp


def draw_box(d, b, alpha, act=0.0, flash=0.0):
    if alpha <= 0:
        return
    fill = lerp(b["fill"], NAVY, act)
    fill = lerp(fill, ACC_TINT, flash)
    border = lerp(NAVY, ACC, flash)
    tcol = lerp(NAVY, WHITE, act)
    scol = lerp(NAVY, WHITE, act)
    fill, border = mix(fill, alpha), mix(border, alpha)
    tcol, scol = mix(tcol, alpha), mix(scol, alpha)
    x, y, w, h = b["x"], b["y"], b["w"], b["h"]
    d.rectangle([R(x), R(y), R(x + w), R(y + h)], fill=fill, outline=border, width=R(2))
    big = b["key"].startswith("c")
    tsize = 27 if big else 25
    ssize = 18
    tl = wrap(b["title"], tsize, True, w - 24)
    sl = wrap(b["sub"], ssize, False, w - 28)
    lh_t, lh_s = tsize * 1.3, ssize * 1.42
    total = len(tl) * lh_t + 6 + len(sl) * lh_s
    yy = y + (h - total) / 2
    cx = x + w / 2
    for ln in tl:
        draw_line_text(d, cx, yy, ln, tsize, True, tcol)
        yy += lh_t
    yy += 6
    for ln in sl:
        draw_line_text(d, cx, yy, ln, ssize, False, scol)
        yy += lh_s


def arrow_head(d, x, y, direction, color, size=11):
    if direction == "r":
        pts = [(x, y), (x - size, y - size * 0.6), (x - size, y + size * 0.6)]
    elif direction == "d":
        pts = [(x, y), (x - size * 0.6, y - size), (x + size * 0.6, y - size)]
    elif direction == "u":
        pts = [(x, y), (x - size * 0.6, y + size), (x + size * 0.6, y + size)]
    d.polygon([(R(px), R(py)) for px, py in pts], fill=color)


def polyline(d, pts, color, width):
    for a, b in zip(pts[:-1], pts[1:]):
        d.line([R(a[0]), R(a[1]), R(b[0]), R(b[1])], fill=color, width=R(width))
    # round joins
    for p in pts[1:-1]:
        r = width / 2
        d.ellipse([R(p[0] - r), R(p[1] - r), R(p[0] + r), R(p[1] + r)], fill=color)


# ---------------------------------------------------------------- pulse path
def center(b):
    return (b["x"] + b["w"] / 2, b["y"] + b["h"] / 2)


ROUTE_Y = 372
det_c, dis_c = center(cyc[0]), center(cyc[4])
mq_c = center(mqtt)
# (x, y, dwell frames)
WAYPTS = [
    (center(tel)[0], center(tel)[1], 6),
    (mq_c[0], mq_c[1], 5),
    (mq_c[0], ROUTE_Y, 0),
    (det_c[0], ROUTE_Y, 0),
    (det_c[0], det_c[1], 6),
    (center(cyc[1])[0], det_c[1], 6),
    (center(cyc[2])[0], det_c[1], 6),
    (center(cyc[3])[0], det_c[1], 9),
    (dis_c[0], det_c[1], 6),
    (dis_c[0], center(ctrl)[1], 16),
]
SPEED = 20.0


def build_head_positions():
    # arclength parametrisation with dwell
    segs, total = [], 0.0
    for a, b in zip(WAYPTS[:-1], WAYPTS[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        segs.append((a, b, L, total))
        total += L
    positions = []  # (s, x, y)
    # initial dwell
    for _ in range(WAYPTS[0][2]):
        positions.append((0.0, WAYPTS[0][0], WAYPTS[0][1]))
    for i, (a, b, L, s0) in enumerate(segs):
        n = max(1, int(round(L / SPEED)))
        for k in range(1, n + 1):
            t = k / n
            positions.append((s0 + L * t, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        for _ in range(b[2]):
            positions.append((s0 + L, b[0], b[1]))
    return positions, segs, total


HEAD, SEGS, TOTAL = build_head_positions()


def point_at(s):
    s = max(0.0, min(TOTAL, s))
    for a, b, L, s0 in SEGS:
        if s <= s0 + L + 1e-6:
            t = (s - s0) / L if L else 0
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
    return (WAYPTS[-1][0], WAYPTS[-1][1])


def inside(b, p, pad=0):
    return b["x"] - pad <= p[0] <= b["x"] + b["w"] + pad and b["y"] - pad <= p[1] <= b["y"] + b["h"] + pad


# ---------------------------------------------------------------- frames
def render(f, pulse_idx=None, act=None, flash=None, trail_s=None):
    img = Image.new("RGB", (R(W), R(H)), WHITE)
    d = ImageDraw.Draw(img)
    act = act or {}
    flash = flash or {}

    # title block
    a = ramp(f, 0, 10)
    d.text((R(60), R(28)), "System architecture and process flow", font=font(40, True), fill=mix(NAVY, a))
    d.text((R(60), R(80)), "PS 26061  |  Bharat Energy AI  |  Team Patterns", font=font(21, False), fill=mix(BLUE, a))

    # EMS container
    ea = ramp(f, EMS["start"], 10)
    if ea > 0:
        d.rectangle([R(EMS["x"]), R(EMS["y"]), R(EMS["x"] + EMS["w"]), R(EMS["y"] + EMS["h"])],
                    fill=mix(LIGHT, ea), outline=mix(NAVY, ea), width=R(2))
        d.text((R(EMS["x"] + 30), R(EMS["y"] + 14)), EMS_LABEL, font=font(20, True), fill=mix(NAVY, ea))

    # static connectors
    def conn(start, pts, head=None):
        a_ = ramp(f, start, 8)
        if a_ <= 0:
            return
        col = mix(NAVY, a_ * 0.55)
        polyline(d, pts, col, 2.5)
        if head:
            arrow_head(d, pts[-1][0], pts[-1][1], head, mix(NAVY, a_ * 0.8))

    conn(14, [(460, 195), (558, 195)], "r")
    conn(EMS["start"], [(mq_c[0], 250), (mq_c[0], ROUTE_Y), (det_c[0], ROUTE_Y), (det_c[0], CYC_Y - 2)], "d")
    conn(EMS["start"] + 6, [(dis_c[0], CYC_Y), (dis_c[0], 252)], "u")
    for i in range(4):
        c1, c2 = cyc[i], cyc[i + 1]
        conn(c2["start"] + 2, [(c1["x"] + c1["w"], CYC_Y + CYC_H / 2), (c2["x"] - 2, CYC_Y + CYC_H / 2)], "r")
    for i, b in enumerate(sup):
        cx = b["x"] + b["w"] / 2
        a_ = ramp(f, b["start"], 8)
        if a_ > 0:
            fl = flash.get(b["key"], 0)
            col = lerp(mix(GREY, a_), ACC, fl)
            polyline(d, [(cx, EMS["y"] + EMS["h"]), (cx, b["y"])], col, 2.5 if fl < 0.05 else 4)

    # boxes
    for b in [tel, mqtt, ctrl] + cyc + sup + [sat]:
        draw_box(d, b, ramp(f, b["start"], 8), act.get(b["key"], 0.0), flash.get(b["key"], 0.0))

    # pulse trail + head
    if pulse_idx is not None:
        s, hx, hy = HEAD[pulse_idx]
        t0 = max(0.0, s - 300)
        n = 46
        pts = [point_at(t0 + (s - t0) * k / n) for k in range(n + 1)]
        for k in range(n):
            frac = (k + 1) / n
            col = lerp(WHITE if False else (250, 210, 140), ACC, frac)
            d.line([R(pts[k][0]), R(pts[k][1]), R(pts[k + 1][0]), R(pts[k + 1][1])],
                   fill=col, width=R(3 + 3 * frac))
        for r, c in ((17, (252, 221, 165)), (10, ACC)):
            d.ellipse([R(hx - r), R(hy - r), R(hx + r), R(hy + r)], fill=c)
        d.ellipse([R(hx - 4), R(hy - 4), R(hx + 4), R(hy + 4)], fill=WHITE)

    return img.resize((OUT_W, OUT_H), Image.LANCZOS)


def main():
    print("Rendering animation frames...")
    frames, durs = [], []
    BUILD_END = 96
    for f in range(BUILD_END):
        frames.append(render(f))
        durs.append(50)

    # pulse phase
    act = {b["key"]: 0.0 for b in pulse_boxes}
    n = len(HEAD)
    for i in range(n):
        f = BUILD_END + i
        p = (HEAD[i][1], HEAD[i][2])
        for b in pulse_boxes:
            tgt = 1.0 if inside(b, p) else 0.0
            v = act[b["key"]]
            act[b["key"]] = min(tgt, v + 0.35) if tgt > v else max(tgt, v - 0.07)
        frames.append(render(f, pulse_idx=i, act=dict(act)))
        durs.append(50)

    # settle: fade activations out while support blocks flash
    f = BUILD_END + n
    seq = [b["key"] for b in sup] + ["sat"]
    FL = 13
    total_settle = FL * len(seq) + 14
    for k in range(total_settle):
        for b in pulse_boxes:
            act[b["key"]] = max(0.0, act[b["key"]] - 0.07)
        flash = {}
        idx = k // FL
        if idx < len(seq):
            ph = (k % FL) / FL
            flash[seq[idx]] = math.sin(math.pi * min(1.0, ph * 1.15)) if True else 0
            flash[seq[idx]] = max(flash[seq[idx]], 0.0)
        frames.append(render(f + k, act=dict(act), flash=flash))
        durs.append(50)
    durs[-1] = 1800

    print(f"Total {len(frames)} frames rendered. Quantizing and saving GIF...")

    # global palette from a montage of representative frames
    picks = frames[::12] + [frames[BUILD_END + 40], frames[BUILD_END + 70], frames[BUILD_END + 100], frames[-1]]
    mont = Image.new("RGB", (OUT_W, OUT_H * len(picks)))
    for i, im in enumerate(picks):
        mont.paste(im, (0, i * OUT_H))
    pal = mont.quantize(colors=128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    q = [im.quantize(palette=pal, dither=Image.Dither.NONE) for im in frames]

    gif_path = OUT_DIR / "architecture.gif"
    last_png = OUT_DIR / "last.png"
    mid_png = OUT_DIR / "mid.png"

    q[0].save(str(gif_path), save_all=True, append_images=q[1:],
              duration=durs, loop=0, optimize=False, disposal=1)
    frames[-1].save(str(last_png))
    frames[BUILD_END + 60].save(str(mid_png))
    print(f"Done! Saved {len(frames)} frames to {gif_path}")
    print(f"Saved keyframes: {last_png}, {mid_png}")


if __name__ == "__main__":
    main()
