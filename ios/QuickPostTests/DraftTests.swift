import XCTest
@testable import QuickPost

final class DraftTests: XCTestCase {
    func testNoteTitleComesFromFirstLineWhenBlank() {
        var draft = Draft()
        draft.body = "# Coffee thoughts\nMore text"
        XCTAssertEqual(draft.effectiveTitle, "Coffee thoughts")
        XCTAssertNil(draft.problem)

        draft.body = String(repeating: "word ", count: 30)
        XCTAssertTrue(draft.effectiveTitle.hasSuffix("…"))
        XCTAssertLessThanOrEqual(draft.effectiveTitle.count, 61)

        draft.type = .essay
        XCTAssertEqual(draft.effectiveTitle, "")
        XCTAssertNotNil(draft.problem)
    }

    func testValidation() {
        var draft = Draft()
        XCTAssertNotNil(draft.problem)
        draft.type = .link
        draft.title = "A link"
        XCTAssertEqual(draft.problem, "Add the link.")
        draft.link = "javascript:alert(1)"
        XCTAssertNotNil(draft.problem)
        draft.link = "https://example.com/a"
        XCTAssertNil(draft.problem)
        draft.shareToSocial = true
        XCTAssertNotNil(draft.problem)
        draft.socialText = String(repeating: "x", count: 301)
        XCTAssertNotNil(draft.problem)
        draft.socialText = "Look at this"
        XCTAssertNil(draft.problem)
    }

    func testInputMatchesTheBlogSchema() throws {
        var draft = Draft()
        draft.body = "Hello"
        let input = draft.input(now: Date(timeIntervalSince1970: 1_800_000_000.5))
        XCTAssertEqual(input.publishedAt, "2027-01-15T08:00:00.500Z")
        XCTAssertEqual(input.bskyText, "")
        XCTAssertNil(input.link)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as! [String: Any]
        XCTAssertEqual(Set(json.keys), ["title", "body", "type", "publishedAt", "published", "bskyText", "bskyLinkTarget"])
    }

    func testEditingKeepsDateAndSocialText() {
        let post = Post(pk: "hello", title: "Hello", body: "Body", publishedAt: "2026-01-01T12:00:00.000Z",
                        published: true, type: .note, link: nil, revision: 3, bskyText: "Shared", bskyLinkTarget: .post)
        let draft = Draft(editing: post)
        XCTAssertEqual(draft.editingRevision, 3)
        XCTAssertTrue(draft.shareToSocial)
        XCTAssertEqual(draft.input().publishedAt, "2026-01-01T12:00:00.000Z")
        XCTAssertEqual(draft.input().bskyText, "Shared")
    }

    func testLinkTargetFallsBackWithoutALink() {
        var draft = Draft()
        draft.body = "Hi"
        draft.socialLinkTarget = .link
        XCTAssertEqual(draft.input().bskyLinkTarget, .post)
    }
}
