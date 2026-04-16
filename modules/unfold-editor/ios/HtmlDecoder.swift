import UIKit
import Proton

/// Minimal HTML → NSAttributedString decoder for Unfold's notebook schema.
///
/// Inverse of `HtmlEncoder`. Parses the same tag set:
/// - `<p>`, `<h1>`, `<h2>`, `<h3>`, `<blockquote>`
/// - `<ul>`, `<ol>`, `<li>` (with `data-level` and `data-checked` for checklists)
/// - `<b>`, `<i>`, `<u>`, `<s>`, `<code>`
/// - `<a href="...">`
///
/// **Spike limitations** (handled in Phase A):
/// - No `<img>` parsing yet
/// - No `<pre><code>` code block parsing (only inline `<code>`)
/// - HTML entities only decoded for `&amp; &lt; &gt; &quot;`
/// - Tag matching is regex-based, not a real parser. Works for our schema only.
enum HtmlDecoder {

  static func decode(_ html: String) -> NSAttributedString {
    let result = NSMutableAttributedString()
    let blocks = splitIntoBlocks(html)
    for block in blocks {
      let attributed = renderBlock(block)
      result.append(attributed)
    }
    // Strip trailing newline — but only when there's OTHER content before
    // it. For a single-block document like `<pre><code></code></pre>` or
    // `<p></p>`, the only character in `result` is the block-terminating
    // newline, and that newline carries the block-identity attributes
    // (`.unfoldBlockType`, `.listItem`, etc.). Stripping it would drop the
    // block type entirely and make the document round-trip as `""`.
    if result.length > 1,
       (result.string as NSString).substring(from: result.length - 1) == "\n" {
      result.deleteCharacters(in: NSRange(location: result.length - 1, length: 1))
    }
    return result
  }

  // MARK: - Block splitter

  private struct Block {
    let tag: String          // "p", "h1", "h2", "h3", "blockquote", "li", "ul", "ol"
    let attrs: [String: String]
    let content: String      // inner HTML (may contain inline tags)
  }

