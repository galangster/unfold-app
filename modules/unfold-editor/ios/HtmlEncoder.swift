import UIKit
import Proton

extension NSAttributedString.Key {
  /// Marks a paragraph as a semantic block whose tag is NOT inferable from
  /// font alone. Currently used for code blocks (monospace alone is
  /// ambiguous with inline <code>) — reserved for future uses if we add
  /// more block types (callouts, etc.).
  ///
  /// Value: String. Known values: `"codeBlock"`.
  static let unfoldBlockType = NSAttributedString.Key("unfoldBlockType")
}

/// Minimal NSAttributedString → HTML encoder for Unfold's notebook schema.
///
/// Handles the common cases needed by the spike:
/// - Paragraphs, H1/H2/H3
/// - Bold, italic, underline, strikethrough, inline code
/// - Bullet lists and checklists (FLAT — nesting is encoded in `data-level`
///   attribute, not nested `<ul>` tags. Phase A upgrades to proper nesting.)
/// - Links
/// - Blockquotes
///
/// **Spike limitations** (handled in Phase A):
/// - Lists are flat, not nested via `<ul><li><ul>` — uses `data-level` instead
/// - No inline images yet (no `<img>` emission)
/// - No code blocks (only inline `<code>`)
/// - No HTML escaping of special chars in attribute values
enum HtmlEncoder {

  static func encode(_ attributedString: NSAttributedString) -> String {
    let nsString = attributedString.string as NSString
    var output = ""
    var openListType: String? = nil // "ul", "ol", or "checklist"
    var inCodeBlock = false

    var paragraphStart = 0
    while paragraphStart < nsString.length {
      let paragraphRange = nsString.paragraphRange(
        for: NSRange(location: paragraphStart, length: 0))

      let blockType = detectBlockType(
        in: attributedString,
        range: paragraphRange)

      // Close code block if we're switching out. A multi-line code block
      // appears as multiple consecutive .codeBlock paragraphs (because
      // literal `\n` inside <pre> becomes a paragraph boundary in
      // NSAttributedString); they're joined into one <pre><code> wrapper
      // by opening on the first .codeBlock paragraph and closing on the
      // first non-codeBlock paragraph after it.
      if inCodeBlock, blockType != .codeBlock {
        output += "</code></pre>"
        inCodeBlock = false
      }
      // Close list if we're switching out of a list block
      if let openType = openListType, !blockType.isList {
        output += "</\(listTag(openType))>"
        openListType = nil
      }
      // Open list if we're switching into a list block
      if let listType = blockType.listType, openListType != listType {
        if openListType != nil {
          output += "</\(listTag(openListType!))>"
        }
        output += "<\(listTag(listType))\(blockType == .checklist ? " data-type=\"checklist\"" : "")>"
        openListType = listType
      }

      // Compute block-implicit formatting suppressions. These are inline
      // attributes that the block tag ALREADY communicates; re-emitting
      // them as inline wrappers would be redundant and break round-trip.
      //
      // - Headings are rendered bold → suppress <b> (the <h1>/<h2>/<h3>
      //   tag carries the bold semantics).
      // - Blockquotes are rendered italic → suppress <i>.
      // - Checked checklist items are rendered with strikethrough +
      //   muted color → suppress <s> (data-checked="true" carries it).
      // - Code blocks suppress ALL inline formatting (literal text) and
      //   monospace (<pre><code> implies it).
      //
      // Links are a separate case handled inside encodeInlineRuns — when
      // a run has a .link attribute, its .underlineStyle is suppressed
      // regardless of block type, because the decoder adds underline to
      // links for visual rendering and it's not user-intentional.
      let checkedChecklist = (blockType == .checklist)
        && checklistChecked(in: attributedString, at: paragraphRange.location)
      let suppressBold = (blockType == .heading1 || blockType == .heading2 || blockType == .heading3)
        || blockType == .codeBlock
      let suppressItalic = (blockType == .blockquote)
      let suppressStrikethrough = checkedChecklist
      let suppressMonospace = (blockType == .codeBlock)
      let suppressInlineFormatting = (blockType == .codeBlock)
      let inlineHtml = encodeInlineRuns(
        in: attributedString,
        range: paragraphRange,
        excludeTrailingNewline: true,
        suppressBold: suppressBold,
        suppressItalic: suppressItalic,
        suppressStrikethrough: suppressStrikethrough,
        suppressMonospace: suppressMonospace,
        suppressInlineFormatting: suppressInlineFormatting)

      switch blockType {
      case .heading1:
        output += "<h1>\(inlineHtml)</h1>"
      case .heading2:
        output += "<h2>\(inlineHtml)</h2>"
      case .heading3:
        output += "<h3>\(inlineHtml)</h3>"
      case .blockquote:
        output += "<blockquote>\(inlineHtml)</blockquote>"
      case .codeBlock:
        if !inCodeBlock {
          output += "<pre><code>"
          inCodeBlock = true
        } else {
          // Joining a subsequent .codeBlock paragraph to the already-open
          // wrapper. The `\n` separator reconstructs the literal newline
          // that appeared between lines in the source HTML.
          output += "\n"
        }
        output += inlineHtml
      case .bulletList, .orderedList:
        let level = listLevel(in: attributedString, at: paragraphRange.location)
        output += "<li data-level=\"\(level)\">\(inlineHtml)</li>"
      case .checklist:
        let level = listLevel(in: attributedString, at: paragraphRange.location)
        output += "<li data-level=\"\(level)\" data-checked=\"\(checkedChecklist)\">\(inlineHtml)</li>"
      case .body:
        if !inlineHtml.isEmpty {
          output += "<p>\(inlineHtml)</p>"
        } else {
          output += "<p></p>"
        }
      }

      paragraphStart = NSMaxRange(paragraphRange)
    }

