import Foundation
import SwiftUI
import WebKit

struct TaxiWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator(allowedHost: url.host ?? "")
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "teoPrinter")
        configuration.userContentController = controller
        configuration.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = true
        context.coordinator.webView = webView
        context.coordinator.currentURL = url
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.currentURL != url {
            context.coordinator.currentURL = url
            context.coordinator.allowedHost = url.host ?? ""
            webView.load(URLRequest(url: url))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var webView: WKWebView?
        var allowedHost: String
        var currentURL: URL?
        private let printer = MPTIIPrinter()

        init(allowedHost: String) {
            self.allowedHost = allowedHost
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let destination = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }
            // Permit the main app and Firebase login/network navigation. Other external
            // links are opened in Safari, never given the Bluetooth message bridge.
            if destination.scheme == "https" || destination.scheme == "about" {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
        }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "teoPrinter",
                  message.frameInfo.isMainFrame,
                  message.frameInfo.securityOrigin.protocol == "https",
                  message.frameInfo.securityOrigin.host == allowedHost,
                  let payload = message.body as? [String: Any],
                  payload["type"] as? String == "print",
                  let jobId = payload["jobId"] as? String,
                  jobId.count <= 100,
                  let rows = payload["lines"] as? [[String: Any]],
                  !rows.isEmpty, rows.count < 180 else { return }

            let lines = rows.compactMap { row -> ReceiptLine? in
                guard let text = row["text"] as? String, text.count < 2500 else { return nil }
                return ReceiptLine(text: text, kind: row["kind"] as? String ?? "text")
            }
            guard lines.count == rows.count else {
                report(jobId: jobId, success: false,
                       message: "Le ticket contient une ligne non valide.")
                return
            }
            printer.printReceipt(lines) { [weak self] result in
                switch result {
                case .success:
                    self?.report(jobId: jobId, success: true,
                                 message: "Commande transmise à la MPT-II.")
                case .failure(let error):
                    self?.report(jobId: jobId, success: false,
                                 message: error.localizedDescription)
                }
            }
        }

        private func report(jobId: String, success: Bool, message: String) {
            DispatchQueue.main.async { [weak self] in
                let payload: [String: Any] = [
                    "jobId": jobId,
                    "ok": success,
                    "message": message
                ]
                guard let json = try? JSONSerialization.data(withJSONObject: payload),
                      let jsonText = String(data: json, encoding: .utf8) else { return }
                let javascript = "window.dispatchEvent(new CustomEvent('teo-native-print-result',{detail:\(jsonText)}));"
                self?.webView?.evaluateJavaScript(javascript, completionHandler: nil)
            }
        }
    }
}