  /// Splits HTML into top-level block elements in DOCUMENT ORDER. Recurses
  /// into `<ul>`/`<ol>` for `<li>` items. Self-closing `<img />` is a block.
  private static func splitIntoBlocks(_ html: String) -> [Block] {
    // Collect (location, [Block]) pairs from BOTH regex passes so we can
    // emit blocks in source order.
    var positionedBlocks: [(location: Int, blocks: [Block])] = []
    // Ranges claimed by the block-element pass. The self-closing <img>
    // pass must skip any match inside a claimed range — otherwise a
    // literal `<img>` inside a `<pre>` block gets hoisted out as a real
    // attachment (Codex M4). Range covers the full `<tag>...</tag>`.
    var claimedRanges: [NSRange] = []

    // Block-element pass. `pre` is matched WITHOUT `<code>` — the `<code>`
    // child tag is peeled off in renderBlock so its monospace font applies
    // to the entire block rather than a single inline run.
    //
    // `pre` MUST come before `p` in the alternation. NSRegularExpression
    // tries alternatives left-to-right — at an input position of `<pre>`,
    // if `p` is tried first it matches `<p`, captures `re` as attrs, then
    // looks for `</p>`. In a standalone `<pre>...</pre>`, `</p>` literal
    // never appears (it's `</pre>`) so `p` fails and the engine backtracks
    // to `pre`. BUT in a mixed document like
    // `<pre><code>x</code></pre><p>y</p>`, the `p` alternative succeeds by
    // capturing across the `<pre>` into the next `</p>`, swallowing the
    // entire code block. Putting `pre` first avoids the backtrack trap.
    let pattern = #"<(pre|p|h1|h2|h3|blockquote|ul|ol)([^>]*)>([\s\S]*?)</\1>"#
    if let regex = try? NSRegularExpression(pattern: pattern, options: []) {
      let range = NSRange(html.startIndex..<html.endIndex, in: html)
      regex.enumerateMatches(in: html, options: [], range: range) { match, _, _ in
        guard let match = match,
              let tagRange = Range(match.range(at: 1), in: html),
              let attrRange = Range(match.range(at: 2), in: html),
              let contentRange = Range(match.range(at: 3), in: html) else { return }
        let tag = String(html[tagRange])
        let attrs = parseAttrs(String(html[attrRange]))
        let content = String(html[contentRange])
        let location = match.range.location

        if tag == "ul" || tag == "ol" {
          var liBlocks: [Block] = []
          let listType = tag
          let listAttrs = attrs
          let liPattern = #"<li([^>]*)>([\s\S]*?)</li>"#
          if let liRegex = try? NSRegularExpression(pattern: liPattern, options: []) {
            let liRange = NSRange(content.startIndex..<content.endIndex, in: content)
            liRegex.enumerateMatches(in: content, options: [], range: liRange) { liMatch, _, _ in
              guard let liMatch = liMatch,
                    let liAttrRange = Range(liMatch.range(at: 1), in: content),
                    let liContentRange = Range(liMatch.range(at: 2), in: content) else { return }
              var combinedAttrs = listAttrs
              combinedAttrs.merge(parseAttrs(String(content[liAttrRange]))) { _, new in new }
              combinedAttrs["__listType"] = listType
              liBlocks.append(Block(
                tag: "li",
                attrs: combinedAttrs,
                content: String(content[liContentRange])))
            }
          }
          positionedBlocks.append((location, liBlocks))
        } else {
          positionedBlocks.append((location, [Block(tag: tag, attrs: attrs, content: content)]))
        }
        claimedRanges.append(match.range)
      }
    }

    // Self-closing <img /> pass. Skips any match whose start location is
    // inside a claimed range — that img is literal text inside a container
    // (usually a `<pre>` code block containing HTML sample code), not a
    // real image.
    let imgPattern = #"<img([^>]*?)/>"#
    if let imgRegex = try? NSRegularExpression(pattern: imgPattern, options: []) {
      let imgRange = NSRange(html.startIndex..<html.endIndex, in: html)
      imgRegex.enumerateMatches(in: html, options: [], range: imgRange) { match, _, _ in
        guard let match = match,
              let attrRange = Range(match.range(at: 1), in: html) else { return }
        let loc = match.range.location
        if claimedRanges.contains(where: { NSLocationInRange(loc, $0) }) {
          return
        }
        positionedBlocks.append((
          loc,
          [Block(tag: "img", attrs: parseAttrs(String(html[attrRange])), content: "")]
        ))
      }
    }

    // Sort by location to get document order, then flatten
    positionedBlocks.sort { $0.location < $1.location }
    return positionedBlocks.flatMap { $0.blocks }
  }

  private static func parseAttrs(_ raw: String) -> [String: String] {
    var result: [String: String] = [:]
    let pattern = #"(\w[\w-]*)="([^"]*)""#
    guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else { return result }
    let range = NSRange(raw.startIndex..<raw.endIndex, in: raw)
    regex.enumerateMatches(in: raw, options: [], range: range) { match, _, _ in
      guard let match = match,
            let keyRange = Range(match.range(at: 1), in: raw),
            let valueRange = Range(match.range(at: 2), in: raw) else { return }
      result[String(raw[keyRange])] = String(raw[valueRange])
    }
    return result
  }

  // MARK: - Block rendering

