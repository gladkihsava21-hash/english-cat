// Савелий — приложение для macOS.
//
// Тонкая оболочка над сайтом wordcat.ru: окно + WKWebView (родной движок
// Safari, ничего ставить не нужно). Весь продукт — сайт: его service
// worker и офлайн-кэш работают и здесь, обновляется приложение само.
// Здесь только рамка: портретное окно с памятью размера, заголовок из
// страницы, внешние ссылки — в браузер, камера и микрофон — для
// видеоуроков, при обрыве сети — честная заставка с «повторить»,
// а не мёртвая страница с ошибкой движка.
//
// Сборка: build.sh (системный swiftc, Xcode не нужен).

import Cocoa
import WebKit

let HOME_URL = URL(string: "https://wordcat.ru/")!

final class MainWindowController: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var web: WKWebView!

    func start() {
        let config = WKWebViewConfiguration()
        config.preferences.isElementFullscreenEnabled = true

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.setValue(false, forKey: "drawsBackground")   // до первого кадра — не белая вспышка

        // Портретная рамка, как у телефона: manifest сайта portrait,
        // интерфейс рассчитан на это. Размер и положение запоминаем —
        // открыл завтра, а оно там, где оставил.
        let rect = NSRect(x: 0, y: 0, width: 460, height: 900)
        window = NSWindow(contentRect: rect,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Савелий — кот-репетитор английского"
        window.minSize = NSSize(width: 380, height: 640)
        window.contentView = web
        window.delegate = self
        window.setFrameAutosaveName("SavelyMainWindow")
        if !window.setFrameUsingName("SavelyMainWindow") { window.center() }
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        web.load(URLRequest(url: HOME_URL))
    }

    // Заголовок окна — из заголовка страницы.
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let t = webView.title ?? ""
        if !t.isEmpty { window.title = t }
    }

    // Внешние ссылки (документы, источники фото) — в настоящий браузер:
    // приложение про занятия. Свой сайт — внутри.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = navigationAction.request.url
        let isOurs = url?.host == HOME_URL.host
        if navigationAction.targetFrame == nil, let url = url, !isOurs {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // Обрыв сети до первой загрузки (или после чистки кэша): страница
    // ошибки движка пугает детей. Своя заставка с кнопкой «повторить» —
    // дальше сайт сам умеет офлайн через service worker.
    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        let html = """
        <!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
        <body style="font-family:-apple-system;background:#F6F5F0;color:#2B3630;
                     display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center">
        <div><div style="font-size:46px">🐾</div>
        <h2>Савелий не дозвонился до сайта</h2>
        <p style="color:#5A665E">Проверь интернет — кот уже мурчит и ждёт.</p>
        <button onclick="location.reload()"
          style="font-size:17px;padding:12px 28px;border-radius:999px;border:1px solid #53945F;
                 background:#65D97A;color:#12341A;font-weight:700">Повторить</button></div>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }

    // Камера/микрофон для видеоурока: разрешение за нас спросит система,
    // а наше «да» относится только к нашему сайту.
    @available(macOS 12.0, *)
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host == "wordcat.ru" ? .grant : .deny)
    }

    // Меню «Вид» — через этот контроллер, чтобы горячие клавиши имели
    // понятное место. Масштаб — свой у web-страницы, не окна.
    @objc func reloadPage() { web.reload() }
    @objc func goBack() { if web.canGoBack { web.goBack() } }
    @objc func goForward() { if web.canGoForward { web.goForward() } }
    @objc func zoomIn() { web.pageZoom = min(2.0, web.pageZoom + 0.1) }
    @objc func zoomOut() { web.pageZoom = max(0.5, web.pageZoom - 0.1) }
    @objc func zoomReset() { web.pageZoom = 1.0 }

    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let controller = MainWindowController()

// Меню по минимуму: правка/копировать-вставить без них не работают в формах,
// вид — перезагрузка и масштаб (страница внутри — всё ещё сайт).
let mainMenu = NSMenu()
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Завершить Савелия", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
mainMenu.addItem(withSubmenuTitle: "Савелий", menu: appMenu)
let editMenu = NSMenu(title: "Правка")
editMenu.addItem(withTitle: "Вырезать", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
editMenu.addItem(withTitle: "Копировать", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
editMenu.addItem(withTitle: "Вставить", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
editMenu.addItem(withTitle: "Выбрать всё", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
mainMenu.addItem(withSubmenuTitle: "Правка", menu: editMenu)
let viewMenu = NSMenu(title: "Вид")
viewMenu.addItem(withTitle: "Обновить", action: #selector(MainWindowController.reloadPage), keyEquivalent: "r")
viewMenu.addItem(withTitle: "Назад", action: #selector(MainWindowController.goBack), keyEquivalent: "[")
viewMenu.addItem(withTitle: "Вперёд", action: #selector(MainWindowController.goForward), keyEquivalent: "]")
viewMenu.addItem(NSMenuItem.separator())
viewMenu.addItem(withTitle: "Увеличить", action: #selector(MainWindowController.zoomIn), keyEquivalent: "+")
viewMenu.addItem(withTitle: "Уменьшить", action: #selector(MainWindowController.zoomOut), keyEquivalent: "-")
viewMenu.addItem(withTitle: "Обычный размер", action: #selector(MainWindowController.zoomReset), keyEquivalent: "0")
mainMenu.addItem(withSubmenuTitle: "Вид", menu: viewMenu)
app.mainMenu = mainMenu

controller.start()
app.run()

// Подменю в одну строку, чтобы меню читалось как список, а не обвязка.
extension NSMenu {
    func addItem(withSubmenuTitle title: String, menu: NSMenu) {
        let item = NSMenuItem()
        item.title = title
        item.submenu = menu
        addItem(item)
    }
}
