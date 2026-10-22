// AppSchemeHandler: serves the bundled game (the "www" folder) to the WKWebView.
// The game is loaded from span-app://localhost/index.html, so it never touches the network.
//
// IMPORTANT: the scheme "span-app" and the host "localhost" form the page origin that holds the game's
// localStorage saves (progress, designs, settings). Never change them: players would lose their progress.
// This mirrors the fixed origin in the Android shell (https://appassets.androidplatform.net).

import Foundation
import WebKit

final class AppSchemeHandler: NSObject, WKURLSchemeHandler {

    /// Scheme and host of the game's origin. Never change these (see the note above).
    static let scheme = "span-app"
    static let host = "localhost"
    static let startURL = URL(string: "span-app://localhost/index.html")!

    /// The folder holding the game files (index.html, js/, css/, assets/).
    private let root: URL
    private let rootPath: String

    init(root: URL) {
        let standard = root.standardizedFileURL
        self.root = standard
        // Compared against standardized file paths, with a trailing slash so "/www2" never matches "/www".
        self.rootPath = standard.path.hasSuffix("/") ? standard.path : standard.path + "/"
        super.init()
    }

    // MARK: - WKURLSchemeHandler

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url else {
            urlSchemeTask.didFailWithError(URLError(.badURL))
            return
        }

        guard let file = resolve(requestURL),
              let data = try? Data(contentsOf: file) else {
            respond(urlSchemeTask, url: requestURL, status: 404, mimeType: "text/plain; charset=utf-8", body: Data("Not found".utf8))
            return
        }

        respond(urlSchemeTask, url: requestURL, status: 200, mimeType: AppSchemeHandler.mimeType(for: file.pathExtension), body: data)
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {
        // Reads are synchronous and small, so there is nothing to cancel.
    }

    // MARK: - Helpers

    /// Maps a span-app URL to a file inside the www folder, or nil when the request is not allowed.
    private func resolve(_ url: URL) -> URL? {
        guard url.scheme == AppSchemeHandler.scheme, url.host == AppSchemeHandler.host else { return nil }

        // url.path is already percent-decoded; "/" (or an empty path) is the start page.
        var relative = url.path
        while relative.hasPrefix("/") { relative.removeFirst() }
        if relative.isEmpty { relative = "index.html" }

        // Refuse anything that could leave the folder.
        if relative.contains("\\") || relative.contains("\0") { return nil }
        if relative.split(separator: "/", omittingEmptySubsequences: false).contains("..") { return nil }

        let file = root.appendingPathComponent(relative).standardizedFileURL
        guard file.path.hasPrefix(rootPath) else { return nil }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: file.path, isDirectory: &isDirectory),
              !isDirectory.boolValue else { return nil }
        return file
    }

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, mimeType: String, body: Data) {
        guard let response = HTTPURLResponse(
            url: url,
            statusCode: status,
            httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": mimeType,
                "Content-Length": String(body.count)
            ]
        ) else {
            task.didFailWithError(URLError(.unknown))
            return
        }
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    private static func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html", "htm": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "webmanifest": return "application/manifest+json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "mp3": return "audio/mpeg"
        case "ogg": return "audio/ogg"
        case "wav": return "audio/wav"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}
