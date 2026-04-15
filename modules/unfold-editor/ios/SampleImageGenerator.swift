import UIKit

/// Marker subclass so we can find placeholder attachments in the attributed
/// text and re-render them when the theme changes.
final class UnfoldPlaceholderAttachment: NSTextAttachment {
  var caption: String = "Sample Image"
}

/// Generates a placeholder image with Unfold styling. Used by the seed HTML
/// decoder for the spike — real user-picked photos go through PHPicker and
/// are stored as plain NSTextAttachment (not this subclass).
///
/// Drawn against the CURRENT trait collection so the colors resolve to the
/// active theme. EditorViewController re-renders these on trait change.
enum SampleImageGenerator {
  static func makeImage(width: CGFloat, height: CGFloat, caption: String, traits: UITraitCollection? = nil) -> UIImage {
    let size = CGSize(width: width, height: height)
    let format = UIGraphicsImageRendererFormat()
    if let traits = traits {
      format.preferredRange = .standard
    }
    let renderer = UIGraphicsImageRenderer(size: size, format: format)
    let resolvedTraits = traits ?? UITraitCollection.current
    let bg = UnfoldColors.backgroundElevated.resolvedColor(with: resolvedTraits)
    let bgPure = UnfoldColors.background.resolvedColor(with: resolvedTraits)
    let accent = UnfoldColors.accent.resolvedColor(with: resolvedTraits)
    let textColor = UnfoldColors.text.resolvedColor(with: resolvedTraits)
    return renderer.image { context in
      let cg = context.cgContext

      // Background gradient (theme-resolved)
      let colors = [
        bg.cgColor,
        bgPure.cgColor,
      ]
      let space = CGColorSpaceCreateDeviceRGB()
      let gradient = CGGradient(
        colorsSpace: space,
        colors: colors as CFArray,
        locations: [0, 1])!
      cg.drawLinearGradient(
        gradient,
        start: CGPoint(x: 0, y: 0),
        end: CGPoint(x: 0, y: height),
        options: [])

      // Border
      cg.setStrokeColor(accent.withAlphaComponent(0.6).cgColor)
      cg.setLineWidth(1)
      cg.stroke(CGRect(x: 0.5, y: 0.5, width: width - 1, height: height - 1))

      // Center icon (SF Symbol "photo" rendered as an image)
      let symbolConfig = UIImage.SymbolConfiguration(pointSize: 56, weight: .light)
      if let icon = UIImage(systemName: "photo", withConfiguration: symbolConfig)?
        .withTintColor(accent, renderingMode: .alwaysOriginal) {
        let iconRect = CGRect(
          x: (width - icon.size.width) / 2,
          y: (height - icon.size.height) / 2 - 16,
          width: icon.size.width,
          height: icon.size.height)
        icon.draw(in: iconRect)
      }

      // Caption text
      let paragraphStyle = NSMutableParagraphStyle()
      paragraphStyle.alignment = .center
      let captionAttrs: [NSAttributedString.Key: Any] = [
        .font: UnfoldFonts.bodySemiBold(13),
        .foregroundColor: textColor,
        .paragraphStyle: paragraphStyle,
      ]
      let captionString = NSAttributedString(string: caption, attributes: captionAttrs)
      let captionSize = captionString.boundingRect(
        with: CGSize(width: width, height: 30),
        options: [.usesLineFragmentOrigin],
        context: nil)
      captionString.draw(in: CGRect(
        x: 0,
        y: height - captionSize.height - 16,
        width: width,
        height: captionSize.height))
    }
  }
}
