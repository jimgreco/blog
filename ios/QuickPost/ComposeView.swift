import SwiftUI
import UIKit

/// The editor for a new or existing post, pushed from the post list. It shows
/// the Markdown being written or a rendered preview of it.
struct ComposeView: View {
    @Environment(BlogClient.self) private var client
    @Environment(DraftStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @FocusState private var focus: Field?
    @State private var mode = Mode.markdown
    @State private var saving = false
    @State private var error: String?
    @State private var confirmDiscard = false
    let onSaved: (Post) -> Void

    enum Field { case title, body, link, social }
    enum Mode: String, CaseIterable, Identifiable {
        case markdown = "Markdown", preview = "Preview"
        var id: String { rawValue }
    }

    var body: some View {
        Group {
            if mode == .preview {
                MarkdownPreview(title: store.draft.effectiveTitle, link: store.draft.trimmedLink, markdown: store.draft.body)
            } else {
                editor
            }
        }
        .navigationTitle(store.draft.isEditing ? "Edit Post" : "New Post")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .principal) {
                Picker("View", selection: $mode) {
                    ForEach(Mode.allCases) { Text($0.rawValue).tag($0) }
                }
                .pickerStyle(.segmented)
                .fixedSize()
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(action: save) {
                    if saving { ProgressView() } else { Text(saveLabel).bold() }
                }
                .disabled(saving || store.draft.problem != nil)
            }
            if store.hasUnsavedText {
                ToolbarItem(placement: .secondaryAction) {
                    Button(store.draft.isEditing ? "Discard Changes" : "Discard Draft", systemImage: "trash", role: .destructive) {
                        confirmDiscard = true
                    }
                }
            }
        }
        .confirmationDialog("Discard this text?", isPresented: $confirmDiscard, titleVisibility: .visible) {
            Button("Discard", role: .destructive) {
                store.reset()
                dismiss()
            }
        }
        .onChange(of: mode) { focus = nil }
        .onAppear { if store.draft.isBlank { focus = .body } }
        .onDisappear { store.closeIfUnchanged() }
    }

    private var editor: some View {
        @Bindable var store = store
        return Form {
                Section {
                    Picker("Type", selection: $store.draft.type) {
                        ForEach(PostType.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }

                Section {
                    if store.draft.type == .link || !store.draft.link.isEmpty {
                        HStack {
                            TextField("https://…", text: $store.draft.link)
                                .keyboardType(.URL)
                                .textContentType(.URL)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focus, equals: .link)
                            PasteButton(payloadType: URL.self) { urls in
                                if let url = urls.first { store.draft.link = url.absoluteString }
                            }
                            .labelStyle(.iconOnly)
                            .buttonBorderShape(.capsule)
                        }
                    }
                    TextField(store.draft.type == .note ? "Title (optional)" : "Title", text: $store.draft.title, axis: .vertical)
                        .font(.headline)
                        .focused($focus, equals: .title)
                    TextField("Write in Markdown…", text: $store.draft.body, axis: .vertical)
                        .lineLimit(8...)
                        .focused($focus, equals: .body)
                } footer: {
                    if store.draft.type == .note && store.draft.title.isEmpty && !store.draft.effectiveTitle.isEmpty {
                        Text("Title: \(store.draft.effectiveTitle)")
                    }
                }

                Section {
                    Toggle("Publish now", isOn: $store.draft.publish)
                    Toggle("Share to Bluesky & Mastodon", isOn: $store.draft.shareToSocial.animation())
                    if store.draft.shareToSocial {
                        TextField("Social post", text: $store.draft.socialText, axis: .vertical)
                            .lineLimit(3...)
                            .focused($focus, equals: .social)
                        Picker("Link to", selection: $store.draft.socialLinkTarget) {
                            ForEach(SocialLinkTarget.allCases) { target in
                                Text(target.label).tag(target)
                            }
                        }
                    }
                } footer: {
                    if store.draft.shareToSocial {
                        let count = store.draft.socialText.count
                        Text("\(count)/\(Draft.blueskyLimit)")
                            .foregroundStyle(count > Draft.blueskyLimit ? .red : .secondary)
                    } else if !store.draft.publish {
                        Text("Saved as a draft. Only you can see it.")
                    }
                }

                if let error {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
    }

    private var saveLabel: String {
        if store.draft.isEditing { return "Save" }
        return store.draft.publish ? "Publish" : "Save Draft"
    }

    private func save() {
        let draft = store.draft
        if let problem = draft.problem { error = problem; return }
        saving = true
        error = nil
        focus = nil
        Task {
            defer { saving = false }
            do {
                let input = draft.input()
                let post: Post
                if let slug = draft.editingSlug {
                    post = try await client.update(slug: slug, revision: draft.editingRevision ?? 0, with: input)
                } else {
                    post = try await client.create(input, key: draft.creationKey)
                }
                store.reset(keeping: draft.type == .link ? .note : draft.type)
                onSaved(post)
                dismiss()
                Task { await client.deliverSocial() }
            } catch {
                self.error = error.localizedDescription
                mode = .markdown
            }
        }
    }
}
