import Foundation
import GoogleSignIn
import Observation
import UIKit

enum BlogError: LocalizedError {
    case signedOut
    case notOwner
    case conflict(String)
    case server(Int, String?)
    case offline

    var errorDescription: String? {
        switch self {
        case .signedOut: "Sign in again to keep posting."
        case .notOwner: "The blog didn't accept this Google account."
        case .conflict(let message): message
        case .server(let status, let message): message ?? "The blog returned an error (\(status))."
        case .offline: "Couldn't reach the blog. Your draft is saved on this iPhone; try again."
        }
    }
}

/// Google sign-in plus the blog's owner API. The Google ID token is the bearer
/// credential; Google Sign-In keeps it in the Keychain and refreshes it.
@MainActor
@Observable
final class BlogClient {
    private(set) var email: String?
    private(set) var isRestoring = true
    var isSignedIn: Bool { email != nil }

    let baseURL: URL
    private let urlSession: URLSession

    init(baseURL: URL = BlogClient.configuredBaseURL, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.urlSession = urlSession
    }

    nonisolated static var configuredBaseURL: URL {
        let value = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String ?? ""
        return URL(string: value) ?? URL(string: "https://jim-greco.com")!
    }

    nonisolated static var googleClientID: String? {
        guard let id = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
              !id.isEmpty, !id.hasPrefix("YOUR_") else { return nil }
        return id
    }

    // MARK: Sign in

    func restore() async {
        defer { isRestoring = false }
        guard let user = try? await GIDSignIn.sharedInstance.restorePreviousSignIn() else { return }
        email = user.profile?.email
    }

    func signIn() async throws {
        guard Self.googleClientID != nil else {
            throw BlogError.server(0, "Google sign-in isn't set up in this build yet. See ios/README.md.")
        }
        guard let presenter = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController else { throw BlogError.server(0, "Couldn't show Google sign-in.") }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        email = result.user.profile?.email
        // Confirm the blog accepts this account before showing the composer.
        do {
            _ = try await posts()
        } catch {
            signOut()
            throw error
        }
    }

    func signOut() {
        GIDSignIn.sharedInstance.signOut()
        email = nil
    }

    private func idToken() async throws -> String {
        guard let user = GIDSignIn.sharedInstance.currentUser else { throw BlogError.signedOut }
        do {
            let fresh = try await user.refreshTokensIfNeeded()
            guard let token = fresh.idToken?.tokenString else { throw BlogError.signedOut }
            return token
        } catch let error as BlogError {
            throw error
        } catch {
            throw (error as NSError).domain == NSURLErrorDomain ? BlogError.offline : BlogError.signedOut
        }
    }

    // MARK: Posts

    /// All posts, drafts included, newest first.
    func posts() async throws -> [Post] {
        try await send("GET", "api/posts?drafts=1")
    }

    func create(_ input: PostInput, key: UUID) async throws -> Post {
        try await send("POST", "api/posts", body: input, headers: ["Idempotency-Key": key.uuidString.lowercased()])
    }

    func update(slug: String, revision: Int, with input: PostInput) async throws -> Post {
        try await send("PUT", "api/posts/\(escaped(slug))", body: input, headers: ["If-Match": "\"\(revision)\""])
    }

    func delete(slug: String, revision: Int) async throws {
        let _: EmptyResponse = try await send("DELETE", "api/posts/\(escaped(slug))", headers: ["If-Match": "\"\(revision)\""])
    }

    /// Sends queued Bluesky/Mastodon changes, as the web editor does after a save.
    /// Saving never depends on this succeeding.
    func deliverSocial() async {
        for _ in 0..<2 {
            guard let result: DeliveryResult = try? await send("POST", "api/social") else { return }
            if (result.processed ?? 0) == 0 { return }
        }
    }

    private func escaped(_ slug: String) -> String {
        slug.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? slug
    }

    private func send<T: Decodable>(_ method: String, _ path: String, body: (some Encodable)? = nil as String?,
                                    headers: [String: String] = [:]) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw BlogError.server(0, "Bad URL") }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 30)
        request.httpMethod = method
        request.setValue("Bearer \(try await idToken())", forHTTPHeaderField: "Authorization")
        headers.forEach { request.setValue($1, forHTTPHeaderField: $0) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }
        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await urlSession.data(for: request)
        } catch {
            throw BlogError.offline
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let message = (try? JSONDecoder().decode(ErrorBody.self, from: data))?.error
        switch status {
        case 200..<300:
            return try JSONDecoder().decode(T.self, from: data.isEmpty ? Data("{}".utf8) : data)
        case 401: throw email == nil ? BlogError.signedOut : BlogError.notOwner
        case 409: throw BlogError.conflict(message ?? "This post changed elsewhere. Reload and try again.")
        default: throw BlogError.server(status, message)
        }
    }
}

private struct ErrorBody: Decodable { let error: String? }
private struct DeliveryResult: Decodable { let processed: Int? }
struct EmptyResponse: Decodable {}
