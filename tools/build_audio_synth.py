#!/usr/bin/env python3
"""Дозвучка слов, на которые на Commons нет записи носителя, — нейросинтезом.

Зачем. build_audio.py берёт записи живых людей с Wikimedia Commons, и это
лучший вариант — но покрывает 53% словаря: у Commons просто нет файла
«En-us-world.ogg». Остальные слова падали на серверную озвучку (русский
голос читал английское слово с акцентом) или на браузерный синтез, где
дешёвый андроид говорит по-немецки. Здесь — открытый нейроголос, обученный
на речи носителя: одинаково на любом устройстве, без платных API в момент
урока, и с лицензией, которую можно предъявить.

Движки (--engine):
  piper  — piper-tts 1.8 (движок GPL-3.0; вывод программы лицензией GPL
           не покрывается — см. GPL FAQ). Голоса берём только с данными в
           общественном достоянии: en_GB-cori-high, en_US-ljspeech-high,
           en_US-norman/john/kristin-medium (LibriVox / LJ Speech).
           Голоса hfc_*, lessac, ryan — non-commercial, НЕ брать.
  kokoro — Kokoro-82M через kokoro-onnx (веса Apache-2.0). Нужны --voices
           (npz с голосами) и --voice (af_heart, bm_george, ...).

Автор и лицензия каждой синтезированной записи кладутся в тот же манифест,
что у живых записей, с флагом "synthetic": true, и попадают в credits.html
(tools/build_images.py --credits).

Живые записи НЕ трогаем и НЕ заменяем: синтез только там, где записи нет
(нет слова в манифесте). Файл, конвертация (mono, 24 кГц, 40 кбит/с,
тишина срезана, -18 LUFS) и имя — те же, что у build_audio.py, поэтому
клиенту всё равно, откуда звук.

Запуск (venv с движком + Pillow: build_audio тянет wordpipe.imaging;
для piper ещё onnx — piper-tts[alignment]; модель уже скачана):
    VENV/bin/python tools/build_audio_synth.py --engine piper \\
        --model ~/piper/en_GB-cori-high.onnx \\
        --voice-name "en_GB-cori-high" \\
        --author "Piper TTS, голос en_GB-cori (данные LibriVox, public domain)" \\
        --license "Public domain" \\
        --license-url "https://librivox.org/pages/public-domain/" \\
        --source "https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_GB/cori/high" \\
        [--limit 50] [--levels A1,A2,B1,B2] [--only world,film] [--dry]

Возобновляемый: слово, уже записанное в манифест, не переделывается.
Осиротевший mp3 (файл есть, в манифесте нет) перезаписывается — манифест
единственный источник правды, клиент такой файл всё равно не играет.
"""
import argparse
import glob
import os
import re
import sys
import tempfile
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_audio  # noqa: E402  — convert(), safe_name(), манифест, js

ROOT = build_audio.ROOT
OUT_DIR = build_audio.OUT_DIR
MANIFEST = build_audio.MANIFEST


def all_words_by_level():
    """Слова словаря по уровням из js/words-XX.js (в порядке файлов)."""
    out = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "js", "words-*.js"))):
        lvl = re.search(r"words-([A-C][12])\.js", f).group(1)
        src = open(f, encoding="utf-8").read()
        out[lvl] = [w.strip().lower() for w in re.findall(r'\{ w: "([^"]+)"', src)]
    return out


CARRIER = "The next word is %s."
MAX_WORD_SEC = 3.0   # дольше — синтез «заикнулся» (повторил слово), бракуем


