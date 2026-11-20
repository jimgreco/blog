import XCTest
@testable import QuickPost

final class MarkdownTests: XCTestCase {
    func testBlocks() {
        let blocks = Markdown.blocks("""
        # Title

        Some **bold** text
        on two lines.

        - one
        - two

          more of two
          1. nested

        > quoted

        ```
        let x = 1
        ```

        ---

        ![a cat](https://example.com/cat.png)
        """)
        XCTAssertEqual(blocks.map(\.kind), [
            .heading(1), .paragraph,
            .listItem(marker: "•", depth: 1), .listItem(marker: "•", depth: 1),
            .listItem(marker: nil, depth: 1), .listItem(marker: "1.", depth: 2),
            .paragraph, .code, .rule, .image(URL(string: "https://example.com/cat.png")!),
        ])
        XCTAssertEqual(blocks[0].plain, "Title")
        XCTAssertEqual(blocks[1].plain, "Some bold text on two lines.")
        XCTAssertEqual(blocks.map(\.quoted), [false, false, false, false, false, false, true, false, false, false])
        XCTAssertEqual(blocks[7].plain, "let x = 1")
        XCTAssertEqual(blocks[9].plain, "a cat")
    }

    func testTableKeepsEmptyCellsInPlace() {
        let blocks = Markdown.blocks("""
        | A | B |
        |---|---|
        |   | 2 |
        | 3 | 4 |
        """)
        XCTAssertEqual(blocks.count, 1)
        XCTAssertEqual(blocks[0].kind, .table)
        XCTAssertEqual(blocks[0].rows.map { $0.map { String($0.characters) } }, [["A", "B"], ["", "2"], ["3", "4"]])
    }

    func testEmptyBodyHasNoBlocks() {
        XCTAssertEqual(Markdown.blocks(""), [])
    }
}

@MainActor
final class DraftStoreTests: XCTestCase {
    private func store() -> DraftStore {
        let name = "DraftStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        addTeardownBlock { defaults.removePersistentDomain(forName: name) }
        return DraftStore(defaults: defaults)
    }

    private let post = Post(pk: "hello", title: "Hello", body: "Body", publishedAt: "2026-01-01T12:00:00.000Z",
                            published: true, type: .essay, link: nil, revision: 3)

    func testOpeningAPostWithoutChangingItLeavesNothingUnsaved() {
        let store = store()
        store.edit(post)
        XCTAssertFalse(store.hasUnsavedText)
        store.closeIfUnchanged()
        XCTAssertTrue(store.draft.isBlank)
    }

    func testChangedPostSurvivesClosingAndReopening() {
        let store = store()
        store.edit(post)
        store.draft.body = "Changed"
        store.closeIfUnchanged()
        XCTAssertTrue(store.hasUnsavedText)
        store.edit(post)
        XCTAssertEqual(store.draft.body, "Changed")
    }

    func testNewPostKeepsTextAlreadyBeingWritten() {
        let store = store()
        store.draft.body = "Half a thought"
        store.startNew()
        XCTAssertEqual(store.draft.body, "Half a thought")
        store.edit(post)
        store.startNew()
        XCTAssertTrue(store.draft.isBlank)
    }
}
