"""Original score and sound effects for the AmudSell ad, synthesised from scratch.

NumPy only. 120 BPM, F major, Fmaj7 - Am7 - Dm7 - Bbmaj7. Every cue below is
taken from the timeline in compose.html; if a scene moves there, move it here.

    python3 -I music.py ../work/score.wav
"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 22.5
N = int(SR * DUR)
BEAT = 0.5
DROP = 2.5          # S1 -> S2, the first bar of the band
HIT = 19.5          # S6, the outro hit
END_CHORD = 20.5
rng = np.random.default_rng(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


def buf():
    return np.zeros((N, 2))


def place(dst, sig, t, gain=1.0, pan=0.0):
    """Add a mono signal at time t with equal-power pan (-1 left .. 1 right)."""
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    a = (pan + 1) * np.pi / 4
    dst[i : i + len(sig), 0] += sig * gain * np.cos(a)
    dst[i : i + len(sig), 1] += sig * gain * np.sin(a)


def env(n, attack, decay):
    t = np.arange(n) / SR
    e = np.exp(-t / decay)
    a = int(attack * SR)
    if a:
        e[:a] *= np.linspace(0, 1, a)
    return e


def lowpass(x, cutoff):
    """Brick-ish lowpass in the frequency domain with a soft shoulder."""
    X = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    mask = 1 / np.sqrt(1 + (f / cutoff) ** 8)
    return np.fft.irfft(X * (mask[:, None] if X.ndim == 2 else mask), n=len(x), axis=0)


def highpass(x, cutoff):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (1 - 1 / np.sqrt(1 + (f / cutoff) ** 8)), n=len(x))


def reverb(x, seconds=1.4, mix=0.18):
    n = int(seconds * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-np.arange(n) / (SR * seconds / 6.5))[:, None]
    ir[:, 0] = lowpass(ir[:, 0], 5200)
    ir[:, 1] = lowpass(ir[:, 1], 5200)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    L = len(x) + n
    size = 1 << (L - 1).bit_length()
    wet = np.stack([np.fft.irfft(np.fft.rfft(x[:, c], size) * np.fft.rfft(ir[:, c], size), size)[: len(x)] for c in range(2)], axis=1)
    return x * (1 - mix) + wet * mix * 3.2


# ---------- instruments (additive, so filters are per-harmonic decays) ----------

def pluck(freq, length=0.9, bright=1.0):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h in range(1, 12):
        f = freq * h
        if f > 9000:
            break
        out += np.sin(2 * np.pi * f * t) / h ** 1.15 * np.exp(-t * (3.5 + h * 2.6 / bright))
    out *= np.minimum(1, t / 0.003)
    return out * 0.5


def bass(freq, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * freq * t) * 0.9
    for h in range(2, 7):
        out += np.sin(2 * np.pi * freq * h * t) / h * 0.35 * np.exp(-t * (5 + h * 3))
    e = np.minimum(1, t / 0.006) * np.minimum(1, (length - t) / 0.03)
    return out * e * 0.55


def pad(freqs, length):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            ff = f * 2 ** (det / 12)
            for h in range(1, 6):
                out += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) / h ** 1.6
    a = np.minimum(1, t / 0.25) * np.minimum(1, (length - t) / 0.35)
    return out * a / (len(freqs) * 6)


def kick():
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    f = 46 + 95 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 11)
    click = rng.standard_normal(n) * np.exp(-t * 400) * 0.25
    return (body + click) * 0.95


def clap():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 900)
    e = np.zeros(n)
    for d in (0, 0.011, 0.022):
        i = int(d * SR)
        e[i:] += np.exp(-(t[: n - i]) * 38)
    return lowpass(noise * e, 6000) * 0.28


def hat(open_=False):
    n = int((0.16 if open_ else 0.04) * SR)
    t = np.arange(n) / SR
    noise = highpass(rng.standard_normal(n), 7000)
    return noise * np.exp(-t * (18 if open_ else 110)) * 0.12


def blip(f0, f1=None, length=0.12, decay=0.05):
    n = int(length * SR)
    t = np.arange(n) / SR
    f = f0 if f1 is None else f0 * (f1 / f0) ** np.minimum(1, t / (length * 0.45))
    ph = 2 * np.pi * np.cumsum(np.full(n, 1.0) * f) / SR
    return np.sin(ph) * np.exp(-t / decay) * np.minimum(1, t / 0.002)


def thump(f=88):
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * (f + 40 * np.exp(-t * 40)) * t) * np.exp(-t * 18)


def whoosh(length=0.45, rise=True):
    n = int(length * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # Sweep a band by blending a low and a high version over time.
    lo, hi = lowpass(noise, 700), highpass(lowpass(noise, 7000), 2200)
    x = t / length if rise else 1 - t / length
    shape = np.sin(np.pi * np.clip(t / length, 0, 1)) ** 2
    return (lo * (1 - x) + hi * x) * shape * 0.22


def bell(midis, length=1.6):
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in midis:
        f = hz(m)
        for r, a, d in ((1, 1, 0.9), (2.0, 0.35, 0.4), (3.01, 0.18, 0.22), (4.2, 0.08, 0.12)):
            out += np.sin(2 * np.pi * f * r * t) * a * np.exp(-t / d)
    return out / len(midis) * 0.4


# ---------- the score ----------

CHORDS = {  # root (midi, bass octave), chord tones (midi)
    'F': (41, [65, 69, 72, 76]),
    'Am': (45, [64, 69, 72, 76]),
    'Dm': (38, [62, 65, 69, 72]),
    'Bb': (46, [62, 65, 69, 70]),
    'C': (48, [64, 67, 70, 72]),     # C7, the cadence
    'Fend': (41, [65, 69, 72, 76, 79]),
}
BARS = [(2.5, 'F'), (4.5, 'Am'), (6.5, 'Dm'), (8.5, 'Bb'), (10.5, 'F'), (12.5, 'Am'), (14.5, 'Dm'), (16.5, 'Bb'), (18.5, 'C')]


def chord_at(t):
    name = 'F'
    for at, c in BARS:
        if t >= at:
            name = c
    return name


music, drums, sfx = buf(), buf(), buf()

# Intro (S1): the old way — muffled, a little stuck, no drums.
intro = buf()
for i, t in enumerate(np.arange(0.0, DROP, BEAT / 2)):
    tones = CHORDS['F'][1]
    m = tones[[0, 2, 1, 2][i % 4]] - 12
    place(intro, pluck(hz(m), 0.6, bright=0.4), t, 0.5, pan=-0.2 if i % 2 else 0.2)
place(intro, pad([hz(m) for m in CHORDS['F'][1]], DROP + 0.2), 0, 0.5)
music += lowpass(intro, 900) * 0.9

# Pad and bass, bar by bar.
for k, (at, name) in enumerate(BARS):
    root, tones = CHORDS[name]
    length = (BARS[k + 1][0] if k + 1 < len(BARS) else HIT) - at
    place(music, pad([hz(m - 12) for m in tones], length + 0.3), at, 0.55)
    for b, (off, mul, ln) in enumerate([(0, 1, 0.42), (0.75, 1, 0.2), (1.0, 2, 0.4), (1.75, 1, 0.22)]):
        for rep in range(int(round(length / 2))):
            tt = at + rep * 2 + off
            if tt < HIT and tt < at + length:
                place(music, bass(hz(root) * mul, ln), tt, 0.45)

# Pluck arpeggio on 8ths; an octave up through the templates (S4).
pattern = [0, 1, 2, 3, 2, 1, 3, 2]
for i, t in enumerate(np.arange(DROP, HIT, BEAT / 2)):
    name = chord_at(t)
    tones = CHORDS[name][1]
    m = tones[pattern[i % 8]] + (12 if 12.0 <= t < 16.5 else 0)
    thin = 16.5 <= t < HIT
    place(music, pluck(hz(m), 0.7, bright=1.3 if 12 <= t < 16.5 else 1.0), t, 0.45 if thin else 0.6, pan=0.35 if i % 2 else -0.35)

# Drums: S2-S4 full, S5 thinned to kick and clap so the pops speak.
for i, t in enumerate(np.arange(DROP, HIT, BEAT)):
    place(drums, kick(), t, 0.72)
    beat_in_bar = i % 4
    if beat_in_bar in (1, 3):
        place(drums, clap(), t, 0.85, pan=0.05)
    if t < 16.5:
        open_ = 12.0 <= t < 16.5
        place(drums, hat(open_), t + BEAT / 2, 0.9 if open_ else 1.0, pan=0.3)
        if open_:
            place(drums, hat(False), t + BEAT / 4, 0.6, pan=-0.3)
            place(drums, hat(False), t + 3 * BEAT / 4, 0.6, pan=-0.3)

# Outro hit and resolve.
root, tones = CHORDS['F']
place(drums, kick(), HIT, 1.1)
place(drums, clap(), HIT, 0.9)
for m in tones:
    place(music, pluck(hz(m), 2.0, bright=1.4), HIT, 0.28)
place(music, bass(hz(41), 1.0), HIT, 0.6)
place(music, pad([hz(m - 12) for m in CHORDS['Fend'][1]], DUR - END_CHORD + 0.2), END_CHORD - 0.4, 0.8)
place(music, bass(hz(41), DUR - END_CHORD), END_CHORD, 0.4)
for m in (72, 77, 81):
    place(music, pluck(hz(m), 2.2, bright=1.6), END_CHORD, 0.22)
place(drums, kick(), END_CHORD, 0.8)

# Sidechain pump on pad and bass from the kick grid.
duck = np.ones(N)
for t in list(np.arange(DROP, HIT, BEAT)) + [HIT, END_CHORD]:
    i = int(t * SR)
    n = min(int(0.32 * SR), N - i)
    duck[i : i + n] = np.minimum(duck[i : i + n], 1 - 0.45 * np.exp(-np.arange(n) / (0.09 * SR)))
music *= duck[:, None]

# ---------- sound effects, pitched to F major ----------
F6, A5, C6, F5 = hz(89), hz(81), hz(84), hz(77)

place(sfx, blip(C6, F6, 0.16, 0.06), 0.75, 0.55)                       # S1 buyer's reply
place(sfx, whoosh(0.4), 2.18, 0.8)                                     # into S2
for i in range(4):                                                      # photos land
    place(sfx, thump(), 2.5 + i * 0.13 + 0.3, 0.5, pan=(-0.3, 0.3, -0.1, 0.2)[i])
place(sfx, whoosh(0.5), 5.0, 0.7)                                      # into the phone
for t in (5.9, 7.75, 10.15):                                           # taps
    place(sfx, blip(F6, length=0.07, decay=0.018), t, 0.45)
    place(sfx, highpass(rng.standard_normal(int(0.02 * SR)), 2500) * np.exp(-np.arange(int(0.02 * SR)) / 200), t, 0.15)
for t in (6.45, 7.25, 10.45):                                          # screen slides
    place(sfx, whoosh(0.32, rise=False), t - 0.02, 0.35)
for i, t in enumerate((8.05, 8.45, 8.85, 9.3, 9.65, 10.0)):             # fields fill
    place(sfx, blip(hz(84 + (0, 2, 4, 5, 7, 9)[i]), length=0.05, decay=0.012), t, 0.22, pan=0.15)
place(sfx, bell([77, 81, 84]), 11.6, 0.5)                              # clock settles on 4:00
place(sfx, whoosh(0.45), 11.7, 0.7)                                    # into the templates
for t in (13.5, 14.2, 14.9, 15.6):                                     # template swaps
    place(sfx, blip(C6, length=0.06, decay=0.015), t, 0.3, pan=0.2)
place(sfx, whoosh(0.4), 16.2, 0.6)                                     # into S5
place(sfx, blip(C6, F6, 0.18, 0.07), 16.7, 0.55)                       # card sent
place(sfx, blip(A5, C6, 0.16, 0.06), 17.62, 0.55)                      # buyer: "wow"
place(sfx, whoosh(0.4), 19.2, 0.7)                                     # into S6
place(sfx, bell([77, 84, 89], 2.4), 19.55, 0.35)                       # the logo's rings

# ---------- mix ----------
mix = reverb(music, 1.6, 0.16) * 0.8 + reverb(drums, 0.6, 0.06) * 0.9 + reverb(sfx, 1.2, 0.2) * 0.75
t = np.arange(N) / SR
fade = np.minimum(1, t / 0.02) * np.minimum(1, (DUR - t) / 0.6)
mix *= fade[:, None]
# Phones play nothing useful below ~40 Hz; it only eats headroom.
mix = np.stack([highpass(mix[:, c], 40) for c in range(2)], axis=1)
# A gentle presence shelf: phone speakers lose the plucks without it.
mix = mix + 0.45 * np.stack([highpass(mix[:, c], 1800) for c in range(2)], axis=1)
mix /= np.abs(mix).max()
mix = np.tanh(mix * 1.6) / np.tanh(1.6)
mix *= 0.89

out = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(out, f'{DUR}s')
