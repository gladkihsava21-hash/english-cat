// Савелий — приложение для macOS.
//
// Тонкая оболочка над сайтом wordcat.ru: окно + WKWebView (родной движок
// Safari, ничего ставить не нужно). Весь продукт — сайт: его service
// worker и офлайн-кэш работают и здесь, обновляется приложение само.
// Здесь только рамка: портретное окно, заголовок из страницы, внешние
// ссылки — в браузер, камера и микрофон — для видеоуроков.
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
        // Медиа с веб-страницы — без лишнего системного диалога поверх
        // нашего: разрешение спрашиваем один раз сами (см. ниже).
        config.preferences.isElementFullscreenEnabled = true

        web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true

        // Портретная рамка, как у телефона: manifest сайта portrait,
        // интерфейс рассчитан на это.
        let rect = NSRect(x: 0, y: 0, width: 460, height: 900)
        window = NSWindow(contentRect: rect,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Савелий — кот-репетитор английского"
        window.minSize = NSSize(width: 380, height: 640)
        window.contentView = web
        window.center()
        window.delegate = self
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

    func windowWillClose(_ notification: Notification) { NSApp.terminate(nil) }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let controller = MainWindowController()

// Меню по минимуму: правка/копировать-вставить без них не работают в формах.
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
