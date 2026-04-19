import Foundation

struct ListSelectionBehavior {
  static func selectionAfterMaterializingEmptyListItem(
    hasContent: Bool,
    previousCharacter: Character?,
    editedRange: NSRange,
    insertedMarkerLength: Int,
    attributeValueIsPresent: Bool
  ) -> NSRange {
    guard insertedMarkerLength > 0,
          attributeValueIsPresent,
          editedRange.length == 0
    else {
      return NSRange(location: editedRange.location + insertedMarkerLength, length: 0)
    }

    if editedRange.location == 0 {
      return NSRange(location: editedRange.location, length: insertedMarkerLength)
    }

    guard hasContent,
          editedRange.location > 0,
          previousCharacter == "\n"
    else {
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
  hasContent: false,
  previousCharacter: nil,
  editedRange: NSRange(location: 0, length: 0),
  insertedMarkerLength: 1,
  attributeValueIsPresent: true
)
assertEqual(
  startOfDocument,
  NSRange(location: 0, length: 1),
  "first toolbar-created bullet at document start should select the filler"
)

let emptyParagraphAfterExistingNewline = ListSelectionBehavior.selectionAfterMaterializingEmptyListItem(
  hasContent: true,
  previousCharacter: "\n",
  editedRange: NSRange(location: 1, length: 0),
  insertedMarkerLength: 1,
  attributeValueIsPresent: true
)
assertEqual(
  emptyParagraphAfterExistingNewline,
  NSRange(location: 1, length: 1),
  "first toolbar-created bullet in an already-materialized empty paragraph should also select the filler"
)

let laterContinuation = ListSelectionBehavior.selectionAfterMaterializingEmptyListItem(
  hasContent: true,
  previousCharacter: "x",
  editedRange: NSRange(location: 5, length: 0),
  insertedMarkerLength: 1,
  attributeValueIsPresent: true
)
assertEqual(
  laterContinuation,
  NSRange(location: 6, length: 0),
  "later list continuations without paragraph-start context should keep the caret after the filler"
)

print("ok")
