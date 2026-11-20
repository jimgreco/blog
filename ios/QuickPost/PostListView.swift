import SwiftUI
import UIKit

/// The app's home screen: every post and draft. Tap one to edit it, or tap the
/// plus button to write a new one.
struct PostListView: View {
    @Environment(BlogClient.self) private var client
    @Environment(DraftStore.self) private var store
    @Environment(\.openURL) private var openURL

    @State private var posts: [Post] = []
    @State private var loading = true
    @State private var error: String?
    @State private var pendingDelete: Post?
    @State private var composing = false
    @State private var pendingOpen: Target?
    @State private var saved: Post?

    /// What the user asked to open in the editor.
    enum Target {
        case new
        case post(Post)

        /// True when the unsaved text in the store already belongs to this target.
        func matches(_ draft: Draft) -> Bool {
            switch self {
            case .new: !draft.isEditing
            case .post(let post): draft.editingSlug == post.pk
            }
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                if store.hasUnsavedText && !composing {
                    Section("Unsaved on this iPhone") {
                        Button { composing = true } label: { UnsavedRow(draft: store.draft) }
                            .foregroundStyle(.primary)
                            .swipeActions {
                                Button("Discard", systemImage: "trash", role: .destructive) { store.reset() }
                            }
                    }
                }
                Section {
                    ForEach(posts) { post in
                        Button { open(.post(post)) } label: { PostRow(post: post) }
                            .foregroundStyle(.primary)
                            .swipeActions {
                                Button("Delete", systemImage: "trash", role: .destructive) { pendingDelete = post }
                            }
                            .contextMenu {
                                if post.published {
                                    Link(destination: post.url(base: client.baseURL)) {
                                        Label("View on Blog", systemImage: "safari")
                                    }
                                    ShareLink(item: post.url(base: client.baseURL))
                                }
                            }
                    }
                }
            }
            .contentMargins(.bottom, 96, for: .scrollContent)
            .overlay {
                if loading && posts.isEmpty { ProgressView() }
                else if !loading && posts.isEmpty && error == nil {
                    ContentUnavailableView("No Posts Yet", systemImage: "square.and.pencil",
                                           description: Text("Tap the plus button to write one."))
                }
            }
            .overlay(alignment: .bottomTrailing) {
                Button { open(.new) } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 28, weight: .semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.circle)
                .controlSize(.large)
                .padding(.trailing, 20)
                .padding(.bottom, 12)
                .accessibilityLabel("New Post")
            }
            .refreshable { await load() }
            .task { await load() }
            .navigationTitle("Posts")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Sign Out \(client.email ?? "")", systemImage: "rectangle.portrait.and.arrow.right") {
                            client.signOut()
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                    }
                    .accessibilityLabel("More")
                }
            }
            .navigationDestination(isPresented: $composing) {
                ComposeView { post in
                    saved = post
                    Task { await load() }
                }
            }
            .confirmationDialog("Delete “\(pendingDelete?.title ?? "")”?", isPresented: Binding(
                get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }
            ), titleVisibility: .visible, presenting: pendingDelete) { post in
                Button("Delete Post", role: .destructive) { Task { await delete(post) } }
            } message: { _ in
                Text("This removes it from the blog and from Bluesky and Mastodon. It can't be undone.")
            }
            .confirmationDialog("You have unsaved text", isPresented: Binding(
                get: { pendingOpen != nil }, set: { if !$0 { pendingOpen = nil } }
            ), titleVisibility: .visible, presenting: pendingOpen) { target in
                Button("Discard It", role: .destructive) {
                    store.reset()
                    start(target)
                }
                Button("Keep Writing It") { composing = true }
            } message: { _ in
                Text("“\(store.draft.effectiveTitle)” hasn't been saved to the blog.")
            }
            .alert(saved?.published == true ? "Published" : "Saved", isPresented: Binding(
                get: { saved != nil }, set: { if !$0 { saved = nil } }
            ), presenting: saved) { post in
                if post.published {
                    Button("View on Blog") { openURL(post.url(base: client.baseURL)) }
                    Button("Copy Link") { UIPasteboard.general.url = post.url(base: client.baseURL) }
                }
                Button("Done", role: .cancel) {}
            } message: { post in
                Text(post.title)
            }
        }
    }

    private func open(_ target: Target) {
        if store.hasUnsavedText && !target.matches(store.draft) {
            pendingOpen = target
        } else {
            start(target)
        }
    }

    private func start(_ target: Target) {
        switch target {
        case .new: store.startNew()
        case .post(let post): store.edit(post)
        }
        composing = true
    }

    private func load() async {
        loading = true
        defer { loading = false }
        do {
            posts = try await client.posts()
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func delete(_ post: Post) async {
        do {
            try await client.delete(slug: post.pk, revision: post.revision ?? 0)
            posts.removeAll { $0.pk == post.pk }
            if store.draft.editingSlug == post.pk { store.reset() }
            Task { await client.deliverSocial() }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct UnsavedRow: View {
    let draft: Draft

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(draft.effectiveTitle.isEmpty ? "Untitled" : draft.effectiveTitle).font(.headline).lineLimit(2)
            Text(draft.isEditing ? "Unsaved changes · \(draft.type.label)" : "New \(draft.type.label.lowercased()), not saved yet")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private struct PostRow: View {
    let post: Post

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(post.title).font(.headline).lineLimit(2)
            HStack(spacing: 6) {
                Text(post.type.label)
                if let date = post.date {
                    Text("·")
                    Text(date, format: .dateTime.month(.abbreviated).day().year())
                }
                if !post.published {
                    Text("Draft")
                        .font(.caption2.bold())
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(.orange.opacity(0.2), in: Capsule())
                        .foregroundStyle(.orange)
                }
                if post.bskyUri != nil || post.mastodonUri != nil {
                    Image(systemName: "bubble.left.and.bubble.right").accessibilityLabel("Shared to social")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
