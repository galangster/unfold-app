import Foundation

struct ScriptureRef: Hashable {
  let rawText: String
  let range: NSRange
}

enum ScriptureRefParser {
  /// Protestant canon (66 books) with common abbreviations.
  /// Optional numeric prefix supports "1 Corinthians", "2 Samuel", "3 John", etc.
  /// Captures patterns like "John 3:16", "Gen 1:1-3", "1 Cor 13:4-7".
  private static let books: [String] = [
    // Old Testament
    "Genesis", "Gen",
    "Exodus", "Exod", "Ex",
    "Leviticus", "Lev",
    "Numbers", "Num",
    "Deuteronomy", "Deut", "Dt",
    "Joshua", "Josh", "Jos",
    "Judges", "Judg", "Jdg",
    "Ruth",
    "Samuel", "Sam",
    "Kings", "Kgs",
    "Chronicles", "Chr",
    "Ezra",
    "Nehemiah", "Neh",
    "Esther", "Est",
    "Job",
    "Psalms", "Psalm", "Ps",
    "Proverbs", "Prov", "Pr",
    "Ecclesiastes", "Eccl", "Ecc",
    "Song of Songs", "Song", "Sos",
    "Isaiah", "Isa", "Is",
    "Jeremiah", "Jer",
    "Lamentations", "Lam",
    "Ezekiel", "Ezek", "Ez",
    "Daniel", "Dan",
    "Hosea", "Hos",
    "Joel",
    "Amos",
    "Obadiah", "Obad",
    "Jonah", "Jon",
    "Micah", "Mic",
    "Nahum", "Nah",
    "Habakkuk", "Hab",
    "Zephaniah", "Zeph",
    "Haggai", "Hag",
    "Zechariah", "Zech",
    "Malachi", "Mal",
    // New Testament
    "Matthew", "Matt", "Mt",
    "Mark", "Mk",
    "Luke", "Lk",
    "John", "Jn",
    "Acts",
    "Romans", "Rom",
    "Corinthians", "Cor",
    "Galatians", "Gal",
    "Ephesians", "Eph",
    "Philippians", "Phil", "Php",
    "Colossians", "Col",
    "Thessalonians", "Thess", "Thes",
    "Timothy", "Tim",
    "Titus", "Tit",
    "Philemon", "Phlm",
    "Hebrews", "Heb",
    "James", "Jas",
    "Peter", "Pet",
    "Jude",
    "Revelation", "Rev",
  ]

  private static let pattern: NSRegularExpression = {
    // Order books by length descending so longer names match before shorter abbreviations
    let sorted = books.sorted { $0.count > $1.count }
    let escaped = sorted.map { NSRegularExpression.escapedPattern(for: $0) }.joined(separator: "|")
    // Optional leading digit prefix ("1 ", "2 ", "3 ") for numbered books
    // then book name, whitespace, chapter, optional :verse or :verse-verse.
    //
    // Trailing anchor is a negative lookahead instead of `\b` so that refs
    // followed by stray garbage characters still extract the full verse.
    // `\b` treats digit→letter as non-boundary (both word chars), which would
    // cut `John 3:16Z` down to `John 3`. `(?![:\d])` says "next char is not
    // colon or digit" — any letter/space/punct is fine and the verse stays.
    let source = #"\b(?:[123]\s+)?(?:"# + escaped + #")\s+\d+(?::\d+(?:-\d+)?)?(?![:\d])"#
    return try! NSRegularExpression(pattern: source, options: [.caseInsensitive])
  }()

  static func extract(from text: String) -> [ScriptureRef] {
    let nsText = text as NSString
    let range = NSRange(location: 0, length: nsText.length)
    let matches = pattern.matches(in: text, options: [], range: range)
    return matches.map { match in
      ScriptureRef(
        rawText: nsText.substring(with: match.range),
        range: match.range
      )
    }
  }
}
