// Service worker: сайт открывается и работает без интернета.
// Ученик может тренироваться в метро — прогресс уйдёт на сервер,
// когда связь вернётся.

// ВАЖНО: две строчки ниже — CACHE и ASSETS — руками НЕ ПРАВИТЬ, их пишет
// tools/bump.py, он же поднимает ?v= в трёх html. Остальное (обработчики
// install/activate/fetch) он не трогает — правится обычным образом.
// Пока версию правили руками,
// sw отставал: в страницах стояло v=90, здесь v=17, а в списке половины
// существующих файлов не было и были давно удалённые. Онлайн это
// не било (ниже «сначала сеть»), но офлайн ученик получал код
// позапрошлой версии.
//
// Список собирается из самих страниц, поэтому новый css или js попадает
// в офлайн-кэш сам — про него не нужно помнить отдельно.
const CACHE = "savely-v246";
const ASSETS = [
  "./",
  "./index.html",
  "./css/fonts/nunito-cyrillic.woff2",
  "./css/fonts/inter-cyrillic.woff2",
  "./css/fonts.css",
  "./css/tokens.css",
  "./css/style.css",
  "./css/savely.css",
  "./css/motion.css",
  "./css/a11y.css",
  "./css/games.css",
  "./css/cat.css",
  "./css/account.css",
  "./js/theme.js",
  "./js/i18n.js",
  "./js/icons.js",
  "./js/cat.js",
  "./js/motion.js",
  "./js/util.js",
  "./js/levels.js",
  "./js/srs.js",
  "./js/images.js",
  "./js/word-photos.js",
  "./js/app.js",
  "./js/achievements.js",
  "./js/exercises.js",
  "./js/games.js",
  "./js/voice.js",
  "./js/sync.js",
  "./js/reading.js",
  "./js/photo.js",
  "./js/account.js",
  "./css/tutor.css",
  "./js/qr.js",
  "./js/tutor.js",
  "./js/tutor-tasks.js",
  "./js/tutor-photos.js",
  "./js/tutor-auth.js",
  "./js/tutor-verify.js",
  "./js/tutor-boards.js",
  "./js/tutor-nav.js",
  "./css/admin.css",
  "./js/admin.js",
  "./css/board.css",
  "./js/board.js",
  "./js/call.js",
  "./js/words.js",
  "./js/phrases.js",
  "./js/wordform.js",
  "./js/grammar.js",
  "./js/ipa.js",
  "./js/grammarcheck.js",
  "./js/leveltest.js",
  "./manifest.json",
  "./icon-192.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      // отдельные промахи не должны срывать всю установку
      .then(c => Promise.allSettled(ASSETS.map(a => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Последний рубеж: сети нет и в кэше нет даже страницы. Свой ответ
 *  вместо служебной страницы браузера — чтобы ученик понял, что дело
 *  в связи, а не в том, что сайт сломался или его выгнали из аккаунта. */
function OFFLINE_PAGE() {
  return new Response(
    '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Нет связи — Савелий</title>'
    + '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;'
    + 'font:16px/1.5 system-ui,sans-serif;background:#F7F5EF;color:#2A2E2B;padding:24px}'
    + 'div{max-width:22rem;text-align:center}h1{font-size:1.25rem;margin:0 0 .5rem}'
    + 'p{margin:0;color:#5C635E}</style>'
    + '<div><h1>Савелий не дозвонился до интернета</h1>'
    + '<p>Связь пропала. Как только сеть вернётся, обнови страницу — '
    + 'весь прогресс на месте.</p></div>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // запросы к API никогда не кэшируем: прогресс и домашка должны быть свежими
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;
  // Видео не трогаем вовсе. Браузер тянет его кусками (Range → ответ 206),
  // а класть частичный ответ в кэш нельзя: Cache.put на 206 падает, и уже
  // из кэша видео отдавалось бы обрезанным. Пусть идёт напрямую в сеть —
  // офлайн-ролик никому не нужен, а сломанное воспроизведение заметят все.
  if (url.pathname.startsWith("/video/")) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // свежая копия отправляется в кэш на случай следующего офлайна
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        // ignoreSearch обязателен. Страницы просят «js/app.js?v=107»,
        // а предзагрузка кладёт «js/app.js» — без версии, чтобы копия
        // была одна. Без этого флага совпадений не было НИ РАЗУ: каждый
        // офлайн-запрос уходил в запасной вариант ниже.
        caches.match(e.request, { ignoreSearch: true }).then(hit => {
          if (hit) return hit;
          // Запасная страница — только на переход по адресу. Отдавать
          // разметку в ответ на запрос скрипта значит сломать сайт
          // целиком: браузер получает «<» вместо кода и падает с
          // SyntaxError на каждом файле, а страница остаётся пустой.
          // Ровно это и происходило, пока обе строчки были одной.
          if (e.request.mode === "navigate") {
            // caches.match может вернуть undefined — например, если первая
            // же загрузка сайта случилась без сети и класть в кэш было
            // нечего. respondWith(undefined) роняет обработчик, и ученик
            // видит служебную страницу браузера «сайт недоступен».
            return caches.match("./index.html").then(page => page || OFFLINE_PAGE());
          }
          return new Response("", { status: 504, statusText: "Offline" });
        })
      )
  );
});
