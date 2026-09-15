#!/usr/bin/env python3
"""Озвучка предложений-примеров (диктант) нейросинтезом — по уровням.

Диктант читает предложение из поля ex слова; без speechSynthesis на
телефоне он молчит, а с ним звучит как повезёт. Здесь — тот же голос,
что у слов (build_audio_synth.py), но предложения, и только уровни,
которые попросили (--levels): все шесть ≈ 140 МБ, A1–B1 ≈ 35 МБ.

Имена файлов — хэш текста, не сам текст: предложения длинные, с
кавычками и знаками. Хэш FNV-1a 64 бит от UTF-8 нормализованного текста
(trim + схлопнутые пробелы), 16 hex-символов — ровно так же считает
клиент (sentAudioKey в js/exercises.js). Файлы: audio/sent/<hex>.mp3.
Список того, что озвучено, — js/sent-audio-<УРОВЕНЬ>.js: строка хэшей
через пробел, клиент грузит его лениво вместе с уровнем словаря.
Манифест audio/sent/manifest.json — текст, уровень, голос, лицензия.

Запуск (venv с piper-tts 1.8 + onnx + Pillow):
    VENV/bin/python tools/build_sent_audio.py --engine piper \\
        --model ~/piper/en_GB-cori-high.onnx --voice-name en_GB-cori-high \\
        --author "…" --license "Public domain" --license-url "…" --source "…" \\
        --levels A1,A2,B1 [--limit 50] [--dry]

Возобновляемый: хэш, который уже в манифесте, не переделывается.
"""
import argparse
import glob
import json
import os
import re
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_audio        # noqa: E402  — convert(), load_json/save_json
import build_audio_synth  # noqa: E402  — движки

ROOT = build_audio.ROOT
OUT_DIR = os.path.join(ROOT, "audio", "sent")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")


def normalize(text):
    return " ".join(str(text or "").split())


# Пробелы, на которых Python str.split() и JS \s расходятся: BOM пробел
# только в JS, NEL и U+001C–U+001F — только в Python. sentAudioKey в
# js/exercises.js повторяет таблицу Python, но такому символу в примере
# всё равно не место: он невидим, а любая правка нормализации на одной из
# сторон снова разведёт хэши. Предложение с ним не озвучиваем и ругаемся.
ODD_WS = "\ufeff\x85\x1c\x1d\x1e\x1f"


def fnv1a64(text):
    """FNV-1a 64 бит, hex. В js/exercises.js та же формула на BigInt."""
    h = 0xcbf29ce484222325
    for b in normalize(text).encode("utf-8"):
        h ^= b
        h = (h * 0x100000001b3) & 0xFFFFFFFFFFFFFFFF
    return "%016x" % h


def sentences_by_level():
    """Поле ex каждого слова, по уровням, без дублей внутри уровня."""
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "js", "words-*.js"))):
        lvl = re.search(r"words-([A-C][12])\.js", f).group(1)
        src = open(f, encoding="utf-8").read()
        seen, rows = set(), []
        for raw in re.findall(r'\bex: "((?:[^"\\]|\\.)*)"', src):
            if any(c in raw for c in ODD_WS):
                print("пропуск (невидимый пробел %s): %r" % (
                    ",".join("U+%04X" % ord(c) for c in ODD_WS if c in raw), raw), file=sys.stderr)
                continue
            ex = normalize(raw.replace('\\"', '"'))
            if not ex or ex in seen:
                continue
            seen.add(ex)
            rows.append(ex)
        out[lvl] = rows
    return out


def max_seconds(text):
    """Порог заикания для предложения: 2 с + 0.12 с на символ."""
    return 2.0 + 0.12 * len(text)


def write_presence_js(manifest):
    """js/sent-audio-<УРОВЕНЬ>.js — хэши, которые есть, по уровням.

    Уровень — тот, где предложение ВСТРЕЧАЕТСЯ (sentences_by_level), а не
    тот, под которым его записали впервые (manifest["level"]): общее для
    A2 и B1 предложение из прогона B1 иначе попадало в список одного B1,
    и ученик A1, который грузит A1–A2, не находил запись, которая есть.
    Файл пишем только уровням, которые прогоняли: список из трёх чужих
    хэшей открыл бы диктант уровню, где записей по сути нет."""
    rendered = {m["level"] for m in manifest.values()}
    by_level = {}
    for lvl, rows in sentences_by_level().items():
        keys = sorted({fnv1a64(t) for t in rows if fnv1a64(t) in manifest})
        if keys and lvl in rendered:
            by_level[lvl] = keys
    for lvl, keys in by_level.items():
        path = os.path.join(ROOT, "js", "sent-audio-%s.js" % lvl)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("// Сгенерировано tools/build_sent_audio.py — руками не править.\n"
                     "// Хэши (FNV-1a 64) предложений уровня %s, на которые есть\n"
                     "// audio/sent/<хэш>.mp3; см. sentAudioKey в js/exercises.js.\n"
                     "window.SENT_AUDIO = window.SENT_AUDIO || {};\n"
                     'SENT_AUDIO["%s"] = "%s";\n' % (lvl, lvl, " ".join(sorted(keys))))
    return sorted(by_level)


