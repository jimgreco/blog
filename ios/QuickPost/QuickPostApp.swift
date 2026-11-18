import GoogleSignIn
import SwiftUI

@main
struct QuickPostApp: App {
    @State private var client = BlogClient()
    @State private var drafts = DraftStore()

    init() {
        if let clientID = BlogClient.googleClientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(client)
                .environment(drafts)
                .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
                .task { await client.restore() }
        }
    }
}

struct RootView: View {
    @Environment(BlogClient.self) private var client

    var body: some View {
        Group {
            if client.isRestoring {
                ProgressView()
            } else if client.isSignedIn {
                ComposeView()
            } else {
                SignInView()
            }
        }
        .animation(.default, value: client.isSignedIn)
    }
}

/// Keeps the draft being written on the device until it is saved to the blog.
@MainActor
@Observable
final class DraftStore {
    private static let key = "currentDraft"
    var draft: Draft {
        didSet { persist() }
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        draft = defaults.data(forKey: Self.key).flatMap { try? JSONDecoder().decode(Draft.self, from: $0) } ?? Draft()
    }

    private let defaults: UserDefaults

    func reset(keeping type: PostType = .note) {
        var fresh = Draft()
        fresh.type = type
        draft = fresh
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(draft) { defaults.set(data, forKey: Self.key) }
    }
}
