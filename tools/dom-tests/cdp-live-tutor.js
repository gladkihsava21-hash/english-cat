const http = require("http");
function j(path, method = "GET", body = null) {
  return new Promise((res, rej) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ host: "127.0.0.1", port: 9222, path, method,
      headers: data ? { "Content-Type": "application/json" } : {} }, r => {
      let b = ""; r.on("data", c => b += c);
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { res(b); } });
    });
    req.on("error", rej); if (data) req.write(data); req.end();
  });
}
(async () => {
  const tab = await j("/json/new?" + encodeURIComponent("https://wordcat.ru/board.html?id=33"), "PUT");
  const WebSocket = (await import("ws")).default;
  const ws = new WebSocket(tab.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = new Map();
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const errors = [];
  ws.on("message", m => { const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d.result || d.error); pend.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(JSON.stringify(d.params.exceptionDetails).slice(0, 400));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error")
      errors.push(d.params.args.map(a => a.value || a.description).join(" ").slice(0, 400));
  });
  await new Promise(r => ws.on("open", r));
  await send("Runtime.enable");
  // токен репетитора в localStorage ДО загрузки скриптов
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem("savelyTutorToken", "xtIzKOFg9X1xH3zkv04UwasfgDePUgv1")` });
  await send("Page.navigate", { url: "https://wordcat.ru/board.html?id=33" });
  await new Promise(r => setTimeout(r, 6000));
  const evl = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.value;
  console.log("bd-name:", await evl("document.getElementById('bd-name')?.textContent"));
  console.log("кнопка Фигуры:", await evl("!!document.getElementById('bd-shapes')"));
  await evl("document.getElementById('bd-shapes')?.click()");
  await new Promise(r => setTimeout(r, 300));
  console.log("меню видно:", await evl("!document.getElementById('bd-shapes-menu').hidden"));
  console.log("rect:", await evl("JSON.stringify(document.getElementById('bd-shapes-menu').getBoundingClientRect())"));
  console.log("ОШИБКИ:", errors.length ? errors.join("\n---\n") : "нет");
  ws.close(); await j("/json/close/" + tab.id); process.exit(0);
})().catch(e => { console.error("FAIL", e); process.exit(1); });