  private static func renderBlock(_ block: Block) -> NSAttributedString {
    // <img> blocks: try to load a real image from `src`. If the file
    // exists, use `UnfoldImageAttachment` (preserves the URI for
    // round-trip). Otherwise fall back to `UnfoldPlaceholderAttachment`
    // (theme-aware generated image).
    if block.tag == "img" {
      let width = CGFloat(Int(block.attrs["width"] ?? "320") ?? 320)
      let height = CGFloat(Int(block.attrs["height"] ?? "200") ?? 200)
      let bounds = CGRect(x: 0, y: 0, width: width, height: height)
      let src = block.attrs["src"] ?? ""

      let attachment: NSTextAttachment
      if !src.isEmpty, src != "placeholder", let image = loadImage(from: src) {
        attachment = UnfoldImageAttachment(image: image, sourceURI: src, bounds: bounds)
      } else {
        let placeholder = UnfoldPlaceholderAttachment()
        placeholder.caption = "Sample Image"
        placeholder.image = SampleImageGenerator.makeImage(
          width: width, height: height, caption: placeholder.caption)
        placeholder.bounds = bounds
        attachment = placeholder
      }

      let result = NSMutableAttributedString(attachment: attachment)
      result.append(NSAttributedString(string: "\n", attributes: [
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.text,
      ]))
      return result
    }

    // <pre><code>...</code></pre> is a code block. Peel off the wrapping
    // <code> tag before running the inline renderer so the monospace styling
    // comes from the block-level attributes instead of an inner `<code>`
    // span (which would trigger inline <code> background for each run).
    //
    // Use a regex that allows attributes on <code> (e.g.
    // `<code class="lang-swift">`) so language-tagged blocks unwrap cleanly
    // instead of falling through to renderInline as an inline `<code>` span.
    // DO NOT trim whitespace inside <pre> — leading spaces are semantically
    // significant in code, and trimming a `<pre><code>   </code></pre>`
    // block yields empty content that silently loses the code-block marker.
    var content = block.content
    var isCodeBlock = false
    if block.tag == "pre" {
      isCodeBlock = true
      let unwrapPattern = #"^\s*<code(?:\s+[^>]*)?>([\s\S]*?)</code>\s*$"#
      if let regex = try? NSRegularExpression(pattern: unwrapPattern, options: []),
         let match = regex.firstMatch(
          in: content,
          options: [],
          range: NSRange(content.startIndex..<content.endIndex, in: content)),
         let innerRange = Range(match.range(at: 1), in: content) {
        content = String(content[innerRange])
      }
    }

    // Code blocks render their content as literal text — inline HTML tags
    // (<b>, <i>, <img>, etc.) are part of the literal code, not markup to
    // tokenize. Only HTML entities get decoded so `&lt;` becomes `<`.
    // Regular blocks run through the inline tokenizer for styled runs.
    let inline: NSAttributedString = isCodeBlock
      ? NSAttributedString(string: decodeEntities(content))
      : renderInline(content)
    let mutable = NSMutableAttributedString(attributedString: inline)

    let paragraphRange = NSRange(location: 0, length: mutable.length)
    let (font, paragraphStyle, listItem, fgColor): (UIFont, NSParagraphStyle, Any?, UIColor) = {
      switch block.tag {
      case "h1":
        let style = NSMutableParagraphStyle()
        style.paragraphSpacing = 8
        style.paragraphSpacingBefore = 16
        style.lineHeightMultiple = 1.15
        return (UnfoldFonts.h1, style, nil, UnfoldColors.text)
      case "h2":
        let style = NSMutableParagraphStyle()
        style.paragraphSpacing = 8
        style.paragraphSpacingBefore = 12
        style.lineHeightMultiple = 1.15
        return (UnfoldFonts.h2, style, nil, UnfoldColors.text)
      case "h3":
        let style = NSMutableParagraphStyle()
        style.paragraphSpacing = 8
        style.paragraphSpacingBefore = 10
        style.lineHeightMultiple = 1.15
        return (UnfoldFonts.h3, style, nil, UnfoldColors.text)
      case "blockquote":
        let style = NSMutableParagraphStyle()
        style.firstLineHeadIndent = 16
        style.headIndent = 16
        style.paragraphSpacing = 8
        style.paragraphSpacingBefore = 8
        return (UnfoldFonts.bodyItalic(), style, nil, UnfoldColors.textMuted)
      case "pre":
        let style = NSMutableParagraphStyle()
        // 12pt padding on the left so text doesn't sit flush against the
        // background edge drawn by LineDecorationOverlay.
        style.firstLineHeadIndent = 12
        style.headIndent = 12
        style.paragraphSpacing = 8
        style.paragraphSpacingBefore = 8
        style.lineHeightMultiple = 1.2
        return (
          UIFont.monospacedSystemFont(ofSize: 15, weight: .regular),
          style,
          nil,
          UnfoldColors.text
        )
      case "li":
        let level = max(1, Int(block.attrs["data-level"] ?? "1") ?? 1)
        let style = NSMutableParagraphStyle()
        let indent = CGFloat(level - 1) * 28
        style.firstLineHeadIndent = indent
        style.headIndent = indent
        style.paragraphSpacing = 4
        // Accept both native format (`data-type="checklist"` on <ul>) and
        // tentap format (`data-type="taskList"` on <ul> + `data-type="taskItem"` on <li>).
        let isChecklist = block.attrs["__listType"] == "ul"
          && (block.attrs["data-type"] == "checklist"
              || block.attrs["data-type"] == "taskList"
              || block.attrs["data-type"] == "taskItem")
        let isOrdered = block.attrs["__listType"] == "ol"
        let listValue: Any = if isChecklist {
          ChecklistItem(checked: block.attrs["data-checked"] == "true")
        } else if isOrdered {
          "ordered" as Any
        } else {
          "bullet" as Any
        }
        let isChecked = (listValue as? ChecklistItem)?.checked ?? false
        return (
          UnfoldFonts.body(),
          style,
          listValue,
          isChecked ? UnfoldColors.textMuted : UnfoldColors.text
        )
      default: // "p"
        let style = NSMutableParagraphStyle()
        style.paragraphSpacing = 4
        return (UnfoldFonts.body(), style, nil, UnfoldColors.text)
      }
    }()

    if mutable.length > 0 {
      // Apply block-level attributes to the entire paragraph, but only for character runs
      // that don't already have an explicit font (so inline tags survive)
      mutable.enumerateAttribute(.font, in: paragraphRange, options: []) { value, runRange, _ in
        if value == nil {
          mutable.addAttribute(.font, value: font, range: runRange)
        }
      }
      mutable.addAttribute(.paragraphStyle, value: paragraphStyle, range: paragraphRange)
      // Only set foreground color if not already set (preserves inline link colors etc.)
      mutable.enumerateAttribute(.foregroundColor, in: paragraphRange, options: []) { value, runRange, _ in
        if value == nil {
          mutable.addAttribute(.foregroundColor, value: fgColor, range: runRange)
        }
      }
      if let listItem = listItem {
        mutable.addAttribute(.listItem, value: listItem, range: paragraphRange)
      }
      if isCodeBlock {
        // Force monospace on the entire range (overriding inline <code>
        // attributes that renderInline already applied) and mark the
        // paragraph so the encoder + overlay recognize it.
        mutable.addAttribute(.font, value: font, range: paragraphRange)
        mutable.addAttribute(.unfoldBlockType, value: "codeBlock", range: paragraphRange)
      }
      // Strikethrough for checked items
      if let item = listItem as? ChecklistItem, item.checked {
        mutable.addAttributes([
          .strikethroughStyle: NSUnderlineStyle.single.rawValue,
          .strikethroughColor: UnfoldColors.textMuted,
        ], range: paragraphRange)
      }
    }

    // Append a newline to terminate the block. The terminator MUST carry
    // the same block-level attributes (including `.unfoldBlockType` and any
    // `.listItem`) so that a content-less block like
    // `<pre><code></code></pre>` survives the encode→decode→encode loop.
    // Without this, an empty code block's only character is a newline with
    // no marker, and the re-encode misclassifies it as an empty `<p>`.
    var terminatorAttrs: [NSAttributedString.Key: Any] = [
      .font: font,
      .paragraphStyle: paragraphStyle,
    ]
    if isCodeBlock {
      terminatorAttrs[.unfoldBlockType] = "codeBlock"
    }
    if let listItem = listItem {
      terminatorAttrs[.listItem] = listItem
    }
    mutable.append(NSAttributedString(string: "\n", attributes: terminatorAttrs))

    return mutable
  }

