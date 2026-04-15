import ExpoModulesCore
import UIKit

/// Phase B smoke-test view. Renders a centered "Unfold Editor WIP" label
/// in the bundled Inter-Regular font, plus a small diagnostic line showing
/// which PostScript name actually resolved. If the diagnostic shows
/// "SYSTEM FALLBACK", the bundled font didn't load and the bundling path
/// is broken — that's the signal this smoke test is designed to catch.
final class UnfoldEditorView: ExpoView {

  private let titleLabel = UILabel()
  private let diagnosticLabel = UILabel()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    UnfoldEditorFontLoader.registerIfNeeded()

    backgroundColor = UIColor.systemBackground

    let resolvedName = UnfoldEditorFontLoader.resolvedInterPostScriptName()
    let preferred = resolvedName.flatMap { UIFont(name: $0, size: 32) }
    let titleFont = preferred ?? UIFont.systemFont(ofSize: 32, weight: .regular)

    titleLabel.text = "Unfold Editor WIP"
    titleLabel.font = titleFont
    titleLabel.textColor = UIColor.label
    titleLabel.textAlignment = .center
    titleLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(titleLabel)

    let diagnosticText: String
    if let resolvedName {
      diagnosticText = "font: \(resolvedName)"
    } else {
      diagnosticText = "font: SYSTEM FALLBACK (bundling failed)"
    }
    diagnosticLabel.text = diagnosticText
    diagnosticLabel.font = UIFont.monospacedSystemFont(ofSize: 12, weight: .regular)
    diagnosticLabel.textColor = UIColor.secondaryLabel
    diagnosticLabel.textAlignment = .center
    diagnosticLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(diagnosticLabel)

    NSLayoutConstraint.activate([
      titleLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
      titleLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
      titleLabel.leadingAnchor.constraint(greaterThanOrEqualTo: leadingAnchor, constant: 16),
      titleLabel.trailingAnchor.constraint(lessThanOrEqualTo: trailingAnchor, constant: -16),

      diagnosticLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 12),
      diagnosticLabel.centerXAnchor.constraint(equalTo: centerXAnchor),
    ])
  }
}
