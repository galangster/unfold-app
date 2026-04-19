import Foundation

struct ListSelectionBehavior {
  static func selectionAfterMaterializingEmptyListItem(
    editedRange: NSRange,
    insertedMarkerLength: Int
  ) -> NSRange {
    guard editedRange.location == 0, insertedMarkerLength > 0 else {
      return NSRange(location: editedRange.location + insertedMarkerLength, length: 0)
    }

    return NSRange(location: editedRange.location, length: insertedMarkerLength)
  }
}

func assertEqual(_ lhs: NSRange, _ rhs: NSRange, _ message: String) {
  guard NSEqualRanges(lhs, rhs) else {
    fputs("Assertion failed: \(message)\nExpected: \(NSStringFromRange(rhs))\nActual:   \(NSStringFromRange(lhs))\n", stderr)
    exit(1)
  }
}

let startOfDocument = ListSelectionBehavior.selectionAfterMaterializingEmptyListItem(
  editedRange: NSRange(location: 0, length: 0),
  insertedMarkerLength: 1
)
assertEqual(
  startOfDocument,
  NSRange(location: 0, length: 1),
  "first toolbar-created bullet should select the filler at document start so the first typed character replaces it"
)

let laterParagraph = ListSelectionBehavior.selectionAfterMaterializingEmptyListItem(
  editedRange: NSRange(location: 5, length: 0),
  insertedMarkerLength: 1
)
assertEqual(
  laterParagraph,
  NSRange(location: 6, length: 0),
  "later list continuations should keep the caret after the inserted filler"
)

print("ok")
