import UIKit
import Proton

/// A transparent overlay positioned in the editor's scroll-view content area.
/// Draws line decorations (blockquote bars, code block backgrounds) behind
/// the text by walking the attributed string and asking the underlying
/// UITextInput for line geometry.
///
/// Touch handling is intentionally disabled. The RN/Expo host needs UIKit's
/// own `UITextInteraction` to receive long-press-drag touches directly, so
/// checklist taps are handled by a separate gesture recognizer on the editor.
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

    // Walk paragraphs once and draw both blockquote bars and code block
    // backgrounds.
    var paragraphStart = 0
    while paragraphStart < nsString.length {
      let paragraphRange = nsString.paragraphRange(
        for: NSRange(location: paragraphStart, length: 0))
      defer { paragraphStart = NSMaxRange(paragraphRange) }

      let blockMarker = attributedText.attribute(
        .unfoldBlockType,
        at: paragraphRange.location,
        effectiveRange: nil) as? String

      // Detect by explicit block marker only. Using a paragraph-style heuristic
      // (headIndent >= 16) is unreliable because Proton's ListTextProcessor
      // can leave orphaned headIndent on paragraphs that have lost their
      // `.listItem` attribute (e.g. after Enter on a nested bullet),
      // producing phantom "blockquote" bars on indented list lines.
      let isCodeBlock = blockMarker == "codeBlock"
      let isBlockquote = blockMarker == "blockquote"

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
          let line = r.rect
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
          let r = rect.rect
          guard r.height > 1, r.width > 1 else { continue }
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
