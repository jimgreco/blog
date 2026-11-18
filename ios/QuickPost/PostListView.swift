import SwiftUI

/// Recent posts and drafts. Tap one to edit it in the composer.
struct PostListView: View {
    @Environment(BlogClient.self) private var client
    @Environment(\.dismiss) private var dismiss
    let onEdit: (Post) -> Void

    @State private var posts: [Post] = []
    @State private var loading = true
    @State private var error: String?
    @State private var pendingDelete: Post?

    var body: some View {
        NavigationStack {
            List {
                if let error {
                    Text(error).foregroundStyle(.red)
                }
                ForEach(posts) { post in
                    Button { onEdit(post) } label: { PostRow(post: post) }
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
            .overlay {
                if loading && posts.isEmpty { ProgressView() }
                else if !loading && posts.isEmpty && error == nil {
                    ContentUnavailableView("No Posts Yet", systemImage: "square.and.pencil")
                }
            }
            .refreshable { await load() }
            .task { await load() }
            .navigationTitle("Posts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } }
            }
            .confirmationDialog("Delete “\(pendingDelete?.title ?? "")”?", isPresented: Binding(
                get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }
            ), titleVisibility: .visible, presenting: pendingDelete) { post in
                Button("Delete Post", role: .destructive) { Task { await delete(post) } }
            } message: { _ in
                Text("This removes it from the blog and from Bluesky and Mastodon. It can't be undone.")
            }
        }
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
            Task { await client.deliverSocial() }
        } catch {
            self.error = error.localizedDescription
        }
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