  // MARK: - Inline tag parser

  private static func renderInline(_ html: String) -> NSAttributedString {
    // Tokenize: text + open tag + close tag
    let result = NSMutableAttributedString()
    var index = html.startIndex
    var styleStack: [String] = []
    var hrefStack: [String] = []

    while index < html.endIndex {
      if html[index] == "<" {
        // Parse tag
        guard let endTag = html[index...].firstIndex(of: ">") else { break }
        let tagContent = String(html[html.index(after: index)..<endTag])
        index = html.index(after: endTag)

        if tagContent.hasPrefix("/") {
          // Close tag
          let tagName = String(tagContent.dropFirst())
          if let lastIndex = styleStack.lastIndex(of: tagName) {
            styleStack.remove(at: lastIndex)
          }
          if tagName == "a", !hrefStack.isEmpty {
            hrefStack.removeLast()
          }
        } else {
          // Open tag — extract tag name and attrs
          let parts = tagContent.split(separator: " ", maxSplits: 1)
          let tagName = String(parts[0])
          if tagName == "a" {
            let attrs = parts.count > 1 ? parseAttrs(String(parts[1])) : [:]
            hrefStack.append(attrs["href"] ?? "")
          }
          styleStack.append(tagName)
        }
      } else {
        // Plain text — collect until next tag
        var textEnd = index
        while textEnd < html.endIndex && html[textEnd] != "<" {
          textEnd = html.index(after: textEnd)
        }
        let rawText = String(html[index..<textEnd])
        let decoded = decodeEntities(rawText)
        let attrs = inlineAttributes(forStack: styleStack, hrefStack: hrefStack)
        result.append(NSAttributedString(string: decoded, attributes: attrs))
        index = textEnd
      }
    }
    return result
  }

