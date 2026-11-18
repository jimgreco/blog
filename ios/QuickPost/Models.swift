import Foundation

enum PostType: String, Codable, CaseIterable, Identifiable {
    case note, link, essay, project
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    /// The site's route segment, e.g. /notes/<slug>.
    var path: String { rawValue + "s" }
}

enum SocialLinkTarget: String, Codable, CaseIterable, Identifiable {
    case post, link, none
    var id: String { rawValue }
    var label: String {
        switch self {
        case .post: "Blog post"
        case .link: "External link"
        case .none: "No link"
        }
    }
}

/// A post as the blog's owner listing (`GET /api/posts?drafts=1`) returns it.
struct Post: Codable, Identifiable, Hashable {
    let pk: String
    var title: String
    var body: String
    var publishedAt: String
    var published: Bool
    var type: PostType
    var link: String?
    var revision: Int?
    var bskyText: String?
    var bskyLinkTarget: SocialLinkTarget?
    var bskyUri: String?
    var mastodonUri: String?

    var id: String { pk }
    var date: Date? { PostDate.parse(publishedAt) }
    func url(base: URL) -> URL { base.appendingPathComponent(type.path).appendingPathComponent(pk) }
}

/// The complete record the blog's save endpoints require. Every field is sent on
/// every save: an empty `bskyText` removes a post's Bluesky/Mastodon copy.
struct PostInput: Codable, Equatable {
    var title: String
    var body: String
    var link: String?
    var type: PostType
    var publishedAt: String
    var published: Bool
    var bskyText: String
    var bskyLinkTarget: SocialLinkTarget
}

/// What the user is typing. Persisted on the device so nothing is lost if the
/// app is closed or a save fails.
struct Draft: Codable, Equatable {
    static let blueskyLimit = 300

    var type: PostType = .note
    var title = ""
    var body = ""
    var link = ""
    var publish = true
    var shareToSocial = false
    var socialText = ""
    var socialLinkTarget: SocialLinkTarget = .post
    /// Set when editing an existing post.
    var editingSlug: String?
    var editingRevision: Int?
    var originalPublishedAt: String?
    /// Reused across retries of one new post so a retried save never duplicates it.
    var creationKey = UUID()

    init() {}

    init(editing post: Post) {
        type = post.type
        title = post.title
        body = post.body
        link = post.link ?? ""
        publish = post.published
        socialText = post.bskyText ?? ""
        shareToSocial = !socialText.isEmpty
        socialLinkTarget = post.bskyLinkTarget ?? .post
        editingSlug = post.pk
        editingRevision = post.revision ?? 0
        originalPublishedAt = post.publishedAt
    }

    var isEditing: Bool { editingSlug != nil }
    var isBlank: Bool { !isEditing && title.isEmpty && body.isEmpty && link.isEmpty && socialText.isEmpty }
    var trimmedLink: String { link.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// The title to save: the typed one, or for a note the start of its first line.
    var effectiveTitle: String {
        let typed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !typed.isEmpty || type != .note { return typed }
        let firstLine = body.split(whereSeparator: \.isNewline).first.map(String.init) ?? ""
        let cleaned = firstLine.trimmingCharacters(in: .whitespaces.union(CharacterSet(charactersIn: "#>*-")))
        guard cleaned.count > 60 else { return cleaned }
        let cut = cleaned.prefix(60)
        let word = cut.lastIndex(of: " ").map { cut[..<$0] } ?? cut
        return word.trimmingCharacters(in: .whitespaces) + "…"
    }

    var problem: String? {
        if effectiveTitle.isEmpty { return type == .note ? "Write something first." : "Add a title." }
        if effectiveTitle.count > 512 { return "The title is too long." }
        if type == .link {
            if trimmedLink.isEmpty { return "Add the link." }
        }
        if !trimmedLink.isEmpty {
            guard let url = URL(string: trimmedLink), ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
                  url.host != nil, url.user == nil else { return "The link must start with http:// or https://." }
        }
        if shareToSocial {
            if socialText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return "Write the social post or turn sharing off." }
            if socialText.count > Self.blueskyLimit { return "The social post is over \(Self.blueskyLimit) characters." }
        }
        return nil
    }

    func input(now: Date = .now) -> PostInput {
        let link = trimmedLink
        let social = shareToSocial ? socialText.trimmingCharacters(in: .whitespacesAndNewlines) : ""
        let target: SocialLinkTarget = socialLinkTarget == .link && link.isEmpty ? .post : socialLinkTarget
        return PostInput(
            title: effectiveTitle,
            body: body,
            link: link.isEmpty ? nil : link,
            type: type,
            publishedAt: originalPublishedAt ?? PostDate.format(now),
            published: publish,
            bskyText: social,
            bskyLinkTarget: target
        )
    }
}

/// The blog accepts only UTC ISO-8601 timestamps such as 2026-11-18T09:30:00.000Z.
enum PostDate {
    static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter.string(from: date)
    }

    static func parse(_ value: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: value) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)
    }
}
