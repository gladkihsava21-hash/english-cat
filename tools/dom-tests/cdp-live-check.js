// Живая проверка доски на проде через CDP: открываем доску ученика
// (магия-ссылка Марго), ловим ошибки консоли, жмём «Фигуры».
const http = require("http");

function j(path, method = "GET", body = null) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: "127.0.0.1", port: 9222, path, method,
      headers: data ? { "Content-Type": "application/json" } : {},
    }, r => {
      let b = "";
      r.on("data", c => b += c);
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    });
    req.on("error", rej);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const tab = await j("/json/new?" + encodeURIComponent("https://wordcat.ru/board.html?st=AzZEETGpmDPWp_awLCMjVDfpNuHv8yGU"), "PUT");
  const WebSocket = (await import("ws")).default;
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0;
  const pend = new Map();
  const send = (method, params = {}) => new Promise(res => {
    const i = ++id;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const errors = [];
  ws.on("message", m => {
    const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d.error); pend.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown")
      errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 300));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")
      errors.push(d.params.args.map(a => a.value || a.description).join(" ").slice(0, 300));
  });
  await new Promise(r => ws.on("open", r));
  await send("Runtime.enable");
  await send("Page.enable");
  await new Promise(r => setTimeout(r, 5000));   // ждём загрузку и бут

  const evl = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.value;

  console.log("role:", await evl("window.BD && BD.role"));
  console.log("boardId:", await evl("window.BD && BD.boardId"));
  console.log("objects:", await evl("window.BD && BD.objects.size"));
  console.log("bd-name:", await evl("document.getElementById('bd-name')?.textContent"));

  // клик по «Фигуры»
  await evl("document.getElementById('bd-shapes')?.click()");
  await new Promise(r => setTimeout(r, 300));
  console.log("меню видно:", await evl("!document.getElementById('bd-shapes-menu').hidden"));
  console.log("позиция меню:", await evl("JSON.stringify({left: document.getElementById('bd-shapes-menu').style.left, top: document.getElementById('bd-shapes-menu').style.top, pos: getComputedStyle(document.getElementById('bd-shapes-menu')).position})"));
  const rect = await evl("JSON.stringify(document.getElementById('bd-shapes-menu').getBoundingClientRect())");
  console.log("rect меню:", rect);
  // выбираем ромб
  await evl("document.querySelector('#bd-shapes-menu [data-shape=\"diamond\"]')?.click()");
  console.log("tool:", await evl("BD.tool"));

  console.log("\nОШИБКИ СТРАНИЦЫ:", errors.length ? errors.join("\n---\n") : "нет");
  ws.close();
  await j("/json/close/" + tab.id);
  process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
