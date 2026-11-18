import GoogleSignIn
import SwiftUI

struct SignInView: View {
    @Environment(BlogClient.self) private var client
    @State private var error: String?
    @State private var working = false

    var body: some View {
        VStack(spacing: 24) {
            Spacer()
            Image(systemName: "square.and.pencil")
                .font(.system(size: 64))
                .foregroundStyle(.tint)
            VStack(spacing: 8) {
                Text("Quick Post").font(.largeTitle.bold())
                Text("Write and publish to \(client.baseURL.host() ?? "your blog") from your iPhone.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task {
                    working = true
                    defer { working = false }
                    do {
                        try await client.signIn()
                        error = nil
                    } catch let failure {
                        let cancelled = (failure as NSError).domain == kGIDSignInErrorDomain && (failure as NSError).code == GIDSignInError.canceled.rawValue
                        if !cancelled {
                            error = failure.localizedDescription
                        }
                    }
                }
            } label: {
                Label("Sign in with Google", systemImage: "person.crop.circle")
                    .font(.title3.weight(.medium))
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(working)
            if let error {
                Text(error).font(.footnote).foregroundStyle(.red).multilineTextAlignment(.center)
            }
        }
        .padding(32)
    }
}
