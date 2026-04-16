import UIKit
import Proton

/// A transparent overlay positioned in the editor's scroll-view content area.
/// Draws line decorations (blockquote bars, code block backgrounds, etc.)
/// behind the text by walking the attributed string and asking the underlying
/// UITextInput for line geometry.
///
/// Hit-test forwards everything except taps in checklist marker zones, which
/// fire the `onChecklistMarkerTap` closure.
final class LineDecorationOverlay: UIView {
  weak var editor: EditorView?
  /// Width of the leftmost zone reserved for checklist marker taps.
  var markerHitZone: CGFloat = 32
  /// Called when the user taps inside the marker hit zone of a checklist line.
  /// The closure receives the character index of the tapped line.
  var onChecklistMarkerTap: ((Int) -> Void)?

  init() {
    super.init(frame: .zero)
    backgroundColor = .clear
    isUserInteractionEnabled = true
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

  // MARK: - Hit testing

  /// Converts a point from the overlay's coordinate space to the editor's
  /// text input coordinate space (accounting for scroll offset).
  private func editorPoint(from overlayPoint: CGPoint) -> CGPoint {
    guard let editor = editor else { return overlayPoint }
    let offset = editor.scrollView.contentOffset
    return CGPoint(x: overlayPoint.x + offset.x, y: overlayPoint.y + offset.y)
  }

  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    // Only intercept taps in the leftmost marker zone for checklist lines.
    // Everything else falls through to the editor underneath.
    guard point.x < markerHitZone, let editor = editor else { return nil }
    let text = editor.attributedText.string as NSString
    let textInput = editor.textInput
    let ep = editorPoint(from: point)
    guard let position = textInput.closestPosition(to: ep) else { return nil }
    let charIndex = textInput.offset(from: textInput.beginningOfDocument, to: position)
    guard charIndex >= 0, charIndex < text.length else { return nil }
    let lineRange = text.lineRange(for: NSRange(location: charIndex, length: 0))
    guard lineRange.length > 0 else { return nil }
    // Only intercept if this line is a checklist item
    let attr = editor.attributedText.attribute(.listItem, at: lineRange.location, effectiveRange: nil)
    guard attr is ChecklistItem else { return nil }
    return self
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
    super.touchesEnded(touches, with: event)
    guard let touch = touches.first, let editor = editor else { return }
    let point = touch.location(in: self)
    let ep = editorPoint(from: point)
    let textInput = editor.textInput
    guard let position = textInput.closestPosition(to: ep) else { return }
    let charIndex = textInput.offset(from: textInput.beginningOfDocument, to: position)
    onChecklistMarkerTap?(charIndex)
  }
}
