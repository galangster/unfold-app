import Foundation

struct ScriptureInsertionBehavior {
  static func apply(document: NSString, selectedRange: NSRange, insertedText: NSString) -> (text: String, cursor: NSRange) {
    let result = NSMutableString(string: document)
    result.replaceCharacters(in: selectedRange, with: insertedText as String)
    let cursor = NSRange(location: selectedRange.location + insertedText.length, length: 0)
    return (result as String, cursor)
  }
}

func assertEqual(_ lhs: String, _ rhs: String, _ message: String) {
  guard lhs == rhs else {
    fputs("Assertion failed: \(message)\nExpected: \(rhs)\nActual:   \(lhs)\n", stderr)
    exit(1)
  }
}

func assertEqual(_ lhs: NSRange, _ rhs: NSRange, _ message: String) {
  guard NSEqualRanges(lhs, rhs) else {
    fputs("Assertion failed: \(message)\nExpected: \(NSStringFromRange(rhs))\nActual:   \(NSStringFromRange(lhs))\n", stderr)
    exit(1)
  }
}

let inserted = "[SCRIPTURE][BODY]" as NSString

let middleInsertion = ScriptureInsertionBehavior.apply(
  document: "Before After" as NSString,
  selectedRange: NSRange(location: 7, length: 0),
  insertedText: inserted
)
assertEqual(
  middleInsertion.text,
  "Before [SCRIPTURE][BODY]After",
  "scripture insertion should happen at the active caret, not append to the end"
)
assertEqual(
  middleInsertion.cursor,
  NSRange(location: 7 + inserted.length, length: 0),
  "caret should move to the end of the inserted scripture block"
)

let rangeReplacement = ScriptureInsertionBehavior.apply(
  document: "Hello world" as NSString,
  selectedRange: NSRange(location: 6, length: 5),
  insertedText: inserted
)
assertEqual(
  rangeReplacement.text,
  "Hello [SCRIPTURE][BODY]",
  "selected text should be replaced in place by the scripture block"
)
assertEqual(
  rangeReplacement.cursor,
  NSRange(location: 6 + inserted.length, length: 0),
  "caret should collapse after replacing a selection with scripture"
)

print("ok")
