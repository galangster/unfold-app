import UIKit
import Proton

/// A transparent overlay positioned as a sibling of the editor (same bounds).
/// Draws line decorations (blockquote bars, code block backgrounds) on top of
/// the editor by walking the attributed string and asking the underlying
/// UITextInput for line geometry.
///
/// The overlay is fully non-interactive (`isUserInteractionEnabled = false`):
/// any interactive view sitting on top of a Proton `EditorView` breaks
/// long-press-drag text selection because iOS 16+ uses `UITextInteraction`
/// (UIInteraction framework), which consults the view hierarchy for touch
/// ownership — returning `nil` from `hitTest` isn't sufficient for those
/// pathways. Checklist marker taps are handled by a `UITapGestureRecognizer`
/// on the editor (see `UnfoldEditorController`) instead.
final class LineDecorationOverlay: UIView {
  weak var editor: EditorView?

  init() {
    super.init(frame: .zero)
    backgroundColor = .clear
    isUserInteractionEnabled = false
    contentMode = .redraw
  }

  required init?(coder: NSCoder) { nil }

  /// Call when the editor's text or layout changes so the overlay redraws.
  func invalidate() {
    setNeedsDisplay()
  }

  override func draw(_ rect: CGRect) {
    guard let editor = editor else { return }
    let attributedText = editor.attributedText
    guard attributedText.length > 0 else { return }
    let nsString = attributedText.string as NSString
    let textInput = editor.textInput
    guard let cgContext = UIGraphicsGetCurrentContext() else { return }

    // The overlay is now a sibling of the editor (same bounds), not inside
    // the scroll view. Offset all rects by the negative content offset so
    // decorations track the scrolled content.
    let scrollOffset = editor.scrollView.contentOffset

    // Walk paragraphs once and draw both blockquote bars and code block
    // backgrounds.
    var paragraphStart = 0
    while paragraphStart < nsString.length {
      let paragraphRange = nsString.paragraphRange(
        for: NSRange(location: paragraphStart, length: 0))
      defer { paragraphStart = NSMaxRange(paragraphRange) }

      // Check first character for block marker; if missing, also check the
      // last character (the \n terminator) because UITextView's typingAttributes
      // ignores custom keys — typed text won't inherit the marker, but the
      // terminator set by the continuation handler retains it.
      var blockMarker = attributedText.attribute(
        .unfoldBlockType,
        at: paragraphRange.location,
        effectiveRange: nil) as? String
      if blockMarker == nil, paragraphRange.length > 1 {
        let lastIdx = NSMaxRange(paragraphRange) - 1
        blockMarker = attributedText.attribute(
          .unfoldBlockType, at: lastIdx, effectiveRange: nil) as? String
      }
      let paragraphStyle = attributedText.attribute(
        .paragraphStyle,
        at: paragraphRange.location,
        effectiveRange: nil) as? NSParagraphStyle
      let isListItem = attributedText.attribute(
        .listItem,
        at: paragraphRange.location,
        effectiveRange: nil) != nil

      let isCodeBlock = blockMarker == "codeBlock"
      var isBlockquote = blockMarker == "blockquote"

      // Fallback: UITextView strips custom NSAttributedString keys from
      // typingAttributes, so typed text on blockquote continuation lines
      // loses the .unfoldBlockType marker. Detect blockquotes by paragraph
      // style (headIndent >= 16) as a secondary signal — standard attributes
      // ARE propagated across Enter. Exclude list items (own indent scheme).
      if !isBlockquote && !isCodeBlock && !isListItem {
        if let ps = paragraphStyle, ps.headIndent >= 16 {
          isBlockquote = true
        }
      }

      guard isCodeBlock || isBlockquote else { continue }

      // Compute line rects for the paragraph via UITextInput so we get the
      // exact on-screen geometry (including soft-wrap and heading heights).
      let textPositionStart = textInput.position(from: textInput.beginningOfDocument, offset: paragraphRange.location)
      let textPositionEnd = textInput.position(from: textInput.beginningOfDocument, offset: NSMaxRange(paragraphRange))
      guard let from = textPositionStart, let to = textPositionEnd,
            let textRange = textInput.textRange(from: from, to: to) else { continue }
      let rects = textInput.selectionRects(for: textRange)

      if isCodeBlock {
        // Union every line rect into a single rounded background covering
        // the full width of the editor's text area — matches how Xcode,
        // Ulysses, and Bear render code blocks (full-bleed, not tight).
        var unionRect: CGRect = .null
        for selRect in rects {
          guard let r = selRect as? UITextSelectionRect else { continue }
          var line = r.rect
          line.origin.y -= scrollOffset.y
          line.origin.x -= scrollOffset.x
          guard line.height > 1, line.width > 1 else { continue }
          unionRect = unionRect.union(line)
        }
        guard !unionRect.isNull else { continue }
        let codeRect = CGRect(
          x: max(0, unionRect.minX - 4),
          y: unionRect.minY - 4,
          width: bounds.width - max(0, unionRect.minX - 4) - 16,
          height: unionRect.height + 8)
        let path = UIBezierPath(roundedRect: codeRect, cornerRadius: 6)
        cgContext.saveGState()
        cgContext.setFillColor(UnfoldColors.inputBackground.cgColor)
        path.fill()
        cgContext.restoreGState()
      } else if isBlockquote {
        cgContext.setFillColor(UnfoldColors.accent.cgColor)
        for selRect in rects {
          guard let rect = selRect as? UITextSelectionRect else { continue }
          var r = rect.rect
          r.origin.y -= scrollOffset.y
          r.origin.x -= scrollOffset.x
          guard r.height > 1, r.width > 1 else { continue }
          // Draw a 3pt accent bar at the left edge, slightly inset
          let bar = CGRect(
            x: r.minX - 12,
            y: r.minY,
            width: 3,
            height: r.height)
          cgContext.fill(bar)
        }
      }
    }
  }

}
