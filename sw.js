// Service worker: сайт открывается и работает без интернета.
// Ученик может тренироваться в метро — прогресс уйдёт на сервер,
// когда связь вернётся.

// ВАЖНО: этот файл НЕ ПРАВИТЬ РУКАМИ — версию и список файлов пишет
// tools/bump.py, он же поднимает ?v= в трёх html. Пока правили руками,
// sw отставал: в страницах стояло v=90, здесь v=17, а в списке половины
// существующих файлов не было и были давно удалённые. Онлайн это
// не било (ниже «сначала сеть»), но офлайн ученик получал код
// позапрошлой версии.
//
// Список собирается из самих страниц, поэтому новый css или js попадает
// в офлайн-кэш сам — про него не нужно помнить отдельно.
const CACHE = "savely-v98";
const ASSETS = [
  "./",
  "./index.html",
  "./css/tokens.css",
  "./css/style.css",
  "./css/savely.css",
  "./css/motion.css",
  "./css/a11y.css",
  "./css/cat.css",
  "./css/account.css",
  "./js/theme.js",
  "./js/icons.js",
  "./js/cat.js",
  "./js/motion.js",
  "./js/util.js",
  "./js/words.js",
  "./js/phrases.js",
  "./js/srs.js",
  "./js/images.js",
  "./js/word-photos.js",
  "./js/app.js",
  "./js/achievements.js",
  "./js/exercises.js",
  "./js/voice.js",
  "./js/sync.js",
  "./js/reading.js",
  "./js/photo.js",
  "./js/account.js",
  "./css/tutor.css",
  "./js/tutor.js",
  "./js/tutor-photos.js",
  "./js/tutor-auth.js",
  "./js/tutor-verify.js",
  "./css/admin.css",
  "./js/admin.js",
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

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  // запросы к API никогда не кэшируем: прогресс и домашка должны быть свежими
  if (url.pathname.startsWith("/api/") || e.request.method !== "GET") return;

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
      .catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html")))
  );
});