class DirectPiper(build_audio_synth.Piper):
    """Предложение — законченная фраза, носитель не нужен: заикание VITS
    бывает на коротком входе, а тут 20–40 символов с точкой."""

    def synth(self, text, wav_path):
        import wave
        chunks = list(self.voice.synthesize(text))
        audio = self.np.concatenate([c.audio_float_array for c in chunks])
        sr = chunks[0].sample_rate
        if len(audio) / sr > max_seconds(text):
            raise RuntimeError("заикание: %.1f с" % (len(audio) / sr))
        pcm = (self.np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(pcm)


class DirectKokoro(build_audio_synth.KokoroEngine):
    def synth(self, text, wav_path):
        ipa = "".join("".join(s) for s in self.ph.phonemize(self.espeak_voice, text))
        ipa = "".join(c for c in ipa if c in self.vocab)
        samples, sr = self.k.create(ipa, voice=self.voice, speed=1.0, lang=self.lang,
                                    is_phonemes=True)
        if len(samples) / sr > max_seconds(text):
            raise RuntimeError("заикание: %.1f с" % (len(samples) / sr))
        self.sf.write(wav_path, samples, sr)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--engine", choices=("piper", "kokoro"), default="piper")
    ap.add_argument("--model", required=True)
    ap.add_argument("--voices", default="")
    ap.add_argument("--voice", default="")
    ap.add_argument("--voice-name", required=True)
    ap.add_argument("--author", required=True)
    ap.add_argument("--license", required=True)
    ap.add_argument("--license-url", default="")
    ap.add_argument("--source", required=True)
    ap.add_argument("--levels", required=True, help="уровни через запятую: A1,A2,B1")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args(argv)

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = build_audio.load_json(MANIFEST, {})
    want = [x.strip().upper() for x in a.levels.split(",") if x.strip()]
    by_level = sentences_by_level()
    todo = []
    for lvl in want:
        for text in by_level.get(lvl, []):
            key = fnv1a64(text)
            if key in manifest:
                continue
            todo.append((lvl, text, key))
    if a.limit:
        todo = todo[:a.limit]
    print("предложений без записи (%s): %d" % (",".join(want), len(todo)))
    if a.dry or not todo:
        return 0

    if a.engine == "kokoro":
        engine = DirectKokoro(a.model, a.voices, a.voice)
    else:
        engine = DirectPiper(a.model)
    tmpdir = tempfile.mkdtemp(prefix="sent-")
    wav = os.path.join(tmpdir, "s.wav")
    done, broken, rejects = 0, 0, []
    for n, (lvl, text, key) in enumerate(todo, 1):
        out_path = os.path.join(OUT_DIR, key + ".mp3")
        try:
            engine.synth(text, wav)
        except Exception as exc:  # noqa: BLE001
            rejects.append("%s: synth %s" % (text[:40], exc))
            broken += 1
            continue
        err = build_audio.convert(wav, out_path)
        if err:
            rejects.append("%s: %s" % (text[:40], err))
            broken += 1
            try:
                os.unlink(out_path)
            except OSError:
                pass
            continue
        manifest[key] = {
            "text": text, "level": lvl, "synthetic": True, "voice": a.voice_name,
            "author": a.author, "license": a.license, "license_url": a.license_url,
            "source": a.source,
        }
        done += 1
        if n % 100 == 0:
            build_audio.save_json(MANIFEST, manifest)
            print("  %d/%d" % (n, len(todo)), flush=True)
    build_audio.save_json(MANIFEST, manifest)
    levels = write_presence_js(manifest)
    print("синтезировано: %d, битых: %d; presence-файлы: %s" % (done, broken, ", ".join(levels)))
    for r in rejects[:40]:
        print("  " + r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