  private static func inlineAttributes(
    forStack stack: [String],
    hrefStack: [String]
  ) -> [NSAttributedString.Key: Any] {
    var attrs: [NSAttributedString.Key: Any] = [:]
    var traits: UIFontDescriptor.SymbolicTraits = []
    var isMonospace = false
    for tag in stack {
      switch tag {
      case "b", "strong": traits.insert(.traitBold)
      case "i", "em": traits.insert(.traitItalic)
      case "u": attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
      case "s", "del", "strike": attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue
      case "code": isMonospace = true
      default: break
      }
    }
    if isMonospace {
      var font = UIFont.monospacedSystemFont(ofSize: 15, weight: .regular)
      if !traits.isEmpty, let descriptor = font.fontDescriptor.withSymbolicTraits(traits) {
        font = UIFont(descriptor: descriptor, size: font.pointSize)
      }
      attrs[.font] = font
      attrs[.backgroundColor] = UnfoldColors.inputBackground
    } else if !traits.isEmpty {
      // Prefer Inter for single-trait runs (bold or italic), but fall back
      // to the system font when both traits are requested because Inter
      // doesn't ship a BoldItalic variant in this spike. `withSymbolicTraits`
      // returns nil on Inter-Regular's descriptor when we ask for bold+italic,
      // which would silently drop BOTH traits from the decoded run — so the
      // encoder would emit plain text on the way back out.
      let baseFont = UnfoldFonts.body()
      if let descriptor = baseFont.fontDescriptor.withSymbolicTraits(traits) {
        attrs[.font] = UIFont(descriptor: descriptor, size: baseFont.pointSize)
      } else {
        let system = UIFont.systemFont(ofSize: baseFont.pointSize)
        if let descriptor = system.fontDescriptor.withSymbolicTraits(traits) {
          attrs[.font] = UIFont(descriptor: descriptor, size: baseFont.pointSize)
        } else {
          // Extreme fallback — every system font supports bold+italic, so
          // this branch should be unreachable. Keep the plain base font so
          // at least the text isn't lost.
          attrs[.font] = baseFont
        }
      }
    }
    if let href = hrefStack.last, let url = URL(string: href) {
      attrs[.link] = url
      attrs[.foregroundColor] = UnfoldColors.accent
      attrs[.underlineStyle] = NSUnderlineStyle.single.rawValue
    }
    return attrs
  }

  // MARK: - Image loading

  /// Loads a UIImage from a file URI or bare path. Returns nil if the path
  /// doesn't resolve to a decodable image. Same logic as
  /// `UnfoldEditorController.loadImage(from:)`.
  private static func loadImage(from uri: String) -> UIImage? {
    if let url = URL(string: uri), url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }
    return UIImage(contentsOfFile: uri)
  }

  // MARK: - Entity decoding

  private static func decodeEntities(_ s: String) -> String {
    s.replacingOccurrences(of: "&quot;", with: "\"")
      .replacingOccurrences(of: "&gt;", with: ">")
      .replacingOccurrences(of: "&lt;", with: "<")
      .replacingOccurrences(of: "&amp;", with: "&")
  }
}
