// Скриншоты стенда полоски статуса (tmp-call-strip.html) в ТОЧНОМ вьюпорте.
// CLI Chrome в headless=new не даёт окно уже 500 px, поэтому съёмка через
// puppeteer-core (без сохранения в package.json: npm i --no-save).
// Запуск: node tmp-call-strip-shots.js
const puppeteer = require("puppeteer-core");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "file://" + __dirname + "/tmp-call-strip.html";
const OUT = "/tmp/wordcat-call-strip/";

const SHOTS = [
  ["m390-day-ok", 390, 844, false, "?tier=ok&cam=off"],
  ["m390-night-student-bad", 390, 844, false, "?tier=bad&role=student&mic=off&theme=night"],
  ["m390-day-big", 390, 844, false, "?tier=good&big=1"],
  ["m390-night-big-screen", 390, 844, false, "?tier=bad&big=1&screen=on&theme=night"],
  ["d1440-day-good", 1440, 900, false, "?tier=good"],
  ["d1440-night-bad-screen", 1440, 900, false, "?tier=bad&mic=off&screen=on&theme=night"],
  ["d1440-day-big", 1440, 900, false, "?tier=ok&big=1"],
  ["m390-day-reduced-motion", 390, 844, true, "?tier=ok&screen=on"],
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-sandbox", "--hide-scrollbars"],
  });
  for (const [name, w, h, reduced, q] of SHOTS) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h });
    if (reduced) await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "reduce" }]);
    await page.goto(BASE + q, { waitUntil: "load" });
    await new Promise(r => setTimeout(r, 700));
    await page.screenshot({ path: OUT + name + ".png" });
    // Контроль DOM, а не только глаз: полоска видна, в ширину влезает
    const m = await page.evaluate(() => {
      const s = document.getElementById("call-strip");
      const r = s.getBoundingClientRect();
      const row = document.querySelector(".bd-call-row").getBoundingClientRect();
      return { w: innerWidth, stripHidden: s.hidden,
               stripLeft: Math.round(r.left), stripRight: Math.round(r.right),
               rowRight: Math.round(row.right) };
    });
    console.log(name, JSON.stringify(m));
    await page.close();
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
