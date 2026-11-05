import SwiftUI
import WebKit

struct HomeView: View {
    @AppStorage("mesCoursesTeoURL") private var siteURL =
        "https://allaouaboucheneb04-lgtm.github.io/mes-courses-teo/"
    @State private var showSettings = false

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
                    ContentUnavailableView(
                        "Adresse incorrecte",
                        systemImage: "wifi.exclamationmark",
                        description: Text("Renseignez l’adresse HTTPS de Mes Courses Téo.")
                    )
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Mes Courses Téo").fontWeight(.bold)
                }
                ToolbarItem(placement: .topBarTrailing) {
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
                            Text("Allumez l’imprimante, fermez nRF Connect, puis appuyez sur « Imprimer » dans l’historique des vérifications. Le jumelage est automatique dans l’application iPhone.")
                                .font(.footnote)
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
