#!/usr/bin/env python3
"""Проверка генератора QR (js/qr.js) — настоящим чтением, а не на глаз.

Свой генератор без библиотек стоит доверия ровно до первой проверки:
кривой QR выглядит совершенно нормально и не читается только телефоном
ученика. Поэтому здесь два независимых контроля:

  1. Матрица рисуется в PNG и читается обратно детектором OpenCV —
     если декодер вернул исходный текст, код настоящий.
  2. Версия сверяется с независимым генератором OpenCV: разойдись у нас
     таблицы ёмкости, номер версии тут же разъедется.
  3. Рабочие уровни (Q и H) проверяются пятном: часть кода закрашивается,
     и он обязан прочитаться всё равно — ради этого коррекция и нужна.

Запуск: python3 tools/check-qr.py
"""
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QR_JS = os.path.join(ROOT, "js", "qr.js")

# Что проверяем: короткие и длинные ссылки, кириллица, разные уровни.
CASES = [
    ("https://wordcat.ru/", "M"),
    ("https://wordcat.ru/?join=WZTZ7Q", "M"),
    ("https://wordcat.ru/?join=WZTZ7Q", "Q"),
    ("https://wordcat.ru/?join=ABCD12", "H"),
    ("Савелий — кот-репетитор английского", "M"),
    ("https://wordcat.ru/?join=LONGCODE1234567890&utm_source=print", "Q"),
]


def matrix(text, level):
    """Матрица из JS-генератора: запускаем node и забираем JSON."""
    src = open(QR_JS, encoding="utf-8").read()
    js = src + f"""
const m = qrMatrix({json.dumps(text)}, {{ level: {json.dumps(level)} }});
console.log(JSON.stringify(m.map(r => r.map(v => v ? 1 : 0))));
"""
    out = subprocess.run(["node", "-e", js], capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"node не смог построить QR для {text!r}: {out.stderr[-600:]}")
    return json.loads(out.stdout)


def to_png(mat, path, scale=8, quiet=4):
    from PIL import Image
    n = len(mat)
    size = (n + quiet * 2) * scale
    img = Image.new("L", (size, size), 255)
    px = img.load()
    for r in range(n):
        for c in range(n):
            if not mat[r][c]:
                continue
            for dy in range(scale):
                for dx in range(scale):
                    px[(c + quiet) * scale + dx, (r + quiet) * scale + dy] = 0
    img.save(path)
    return path


def decode(path):
    import cv2
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    det = cv2.QRCodeDetector()
    text, points, _ = det.detectAndDecode(img)
    return text


def check_against_opencv(text, level):
    """Сверка с независимым генератором OpenCV: версия должна совпасть.

    Раньше здесь стоял «эталонный» набор кодовых слов, выписанный по памяти,
    и он оказался неверным — тест ругался на исправный код. Независимая
    реализация рядом надёжнее любой памяти."""
    import cv2
    mat = matrix(text, level)
    my_version = (len(mat) - 17) // 4
    params = cv2.QRCodeEncoder_Params()
    params.correction_level = {
        "L": cv2.QRCodeEncoder_CORRECT_LEVEL_L, "M": cv2.QRCodeEncoder_CORRECT_LEVEL_M,
        "Q": cv2.QRCodeEncoder_CORRECT_LEVEL_Q, "H": cv2.QRCodeEncoder_CORRECT_LEVEL_H,
    }[level]
    ref = cv2.QRCodeEncoder_create(params).encode(text)
    # у cv2 по краям поле в 2 модуля
    ref_version = (ref.shape[0] - 4 - 17) // 4
    return my_version, ref_version


def check_damage(mat, text):
    """Проверка коррекции ошибок: закрашиваем кусок кода и требуем,
    чтобы он всё равно прочитался. Ради этого коррекция и нужна —
    распечатку заляпают пальцем или согнут."""
    import cv2
    from PIL import Image, ImageDraw
    path = to_png(mat, os.path.join(ROOT, "tools", "out", "qr-damage.png"))
    img = Image.open(path)
    n = len(mat)
    d = ImageDraw.Draw(img)
    # пятно примерно в 7% площади, подальше от «прицелов»
    side = int(n * 0.26) * 8
    x = int(n * 0.42) * 8
    d.rectangle([x, x, x + side, x + side], fill=255)
    img.save(path)
    return decode(path) == text


def main():
    # Проверка держится на opencv и PIL. Их может не быть на другой машине —
    # тогда молча пропускаем: это тест, а не условие работы сайта.
    try:
        import cv2  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        print("  opencv/PIL не установлены — проверка QR пропущена")
        return

    tmp = os.path.join(ROOT, "tools", "out")
    os.makedirs(tmp, exist_ok=True)
    ok = True

    for text, level in CASES:
        mat = matrix(text, level)
        path = to_png(mat, os.path.join(tmp, "qr-check.png"))
        back = decode(path)
        my_v, ref_v = check_against_opencv(text, level)
        note = ""
        if back != text:
            ok = False
            note = f"  НЕ ЧИТАЕТСЯ (декодер вернул {back!r})"
        elif my_v != ref_v:
            ok = False
            note = f"  версия разошлась с OpenCV: у меня {my_v}, у него {ref_v}"
        elif level in ("Q", "H") and not check_damage(mat, text):
            # Пятно спрашиваем только с уровней, которыми пользуемся на сайте.
            # У L и M запас коррекции 7 и 15 процентов — на мелкой сетке
            # такое пятно для них честно за пределом возможностей.
            ok = False
            note = "  не пережил пятно — коррекция ошибок не работает"
        print(f"  v{my_v} {level} · {text[:44]}{note}")

    if not ok:
        sys.exit("\nQR не в порядке — телефоны его читать не будут.")
    print("\nВсе коды читаются, версии сходятся с OpenCV, пятно переживают.")


if __name__ == "__main__":
    main()
