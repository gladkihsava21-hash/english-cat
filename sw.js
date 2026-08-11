// Service worker: сайт открывается и работает без интернета.
// Ученик может тренироваться в метро — прогресс уйдёт на сервер,
// когда связь вернётся.

// ВАЖНО: версия должна совпадать с ?v= в index.html, иначе ученик
// после обновления сайта получит из кэша старый код.
const CACHE = "savely-v14";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css?v=14",
  "./js/util.js?v=14",
  "./js/words.js?v=14",
  "./js/srs.js?v=14",
  "./js/images.js?v=14",
  "./js/app.js?v=14",
  "./js/achievements.js?v=14",
  "./js/exercises.js?v=14",
  "./js/voice.js?v=14",
  "./js/sync.js?v=14",
  "./js/photo.js?v=14",
  "./js/reading.js?v=14",
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