    // Close any trailing open code block (document ended mid-block)
    if inCodeBlock {
      output += "</code></pre>"
    }
    // Close any trailing open list
    if let openType = openListType {
      output += "</\(listTag(openType))>"
    }

    return output
  }

  // MARK: - Block type detection

  private enum BlockType: Equatable {
    case body
    case heading1, heading2, heading3
    case blockquote
    case codeBlock
    case bulletList
    case orderedList
    case checklist

    var isList: Bool {
      self == .bulletList || self == .checklist || self == .orderedList
    }

    var listType: String? {
      switch self {
      case .bulletList: return "ul"
      case .orderedList: return "ol"
      case .checklist: return "checklist"
      default: return nil
      }
    }
  }

  private static func detectBlockType(in str: NSAttributedString, range: NSRange) -> BlockType {
    // Block identity is a property of the paragraph, not of any single
    // character. Sample the FIRST non-nil value of each identity attribute
    // across the whole paragraph range, not just location 0. Sampling
    // location 0 silently downgraded the block type when a user edit at
    // the start of the paragraph produced a character without the marker
    // (Codex M3 — see gotchas/attributed-string-block-identity-not-location-zero.md).

    // Explicit block-type marker wins over any heuristic.
    if firstAttribute(.unfoldBlockType, in: str, range: range) as? String == "codeBlock" {
      return .codeBlock
    }

    if let listValue = firstAttribute(.listItem, in: str, range: range) {
      if listValue is ChecklistItem {
        return .checklist
      }
      if (listValue as? String) == "ordered" {
        return .orderedList
      }
      return .bulletList
    }

    if let font = firstAttribute(.font, in: str, range: range) as? UIFont {
      let isBoldish = font.fontDescriptor.symbolicTraits.contains(.traitBold)
        || font.fontName.lowercased().contains("semibold")
        || font.fontName.lowercased().contains("bold")
      if isBoldish {
        if font.pointSize >= 26 { return .heading1 }
        if font.pointSize >= 20 { return .heading2 }
        if font.pointSize >= 17 { return .heading3 }
      }
    }

    if let style = firstAttribute(.paragraphStyle, in: str, range: range) as? NSParagraphStyle,
       style.headIndent >= 16 {
      return .blockquote
    }

    return .body
  }

  /// Returns the first non-nil value of `key` within `range`, enumerating
  /// left-to-right. Used by `detectBlockType` so block identity can survive
  /// a missing attribute at `range.location`.
  private static func firstAttribute(
    _ key: NSAttributedString.Key,
    in str: NSAttributedString,
    range: NSRange
  ) -> Any? {
    var result: Any? = nil
    str.enumerateAttribute(key, in: range, options: []) { value, _, stop in
      if let value = value {
        result = value
        stop.pointee = true
      }
    }
    return result
  }

  // MARK: - Inline run encoding

  private static func encodeInlineRuns(
    in str: NSAttributedString,
    range: NSRange,
    excludeTrailingNewline: Bool,
    suppressBold: Bool = false,
    suppressItalic: Bool = false,
    suppressStrikethrough: Bool = false,
    suppressMonospace: Bool = false,
    suppressInlineFormatting: Bool = false
  ) -> String {
    var range = range
    let nsString = str.string as NSString
    if excludeTrailingNewline,
       range.length > 0,
       nsString.substring(with: NSRange(location: NSMaxRange(range) - 1, length: 1)) == "\n" {
      range.length -= 1
    }
    guard range.length > 0 else { return "" }

    var output = ""
    str.enumerateAttributes(in: range, options: []) { attrs, runRange, _ in
      // Image attachment: emit <img> tag, skip the object-replacement char as text
      if let attachment = attrs[.attachment] as? NSTextAttachment, attachment.image != nil {
        let width = Int(attachment.bounds.width)
        let height = Int(attachment.bounds.height)
        // Spike: src is a placeholder. Production stores real URLs / data URIs.
        output += "<img src=\"placeholder\" width=\"\(width)\" height=\"\(height)\" />"
        return
      }

      var text = nsString.substring(with: runRange)
      // Filter out object replacement characters (U+FFFC) that aren't real attachments
      text = text.replacingOccurrences(of: "\u{FFFC}", with: "")
      // Filter out zero-width spaces (Proton list item artifacts)
      text = text.replacingOccurrences(of: "\u{200B}", with: "")
      text = escape(text)

      // Wrap text in inline tags based on attributes (innermost first).
      // Inside code blocks, all inline formatting is suppressed — the
      // content is treated as a literal preformatted string.
      //
      // Special cases beyond the `suppress*` flags:
      // - Links carry .underlineStyle as part of their visual rendering;
      //   don't emit a separate <u> wrapper when a .link is present.
      let hasLink = attrs[.link] != nil
      if !suppressInlineFormatting, hasLink {
        let url = (attrs[.link] as? URL)?.absoluteString ?? ""
        text = "<a href=\"\(escape(url))\">\(text)</a>"
      }
      if !suppressInlineFormatting, !suppressStrikethrough,
         let strikeRaw = attrs[.strikethroughStyle] as? Int, strikeRaw != 0 {
        text = "<s>\(text)</s>"
      }
      if !suppressInlineFormatting, !hasLink,
         let underlineRaw = attrs[.underlineStyle] as? Int, underlineRaw != 0 {
        text = "<u>\(text)</u>"
      }
      if let font = attrs[.font] as? UIFont {
        if !suppressMonospace, font.fontDescriptor.symbolicTraits.contains(.traitMonoSpace) {
          text = "<code>\(text)</code>"
        }
        if !suppressInlineFormatting, !suppressItalic,
           font.fontDescriptor.symbolicTraits.contains(.traitItalic) {
          text = "<i>\(text)</i>"
        }
        if !suppressBold, font.fontDescriptor.symbolicTraits.contains(.traitBold) {
          text = "<b>\(text)</b>"
        }
      }
      output += text
    }
    return output
  }

  // MARK: - Helpers

  private static func listTag(_ type: String) -> String {
    type == "checklist" ? "ul" : type
  }

  private static func listLevel(in str: NSAttributedString, at location: Int) -> Int {
    guard let style = str.attribute(.paragraphStyle, at: location, effectiveRange: nil) as? NSParagraphStyle else {
      return 1
    }
    // LineFormatting indentation = 28pt per level. Level 1 = indent 0, level 2 = indent 28, etc.
    let indent = style.firstLineHeadIndent
    return max(1, Int(round(indent / 28)) + 1)
  }

  private static func checklistChecked(in str: NSAttributedString, at location: Int) -> Bool {
    guard let item = str.attribute(.listItem, at: location, effectiveRange: nil) as? ChecklistItem else {
      return false
    }
    return item.checked
  }

  private static func escape(_ s: String) -> String {
    s.replacingOccurrences(of: "&", with: "&amp;")
      .replacingOccurrences(of: "<", with: "&lt;")
      .replacingOccurrences(of: ">", with: "&gt;")
      .replacingOccurrences(of: "\"", with: "&quot;")
  }
}