class Piper:
    """Слово читается в конце фразы-носителя и вырезается по выравниванию
    фонем. Изолированное короткое слово («film.») Piper-medium повторяет
    3-4 раза — VITS «заикается» на коротком входе; в конце фразы читает
    один раз, с нормальной нисходящей интонацией. Вырезаем с последнего
    пробела-фонемы; его тишину срезает convert(). Нужен пакет onnx
    (pip install piper-tts[alignment])."""

    def __init__(self, model):
        import numpy as np
        from piper import PiperVoice
        self.np = np
        self.voice = PiperVoice.load(model, include_alignments=True)

    def synth(self, word, wav_path):
        chunk = list(self.voice.synthesize(CARRIER % word, include_alignments=True))[0]
        al = chunk.phoneme_alignments
        if not al:
            raise RuntimeError("piper без выравнивания фонем — установлен ли onnx?")
        idx = max(i for i, a in enumerate(al) if a.phoneme == " ")
        start = int(sum(a.num_samples for a in al[:idx]))
        audio = chunk.audio_float_array[start:]
        if len(audio) / chunk.sample_rate > MAX_WORD_SEC:
            raise RuntimeError("заикание: %.1f с" % (len(audio) / chunk.sample_rate))
        pcm = (self.np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
        with wave.open(wav_path, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(chunk.sample_rate)
            wf.writeframes(pcm)


class KokoroEngine:
    """Kokoro-82M через kokoro-onnx. Изолированные слова читает без
    заикания, поэтому носитель не нужен: «word.» — законченная фраза.

    Фонемы — от espeak-ng, вшитого в piper-tts (в том же venv), а не от
    штатной связки phonemizer + espeakng-loader: её колесо на macOS
    передаёт в espeak_Initialize путь, вшитый при сборке (/Users/runner/…),
    espeak не находит phontab и роняет процесс через exit(1) — обойти
    снаружи нельзя. kokoro.create(..., is_phonemes=True) принимает IPA как
    есть; символы вне словаря Kokoro отбрасываем, как делает он сам.
    Голоса b* (британские) — espeak «en» (= en-gb), a* — «en-us»."""

    def __init__(self, model, voices, voice):
        import soundfile
        from kokoro_onnx import Kokoro
        from kokoro_onnx.tokenizer import DEFAULT_VOCAB
        from piper.phonemize_espeak import EspeakPhonemizer
        self.sf = soundfile
        self.vocab = DEFAULT_VOCAB
        self.ph = EspeakPhonemizer()
        self.k = Kokoro(model, voices)
        self.voice = voice
        british = voice.startswith("b")
        self.espeak_voice = "en" if british else "en-us"
        self.lang = "en-gb" if british else "en-us"

    def synth(self, word, wav_path):
        ipa = "".join("".join(s) for s in self.ph.phonemize(self.espeak_voice, word + "."))
        ipa = "".join(c for c in ipa if c in self.vocab)
        if not ipa.strip("."):
            raise RuntimeError("espeak не дал фонем")
        samples, sr = self.k.create(ipa, voice=self.voice, speed=1.0, lang=self.lang,
                                    is_phonemes=True)
        if len(samples) / sr > MAX_WORD_SEC:
            raise RuntimeError("заикание: %.1f с" % (len(samples) / sr))
        self.sf.write(wav_path, samples, sr)


def make_engine(a):
    if a.engine == "kokoro":
        if not (a.voices and a.voice):
            sys.exit("kokoro: нужны --voices <npz> и --voice <имя>")
        return KokoroEngine(a.model, a.voices, a.voice)
    return Piper(a.model)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--engine", choices=("piper", "kokoro"), default="piper")
    ap.add_argument("--model", required=True, help="путь к .onnx модели")
    ap.add_argument("--voices", default="", help="kokoro: npz с голосами")
    ap.add_argument("--voice", default="", help="kokoro: имя голоса (af_heart, bm_george…)")
    ap.add_argument("--voice-name", required=True, help="имя голоса для манифеста")
    ap.add_argument("--author", required=True, help="автор/происхождение для credits")
    ap.add_argument("--license", required=True, help="лицензия голоса (как в MODEL_CARD)")
    ap.add_argument("--license-url", default="")
    ap.add_argument("--source", required=True, help="ссылка на модель/датасет")
    ap.add_argument("--levels", default="", help="только эти уровни, через запятую")
    ap.add_argument("--only", default="", help="только эти слова, через запятую")
    ap.add_argument("--limit", type=int, default=0, help="не больше N новых слов")
    ap.add_argument("--dry", action="store_true", help="только посчитать, ничего не рендерить")
    a = ap.parse_args(argv)

    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = build_audio.load_json(MANIFEST, {})
    levels = all_words_by_level()
    want_levels = set(x.strip().upper() for x in a.levels.split(",") if x.strip())
    only = set(x.strip().lower() for x in a.only.split(",") if x.strip())

    seen, todo = set(), []
    for lvl, words in levels.items():
        if want_levels and lvl not in want_levels:
            continue
        for w in words:
            if (only and w not in only) or w in seen:
                continue
            seen.add(w)
            if w in manifest:           # запись уже есть (живая или синтез) — не трогаем
                continue
            todo.append(w)
    if a.limit:
        todo = todo[:a.limit]
    print("без записи: %d слов%s" % (len(todo), " (ограничено --limit)" if a.limit else ""))
    if a.dry or not todo:
        return 0

    engine = make_engine(a)
    stats = {"done": 0, "broken": 0, "orphan": 0}
    rejects = []
    tmpdir = tempfile.mkdtemp(prefix="synth-")
    wav = os.path.join(tmpdir, "w.wav")
    for n, w in enumerate(todo, 1):
        out_path = os.path.join(OUT_DIR, build_audio.safe_name(w) + ".mp3")
        if os.path.exists(out_path):
            stats["orphan"] += 1
        try:
            engine.synth(w, wav)
        except Exception as exc:  # noqa: BLE001 — одно слово не должно ронять прогон
            rejects.append("%s: synth %s" % (w, exc))
            stats["broken"] += 1
            continue
        err = build_audio.convert(wav, out_path)
        if err:
            rejects.append("%s: %s" % (w, err))
            stats["broken"] += 1
            try:
                os.unlink(out_path)   # битый файл не оставляем рядом с манифестом
            except OSError:
                pass
            continue
        manifest[w] = {
            "file": build_audio.safe_name(w) + ".mp3",
            "variant": "us" if a.voice_name.startswith("en_US") or a.engine == "kokoro" and a.voice.startswith("a") else "uk",
            "synthetic": True,
            "voice": a.voice_name,
            "author": a.author,
            "license": a.license,
            "license_url": a.license_url,
            "source": a.source,
        }
        stats["done"] += 1
        if n % 100 == 0:
            build_audio.save_json(MANIFEST, manifest)
            print("  %d/%d" % (n, len(todo)), flush=True)
    build_audio.save_json(MANIFEST, manifest)
    build_audio.write_word_audio_js(manifest)
    print("синтезировано: %d, битых: %d, перезаписано осиротевших: %d"
          % (stats["done"], stats["broken"], stats["orphan"]))
    if rejects:
        print("отклонено:")
        for r in rejects[:40]:
            print("  " + r)
    print("манифест и js/word-audio.js обновлены; пересобери credits: "
          "python3 tools/build_images.py --credits")
    return 0


if __name__ == "__main__":
    sys.exit(main())
