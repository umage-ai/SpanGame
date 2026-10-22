// GameViewController: the whole SPAN screen, a full-bleed WKWebView running the bundled game (docs/NATIVE.md).
// The game sees window.SpanNative (defined by a user script before any game script runs) and the shell
// calls BG.Native (js/features/native.js): pause(), resume() and saved(ok). Mirrors MainActivity.java on Android.
// The game handles the safe areas itself (CSS env(safe-area-inset-*)), so the web view ignores them.

import UIKit
import WebKit

final class GameViewController: UIViewController {

    private var webView: WKWebView?
    private var pendingExportURL: URL?

    private static let backgroundColor = UIColor(red: 0x0d / 255.0, green: 0x14 / 255.0, blue: 0x24 / 255.0, alpha: 1)

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = GameViewController.backgroundColor

        let web = WKWebView(frame: .zero, configuration: makeConfiguration())
        web.translatesAutoresizingMaskIntoConstraints = false
        web.backgroundColor = GameViewController.backgroundColor
        web.isOpaque = false
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = self
        web.uiDelegate = self
        #if DEBUG
        if #available(iOS 16.4, *) {
            web.isInspectable = true
        }
        #endif

        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.topAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        self.webView = web

        web.load(URLRequest(url: AppSchemeHandler.startURL))
    }

    override var prefersStatusBarHidden: Bool { true }

    override var prefersHomeIndicatorAutoHidden: Bool { true }

    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }

    // MARK: - Game lifecycle (called by SceneDelegate)

    /// The app went to the background: BG.Native.pause().
    func pauseGame() {
        callNative("BG.Native.pause()")
    }

    /// The app is back in front: BG.Native.resume().
    func resumeGame() {
        callNative("BG.Native.resume()")
    }

    /// Runs a BG.Native call in the page, ignoring errors (the page may not be loaded yet).
    private func callNative(_ expression: String) {
        webView?.evaluateJavaScript("try{\(expression)}catch(e){}", completionHandler: nil)
    }

    // MARK: - Configuration

    private func makeConfiguration() -> WKWebViewConfiguration {
        let configuration = WKWebViewConfiguration()
        configuration.setURLSchemeHandler(AppSchemeHandler(root: GameViewController.gameRootURL()),
                                          forURLScheme: AppSchemeHandler.scheme)
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let contentController = WKUserContentController()
        contentController.addUserScript(WKUserScript(
            source: GameViewController.bridgeScript(),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        contentController.add(WeakScriptMessageHandler(self), name: "spanSave")
        configuration.userContentController = contentController

        return configuration
    }

    /// Defines window.SpanNative before any game script runs (the contract in docs/NATIVE.md).
    private static func bridgeScript() -> String {
        let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? ""
        return """
        window.SpanNative = {
          getPlatform: function () { return 'ios'; },
          getVersion: function () { return \(jsStringLiteral(version)); },
          saveFile: function (name, text) {
            window.webkit.messageHandlers.spanSave.postMessage({ name: String(name), text: String(text) });
            return true;
          }
        };
        """
    }

    /// A JavaScript string literal for value (JSON strings are valid JavaScript literals).
    private static func jsStringLiteral(_ value: String) -> String {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]),
              let text = String(data: data, encoding: .utf8) else {
            return "''"
        }
        return text
    }

    /// The bundled game folder. Bundle.module is the SwiftPM resource bundle (xtool); Bundle.main is Xcode.
    private static func gameRootURL() -> URL {
        #if SWIFT_PACKAGE
        let bundle = Bundle.module
        #else
        let bundle = Bundle.main
        #endif
        guard let root = bundle.url(forResource: "www", withExtension: nil) else {
            fatalError("SPAN: the game folder 'www' is missing from the app bundle")
        }
        return root
    }

    // MARK: - Save export (window.SpanNative.saveFile -> system document picker)

    /// Writes the save to a temporary file and shows the "save as" picker. Answers BG.Native.saved(...).
    private func exportSave(name: String, text: String) {
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(GameViewController.sanitizedFileName(name))
        do {
            try Data(text.utf8).write(to: fileURL, options: .atomic)
        } catch {
            callNative("BG.Native.saved(false)")
            return
        }

        pendingExportURL = fileURL
        let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
        picker.delegate = self
        present(picker, animated: true)
    }

    /// Strips characters that are not allowed in file names and makes sure the name ends in .json.
    private static func sanitizedFileName(_ raw: String) -> String {
        let forbidden = CharacterSet(charactersIn: "/\\:*?\"<>|").union(.controlCharacters)
        var base = raw.filter { character in
            !character.unicodeScalars.contains(where: { forbidden.contains($0) })
        }
        base = base.trimmingCharacters(in: CharacterSet(charactersIn: ". \t\n\r"))
        if base.isEmpty { base = "span-save" }
        if !base.lowercased().hasSuffix(".json") { base += ".json" }
        return base
    }

    private func finishExport() {
        if let url = pendingExportURL {
            try? FileManager.default.removeItem(at: url)
        }
        pendingExportURL = nil
    }
}

// MARK: - WKScriptMessageHandler (spanSave)

extension GameViewController: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "spanSave",
              let body = message.body as? [String: Any],
              let name = body["name"] as? String,
              let text = body["text"] as? String else { return }
        exportSave(name: name, text: text)
    }
}

// MARK: - Document picker (save export result)

extension GameViewController: UIDocumentPickerDelegate {

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        finishExport()
        callNative("BG.Native.saved(true)")
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        finishExport()
        callNative("BG.Native.saved(null)")
    }
}

// MARK: - Navigation

extension GameViewController: WKNavigationDelegate {

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        // The game itself, plus in-page documents (about:blank frames, blob: and data: URLs).
        let inPage = ["about", "blob", "data"]
        if url.scheme == AppSchemeHandler.scheme || inPage.contains(url.scheme ?? "") {
            decisionHandler(.allow)
            return
        }
        // Links from the About screen (http, https, mailto) open outside the game.
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
        decisionHandler(.cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // The game autosaves, so a fresh start loses at most a moment (as MainActivity does).
        webView.load(URLRequest(url: AppSchemeHandler.startURL))
    }
}

// MARK: - UI (target=_blank, window.open)

extension GameViewController: WKUIDelegate {

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        return nil
    }
}

// MARK: - Weak message handler

/// WKUserContentController keeps its message handlers alive, so the view controller is wrapped
/// in this weak proxy to avoid a retain cycle.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {

    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(userContentController, didReceive: message)
    }
}
