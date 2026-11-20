import SwiftUI

/// One block of a rendered Markdown body.
struct MarkdownBlock: Equatable {
    enum Kind: Equatable {
        case paragraph
        case heading(Int)
        /// `marker` is nil for a later paragraph of the same list item.
        case listItem(marker: String?, depth: Int)
        case code
        case rule
        case image(URL)
        case table
    }

    var kind: Kind
    var text = AttributedString()
    var quoted = false
    /// Table cells, header row first. Empty for every other kind.
    var rows: [[AttributedString]] = []

    var plain: String { String(text.characters) }
}

/// Splits Markdown into blocks with Foundation's parser (CommonMark plus tables
/// and strikethrough, like the blog's react-markdown with remark-gfm). Raw HTML
/// is shown as text; the blog drops it too.
enum Markdown {
    static func blocks(_ source: String) -> [MarkdownBlock] {
        let options = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .full, failurePolicy: .returnPartiallyParsedIfPossible)
        guard let parsed = try? AttributedString(markdown: source, options: options) else {
            return source.isEmpty ? [] : [MarkdownBlock(kind: .paragraph, text: AttributedString(source))]
        }

        var blocks: [MarkdownBlock] = []
        var lastIntent: PresentationIntent?
        var lastItem: Int?
        var table: (id: Int, row: Int)?

        for run in parsed.runs {
            var piece = AttributedString(parsed[run.range])
            piece.presentationIntent = nil
            let intent = run.presentationIntent
            let components = intent?.components ?? []

            if let cell = tableCell(in: components) {
                if table?.id != cell.table {
                    blocks.append(MarkdownBlock(kind: .table))
                    table = (cell.table, -1)
                }
                let last = blocks.count - 1
                if table?.row != cell.row {
                    blocks[last].rows.append([])
                    table?.row = cell.row
                }
                var row = blocks[last].rows.removeLast()
                while row.count <= cell.column { row.append(AttributedString()) }
                row[cell.column].append(piece)
                blocks[last].rows.append(row)
                lastIntent = nil
                continue
            }
            table = nil

            if let url = run.imageURL {
                blocks.append(MarkdownBlock(kind: .image(url), text: piece))
                lastIntent = nil
                continue
            }
            if let lastIntent, lastIntent == intent, !blocks.isEmpty {
                blocks[blocks.count - 1].text.append(piece)
                continue
            }
            lastIntent = intent

            var block = MarkdownBlock(kind: .paragraph, text: piece)
            block.quoted = components.contains { $0.kind == .blockQuote }
            let depth = components.filter { $0.kind == .orderedList || $0.kind == .unorderedList }.count
            var item: Int?
            for (index, component) in components.enumerated() {
                switch component.kind {
                case .header(let level): block.kind = .heading(level)
                case .codeBlock:
                    block.kind = .code
                    while block.text.characters.last?.isNewline == true {
                        block.text.characters.removeLast()
                    }
                case .thematicBreak: block.kind = .rule
                case .listItem(let ordinal) where item == nil:
                    item = component.identity
                    let ordered = components.dropFirst(index + 1).first?.kind == .orderedList
                    let marker = ordered ? "\(ordinal)." : "•"
                    block.kind = .listItem(marker: component.identity == lastItem ? nil : marker, depth: depth)
                default: break
                }
            }
            lastItem = item
            blocks.append(block)
        }
        return blocks
    }

    private static func tableCell(in components: [PresentationIntent.IntentType]) -> (table: Int, row: Int, column: Int)? {
        var table: Int?, row: Int?, column: Int?
        for component in components {
            switch component.kind {
            case .table: table = component.identity
            case .tableHeaderRow, .tableRow: row = component.identity
            case .tableCell(let index): column = index
            default: break
            }
        }
        guard let table, let row, let column else { return nil }
        return (table, row, column)
    }
}

/// The post roughly as the blog shows it: title, link, then the rendered body.
struct MarkdownPreview: View {
    let title: String
    let link: String
    let markdown: String

    var body: some View {
        let blocks = Markdown.blocks(markdown)
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if !title.isEmpty {
                    Text(title).font(.title.bold())
                }
                if let url = URL(string: link), !link.isEmpty {
                    Link(destination: url) {
                        Label(url.host() ?? link, systemImage: "link").font(.subheadline)
                    }
                }
                if blocks.isEmpty {
                    Text("Nothing to preview yet.").foregroundStyle(.secondary)
                }
                ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                    MarkdownBlockView(block: block)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .textSelection(.enabled)
        }
    }
}

private struct MarkdownBlockView: View {
    let block: MarkdownBlock

    var body: some View {
        if block.quoted {
            content
                .foregroundStyle(.secondary)
                .padding(.leading, 12)
                .overlay(alignment: .leading) {
                    Capsule().fill(.tertiary).frame(width: 3)
                }
        } else {
            content
        }
    }

    @ViewBuilder private var content: some View {
        switch block.kind {
        case .paragraph:
            Text(block.text)
        case .heading(let level):
            Text(block.text)
                .font(level == 1 ? .title2.bold() : level == 2 ? .title3.bold() : .headline)
                .padding(.top, 4)
                .accessibilityAddTraits(.isHeader)
        case .listItem(let marker, let depth):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(marker ?? "").monospacedDigit().foregroundStyle(.secondary)
                    .frame(minWidth: 18, alignment: .trailing)
                Text(block.text)
            }
            .padding(.leading, CGFloat(max(depth - 1, 0)) * 20)
            .padding(.top, -6)
        case .code:
            ScrollView(.horizontal) {
                Text(block.plain).font(.callout.monospaced()).padding(12)
            }
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
        case .rule:
            Divider().padding(.vertical, 4)
        case .image(let url):
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Label(block.plain.isEmpty ? "Image" : block.plain, systemImage: "photo")
                        .font(.footnote).foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 80)
                        .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 8))
                }
            }
            .accessibilityLabel(block.plain)
        case .table:
            ScrollView(.horizontal) {
                Grid(alignment: .leading, horizontalSpacing: 16, verticalSpacing: 8) {
                    ForEach(Array(block.rows.enumerated()), id: \.offset) { index, row in
                        GridRow {
                            ForEach(Array(row.enumerated()), id: \.offset) { _, cell in
                                Text(cell).fontWeight(index == 0 ? .semibold : .regular)
                            }
                        }
                        if index == 0 { Divider() }
                    }
                }
                .font(.callout)
            }
        }
    }
}
