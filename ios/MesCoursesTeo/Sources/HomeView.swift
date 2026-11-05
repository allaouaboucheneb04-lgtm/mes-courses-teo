import SwiftUI
import WebKit

struct HomeView: View {
    @AppStorage("mesCoursesTeoURL") private var siteURL =
        "https://allaouaboucheneb04-lgtm.github.io/mes-courses-teo/"
    @State private var showSettings = false
    @State private var printer = MPTIIPrinter()
    @State private var testPrinting = false
    @State private var testMessage = ""

    private var validURL: URL? {
        guard let url = URL(string: siteURL),
              url.scheme == "https",
              let host = url.host,
              !host.isEmpty else { return nil }
        return url
    }

    var body: some View {
        NavigationStack {
            Group {
                if let url = validURL {
                    TaxiWebView(url: url)
                        .ignoresSafeArea(edges: .bottom)
                } else {
                    VStack(spacing: 12) {
                        Image(systemName: "wifi.exclamationmark")
                            .font(.largeTitle)
                        Text("Adresse incorrecte").font(.headline)
                        Text("Renseignez l’adresse HTTPS de Mes Courses Téo.")
                            .multilineTextAlignment(.center)
                    }
                    .padding()
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Mes Courses Téo").fontWeight(.bold)
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showSettings = true
                    } label: {
                        Image(systemName: "gearshape.fill")
                    }
                    .accessibilityLabel("Paramètres du site")
                }
            }
            .sheet(isPresented: $showSettings) {
                NavigationStack {
                    Form {
                        Section("Adresse du site") {
                            TextField("https://...", text: $siteURL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.URL)
                            Text("Utilisez l’adresse HTTPS qui ouvre réellement votre application. Le site est affiché dans la version native pour accéder à l’impression Bluetooth.")
                                .font(.footnote)
                        }
                        Section("Bisofice MPT-II") {
                            Text("Test direct Bluetooth, sans Bluefy ni nRF Connect. Allumez l’imprimante et fermez nRF Connect avant ce test.")
                                .font(.footnote)
                            Button {
                                guard !testPrinting else { return }
                                testPrinting = true
                                testMessage = "Recherche de MPT-II et envoi du ticket…"
                                printer.printReceipt([
                                    ReceiptLine(text: "MES COURSES TEO", kind: "title"),
                                    ReceiptLine(text: "TEST MPT-II", kind: "bold"),
                                    ReceiptLine(text: "Impression Bluetooth directe", kind: "text")
                                ]) { result in
                                    DispatchQueue.main.async {
                                        testPrinting = false
                                        switch result {
                                        case .success:
                                            testMessage = "Commande envoyée. Vérifiez qu’un ticket est sorti."
                                        case .failure(let error):
                                            testMessage = error.localizedDescription
                                        }
                                    }
                                }
                            } label: {
                                Label(testPrinting ? "Impression en cours…" : "Tester mon imprimante", systemImage: "printer.fill")
                            }
                            .disabled(testPrinting)
                            if !testMessage.isEmpty {
                                Text(testMessage).font(.footnote)
                            }
                        }
                    }
                    .navigationTitle("Configuration")
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Terminé") { showSettings = false }
                        }
                    }
                }
            }
        }
    }
}
