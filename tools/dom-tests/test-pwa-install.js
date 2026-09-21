// Карточка «Установить приложение» и согласованность ярлыков PWA.
// pwa-install.js ни от чего не зависит, кроме icons.js (iconInline) —
// грузим только их, без app.js.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const ROOT = path.resolve(__dirname, "..", "..");

const dom = new JSDOM("<!doctype html><body></body>", {
  runScripts: "dangerously", pretendToBeVisual: true, url: "http://localhost/" });
const w = dom.window;
w.matchMedia = q => ({ matches: false, media: q, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
w.scrollTo = () => {};

const load = f => {
  const s = w.document.createElement("script");
  s.textContent = fs.readFileSync(path.join(ROOT, f), "utf8");
  w.document.head.appendChild(s);
};
load("js/icons.js");
load("js/pwa-install.js");

let fails = 0;
function ok(cond, name) {
  if (cond) console.log("✓ " + name);
  else { console.log("✗ " + name); fails++; }
}

// 1. Карточка существует и по умолчанию скрыта (нет события установки).
w.document.body.innerHTML = w.eval("acInstallCard()");
const card = () => w.document.getElementById("ac-install-card");
ok(card() && card().hidden, "карточка создана скрытой");
w.eval("pwaInstallRefresh()");
ok(card().hidden, "без beforeinstallprompt остаётся скрытой");

// 2. Браузер дал событие — карточка видна.
let prompted = false;
const ev = new w.Event("beforeinstallprompt", { cancelable: true });
ev.prompt = () => { prompted = true; return Promise.resolve(); };
w.dispatchEvent(ev);
ok(!card().hidden, "после beforeinstallprompt карточка видна");

// 3. Клик зовёт системный диалог, событие одноразовое — карточка прячется.
w.eval("wireInstallCard()");
w.document.getElementById("ac-install-btn").click();
ok(prompted, "клик вызвал системный prompt()");
setTimeout(() => {
  ok(card().hidden, "после вызова карточка скрыта (событие потрачено)");

  // 4. Уже установленное приложение (standalone) — карточка не нужна.
  w.matchMedia = q => ({ matches: q.includes("standalone"), media: q,
    addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
  const ev2 = new w.Event("beforeinstallprompt", { cancelable: true });
  ev2.prompt = () => Promise.resolve();
  w.dispatchEvent(ev2);
  ok(card().hidden, "в standalone-режиме карточки нет");

  // 5. Ярлыки манифеста ведут на реальные маршруты: сверяем с
  // HASH_SCREENS в app.js (иначе ярлык врёт уже в момент нажатия).
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const m = app.match(/HASH_SCREENS = \{([^}]+)\}/);
  const known = m ? [...m[1].matchAll(/(\w+):/g)].map(x => x[1]) : [];
  let allKnown = true;
  for (const sc of manifest.shortcuts || []) {
    const hash = (sc.url.match(/#(\w+)/) || [])[1];
    if (!hash || !known.includes(hash)) { allKnown = false; console.log("  ✗ ярлык ведёт мимо:", sc.url); }
  }
  ok(allKnown && (manifest.shortcuts || []).length > 0, "ярлыки манифеста ведут на существующие экраны");
  ok(manifest.id && manifest.categories && manifest.lang === "ru", "манифест: id, categories, lang");

  console.log(fails ? `ПРОВАЛЕНО: ${fails}` : "pwa-установка: карточка, событие и ярлыки согласованы");
  process.exit(fails ? 1 : 0);
}, 50);
