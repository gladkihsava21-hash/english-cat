#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Доска, серверная сторона: фон — только репетитору, лазер — второй стороне.

1. Ученик не может сменить фон доски (bg): клиент кнопку прячет, а здесь
   защита от прямой отправки в обход интерфейса (db.board_sync).
2. Лазерная указка: эфемерная точка вне объектов доски — автору не
   возвращается (свою он видит локально), второй стороне отдаётся пара
   секунд, по выключению гаснет.

Запуск: python3 tools/dom-tests/test-board-sync.py
"""
import os, sys, tempfile, time
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, ROOT)
os.environ["SAVELY_DB"] = os.path.join(tempfile.mkdtemp(), "s.db")
import db
db.init()

fails = 0
def ok(c, what):
    global fails
    print(("  ok  " if c else "  FAIL ") + what)
    if not c: fails += 1

t = db.create_tutor("Т", "t@e.com", "startpass123")
db.conn().execute("UPDATE tutors SET email_verified=1 WHERE id=?", (t["id"],))
stu = db.create_student(t["id"], "Ира")
db.conn().commit()
b = db.create_board(t["id"], "Урок")
bid, T, S = b["id"], "t" + str(t["id"]), "s" + str(stu["id"])

def bg(changes, author):
    return db.board_sync(bid, changes, [], 0, author)

print("\n1. Фон меняет только репетитор")
r = bg([{"id": "board-bg", "kind": "bg", "x": 0, "y": 0, "w": 0, "h": 0,
         "color": "ink", "size": 3, "text": "grid"}], T)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("board-bg", {}).get("text") == "grid", "репетитор поставил клетку")
# ученик пытается переключить фон в обход интерфейса
rev_before = r["rev"]
r = bg([{"id": "board-bg", "kind": "bg", "x": 0, "y": 0, "w": 0, "h": 0,
         "color": "ink", "size": 3, "text": "clean"}], S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("board-bg", {}).get("text") == "grid" and r["rev"] == rev_before,
   "смена фона от ученика отклонена (объект не перезаписан, rev не вырос)")
# а репетиторская смена на месте
row = db.get_board(bid)
import json
data = json.loads(row["data"])
ok(data.get("board-bg", {}).get("text") == "grid", "в базе осталась репетиторская клетка")

print("\n2. Лазер: автору не возвращается, второй стороне — пара секунд")
r = db.board_sync(bid, [], [], 0, T, laser={"x": 100.5, "y": -20})
ok("laser" not in r, "автору его точка не возвращается (своя рисуется локально)")
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("laser") and abs(r["laser"]["x"] - 100.5) < 0.01 and r["laser"]["y"] == -20,
   "ученик получил точку учителя: %s" % r.get("laser"))
ok(r["laser"]["by"] == T, "видно, чья точка: " + r["laser"]["by"])
# выключение лазера: следующий опрос с laser=None гасит точку
db.board_sync(bid, [], [], 0, T, laser=None)
r = db.board_sync(bid, [], [], 0, S)
ok("laser" not in r, "после выключения точка погашена")
# а опрос второй стороны с laser=None чужую точку НЕ гасит:
# клиент шлёт None в каждом опросе, пока сам не водит лазером
db.board_sync(bid, [], [], 0, T, laser={"x": 7, "y": 8})
db.board_sync(bid, [], [], 0, S)          # ученик просто опрашивает
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("laser") and r["laser"]["x"] == 7,
   "опрос второй стороны чужую точку не гасит: %s" % r.get("laser"))
# старая точка (будто прошло 5 секунд) не отдаётся
db.board_sync(bid, [], [], 0, T, laser={"x": 1, "y": 2})
db.conn().execute("UPDATE boards SET laser_at=? WHERE id=?", (int(time.time()) - 5, bid))
db.conn().commit()
r = db.board_sync(bid, [], [], 0, S)
ok("laser" not in r, "протухшая точка (5 с) не отдаётся")

print("\n3. «Покажи мой вид»: команда репетитора доезжает до ученика")
r = db.board_sync(bid, [], [], 0, T, follow={"x": 300, "y": -50, "k": 1.5})
ok("follow" not in r, "репетитору его команда не возвращается")
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("follow") and r["follow"]["x"] == 300 and r["follow"]["k"] == 1.5,
   "ученик получил вид репетитора: %s" % r.get("follow"))
# ученик команду слать не может
db.board_sync(bid, [], [], 0, S, follow={"x": 0, "y": 0, "k": 1})
r = db.board_sync(bid, [], [], 0, S)
ok(r["follow"]["x"] == 300, "команда ученика отклонена (осталась репетиторская)")
# повторная команда обновляет
db.board_sync(bid, [], [], 0, T, follow={"x": 10, "y": 20, "k": 2})
r = db.board_sync(bid, [], [], 0, S)
ok(r["follow"]["x"] == 10, "повторное нажатие обновило команду")
# протухшая (>10 с) не отдаётся
db.conn().execute("UPDATE boards SET follow_at=? WHERE id=?", (int(time.time()) - 12, bid))
db.conn().commit()
r = db.board_sync(bid, [], [], 0, S)
ok("follow" not in r, "команда старше 10 с не отдаётся")

print("\n4. Таймер: ставит репетитор, видят оба; пауза и сброс синкаются")
until = time.time() + 180
r = db.board_sync(bid, [], [], 0, T, timer={"until": until})
ok(r.get("timer") and abs(r["timer"]["until"] - until) < 0.01,
   "репетитор тоже видит таймер (новый заход)")
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("timer") and r["timer"]["by"] == T, "ученик видит таймер репетитора")
# ученик ставить не может
db.board_sync(bid, [], [], 0, S, timer={"until": time.time() + 5})
r = db.board_sync(bid, [], [], 0, S)
ok(abs(r["timer"]["until"] - until) < 0.01, "таймер ученика отклонён")
# пауза и продолжить
db.board_sync(bid, [], [], 0, T, timer={"pausedLeft": 95})
r = db.board_sync(bid, [], [], 0, S)
ok(r["timer"]["pausedLeft"] == 95 and r["timer"]["until"] == 0, "пауза синкается: %s" % r["timer"])
db.board_sync(bid, [], [], 0, T, timer={"until": time.time() + 95})
r = db.board_sync(bid, [], [], 0, S)
ok(r["timer"]["pausedLeft"] == 0 and r["timer"]["until"] > time.time(), "дальше после паузы")
# сброс
db.board_sync(bid, [], [], 0, T, timer=None)
r = db.board_sync(bid, [], [], 0, S)
ok("timer" not in r, "после сброса таймера поля нет")

print("\n5. Замок: ученик залоченное не меняет, не стирает, замок не трогает")
obj = {"id": "note-1", "kind": "note", "x": 10, "y": 10, "w": 180, "h": 120,
       "color": "note", "size": 3, "text": "стикер"}
db.board_sync(bid, [obj], [], 0, T)
# репетитор лочит
db.board_sync(bid, [dict(obj, locked=1)], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs["note-1"]["locked"] == 1, "замок доехал до ученика")
# ученик двигает
db.board_sync(bid, [dict(obj, x=99, locked=0)], [], 0, S)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs["note-1"]["x"] == 10 and objs["note-1"]["locked"] == 1,
   "сдвиг залоченного от ученика отклонён (и снятие замка заодно)")
# ученик стирает
db.board_sync(bid, [], ["note-1"], 0, S)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok("note-1" in objs, "удаление залоченного от ученика отклонено")
# ученик пытается залочить СВОЙ объект
db.board_sync(bid, [dict(obj, id="note-2", text="ученический", locked=1)], [], 0, S)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("note-2", {}).get("locked", 0) == 0,
   "постановка замка учеником отклонена: %s" % objs.get("note-2", {}).get("locked"))
# репетитор отпирает — ученик снова может двигать
db.board_sync(bid, [dict(obj, locked=0)], [], 0, T)
db.board_sync(bid, [dict(obj, x=55, locked=0)], [], 0, S)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs["note-1"]["x"] == 55, "после отпирания репетитором ученик двигает")

print("\n6. Реакция-эмодзи: слать могут оба, гаснет через ~5 с")
r = db.board_sync(bid, [], [], 0, T, react={"emoji": "🔥", "x": 50, "y": 60})
ok("react" not in r, "автору его реакция не возвращается")
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("react") and r["react"]["emoji"] == "🔥" and r["react"]["by"] == T,
   "ученик видит реакцию учителя: %s" % r.get("react"))
r = db.board_sync(bid, [], [], 0, S, react={"emoji": "🐱", "x": 1, "y": 2})
ok("react" not in r, "ученику его реакция не возвращается")
r = db.board_sync(bid, [], [], 0, T)
ok(r.get("react") and r["react"]["emoji"] == "🐱", "учитель видит реакцию ученика")
db.conn().execute("UPDATE boards SET react_at=? WHERE id=?", (int(time.time()) - 6, bid))
db.conn().commit()
r = db.board_sync(bid, [], [], 0, T)
ok("react" not in r, "протухшая реакция (6 с) не отдаётся")

print("\n7. Фрейм: kind и заголовок доезжают до второй стороны")
fr = {"id": "frame-1", "kind": "frame", "x": 100, "y": 100, "w": 400, "h": 300,
      "color": "note", "size": 3, "title": "Грамматика"}
db.board_sync(bid, [fr], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("frame-1", {}).get("kind") == "frame",
   "фрейм прошёл чистильщик и доехал до ученика")
ok(objs["frame-1"]["title"] == "Грамматика",
   "заголовок фрейма доехал: %s" % objs["frame-1"].get("title"))
# переименование — тоже синкается
db.board_sync(bid, [dict(fr, title="Чтение")], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs["frame-1"]["title"] == "Чтение",
   "переименование доехало: %s" % objs["frame-1"].get("title"))
# в базе заголовок тоже, а не только в ответе опроса
row = db.get_board(bid)
data = json.loads(row["data"])
ok(data.get("frame-1", {}).get("title") == "Чтение", "в базе лежит новый заголовок")
# залоченный репетитором фрейм ученик не двигает (общая защита замка)
db.board_sync(bid, [dict(fr, title="Чтение", locked=1)], [], 0, T)
db.board_sync(bid, [dict(fr, title="Чтение", x=999)], [], 0, S)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs["frame-1"]["x"] == 100, "сдвиг залоченного фрейма учеником отклонён")

print("\n8. Лазерный след: серия точек доезжает второй стороне, гашение сразу")
trail = {"pts": [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0]]}
db.board_sync(bid, [], [], 0, T, laser=trail)
r = db.board_sync(bid, [], [], 0, T)
ok("laser" not in r, "автору его след не возвращается")
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("laser") and r["laser"].get("pts") == [[10.0, 20.0], [30.0, 40.0], [50.0, 60.0]],
   "ученик получил серию точек: %s" % (r.get("laser") or {}).get("pts"))
ok(r["laser"]["x"] == 50.0 and r["laser"]["y"] == 60.0,
   "одиночная точка — голова следа (совместимость)")
# старый формат {x,y} тоже принимается
db.board_sync(bid, [], [], 0, T, laser={"x": 7, "y": 8})
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("laser") and r["laser"].get("pts") == [[7.0, 8.0]],
   "старый формат {x,y} заворачивается в серию из одной точки")
# гашение: смена инструмента убирает след сразу
db.board_sync(bid, [], [], 0, T, laser=None)
r = db.board_sync(bid, [], [], 0, S)
ok("laser" not in r, "после гашения поля нет")
# мусор в точках отбрасывается, валидное доезжает; точка с хвостом —
# не мусор: первые два числа и есть координаты (запас на будущее [x,y,t])
db.board_sync(bid, [], [], 0, T, laser={"pts": [["a", 1], [1, 2, 3, 4], [5.0, 6.0], None]})
r = db.board_sync(bid, [], [], 0, S)
ok(r.get("laser") and r["laser"].get("pts") == [[1.0, 2.0], [5.0, 6.0]],
   "мусорные точки отброшены: %s" % (r.get("laser") or {}).get("pts"))
db.board_sync(bid, [], [], 0, T, laser=None)

print("\n9. Эмодзи-объект: символ доезжает; пустые note/text сервер не хранит")
em = {"id": "emoji-1", "kind": "emoji", "x": 100, "y": 100, "w": 58, "h": 58,
      "color": "ink", "size": 8, "text": "🐱"}
db.board_sync(bid, [em], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("emoji-1", {}).get("text") == "🐱",
   "эмодзи-объект доехал до ученика с символом: %s" % objs.get("emoji-1", {}).get("text"))
# пустые тексты сервер не принимает
db.board_sync(bid, [{"id": "note-empty", "kind": "note", "x": 0, "y": 0, "w": 180,
                     "h": 120, "color": "note", "size": 3, "text": "  "}], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
ok("note-empty" not in {o["id"] for o in r["objects"]},
   "пустой стикер сервер не сохранил")
# живое создание не ломается: тот же id возвращается с текстом
db.board_sync(bid, [{"id": "note-empty", "kind": "note", "x": 0, "y": 0, "w": 180,
                     "h": 120, "color": "note", "size": 3, "text": "написал!"}], [], 0, T)
r = db.board_sync(bid, [], [], 0, S)
objs = {o["id"]: o for o in r["objects"]}
ok(objs.get("note-empty", {}).get("text") == "написал!",
   "тот же объект с текстом принят: %s" % objs.get("note-empty", {}).get("text"))
db.board_sync(bid, [], ["note-empty", "emoji-1"], 0, T)

print("\n" + ("ПРОВАЛЕНО: %d" % fails if fails else "всё держится"))
sys.exit(1 if fails else 0)
