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
                PostListView()
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
    /// The post as it was loaded for editing, to tell whether it has been changed.
    /// Not persisted: an edit restored after a relaunch counts as unsaved.
    private(set) var pristine: Draft?

    /// True while the store holds text that has not been saved to the blog.
    var hasUnsavedText: Bool { !draft.isBlank && draft != pristine }

    func reset(keeping type: PostType = .note) {
        var fresh = Draft()
        fresh.type = type
        pristine = nil
        draft = fresh
    }

    /// Opens a new post, keeping one that is already being written.
    func startNew() {
        if draft.isEditing { reset() }
    }

    /// Loads a post for editing, keeping unsaved changes to that same post.
    func edit(_ post: Post) {
        if draft.editingSlug == post.pk && hasUnsavedText { return }
        let loaded = Draft(editing: post)
        pristine = loaded
        draft = loaded
    }

    /// Called when the editor closes: an opened but unchanged post is not a draft.
    func closeIfUnchanged() {
        if draft.isEditing && draft == pristine { reset() }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(draft) { defaults.set(data, forKey: Self.key) }
    }
}
