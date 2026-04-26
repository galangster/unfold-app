import Foundation

struct SimulatedLineState {
  var text: String
  var hasListItem: Bool
  var hasBlockType: Bool
  var font: String
  var foregroundColor: String
  var lineHeightMultiple: Double
  var paragraphSpacingBefore: Double
}

struct ListMetricNormalizationBehavior {
  static func shouldRewriteActualLineAttributes(_ line: SimulatedLineState) -> Bool {
    let blankLineFiller = "\u{200B}"
    let isEmptyListLine = line.text.isEmpty
      || line.text == "\n"
      || line.text == blankLineFiller
      || line.text == "\(blankLineFiller)\n"

    // List commands can leave actual text attributes with heading-era font,
    // block identity, or line-height metrics. Marker/caret geometry samples the
    // actual line attrs, so list-backed lines must be rewritten even when they
    // contain real text rather than only the zero-width filler.
    return isEmptyListLine || line.hasListItem || line.hasBlockType || line.lineHeightMultiple != 0
  }

  static func normalizedLine(_ line: SimulatedLineState) -> SimulatedLineState {
    guard shouldRewriteActualLineAttributes(line) else { return line }

    return SimulatedLineState(
      text: line.text,
      hasListItem: line.hasListItem,
      hasBlockType: false,
      font: "body",
      foregroundColor: "text",
      lineHeightMultiple: 0,
      paragraphSpacingBefore: line.hasListItem ? 4 : 0
    )
  }
}

func assertTrue(_ value: Bool, _ message: String) {
  guard value else {
    fputs("Assertion failed: \(message)\n", stderr)
    exit(1)
  }
}

func assertEqual<T: Equatable>(_ lhs: T, _ rhs: T, _ message: String) {
  guard lhs == rhs else {
    fputs("Assertion failed: \(message)\nExpected: \(rhs)\nActual:   \(lhs)\n", stderr)
    exit(1)
  }
}

let nonEmptyHeadingListLine = SimulatedLineState(
  text: "Heading turned into bullet",
  hasListItem: true,
  hasBlockType: true,
  font: "h1",
  foregroundColor: "text",
  lineHeightMultiple: 1.15,
  paragraphSpacingBefore: 16
)

assertTrue(
  ListMetricNormalizationBehavior.shouldRewriteActualLineAttributes(nonEmptyHeadingListLine),
  "non-empty list lines with stale heading/block metrics must rewrite actual line attrs, not just typingAttributes"
)

let normalized = ListMetricNormalizationBehavior.normalizedLine(nonEmptyHeadingListLine)
assertEqual(normalized.hasListItem, true, "normalization should preserve semantic list identity")
assertEqual(normalized.hasBlockType, false, "normalization should clear stale heading block type")
assertEqual(normalized.font, "body", "normalization should reset actual text font to body")
assertEqual(normalized.lineHeightMultiple, 0, "normalization should reset stale heading line-height metrics")
assertEqual(normalized.paragraphSpacingBefore, 4, "normalization should keep Unfold list spacing before")

let emptyListLine = SimulatedLineState(
  text: "\u{200B}",
  hasListItem: true,
  hasBlockType: true,
  font: "h2",
  foregroundColor: "text",
  lineHeightMultiple: 1.15,
  paragraphSpacingBefore: 12
)
assertTrue(
  ListMetricNormalizationBehavior.shouldRewriteActualLineAttributes(emptyListLine),
  "empty/filler list lines still need actual attr cleanup for caret geometry"
)

print("ok")
