import UIKit
import Proton

/// Represents a single checklist item. Stored as the value of the `.listItem`
/// attribute on a paragraph so each item has independent state.
struct ChecklistItem: Hashable {
  var checked: Bool
}

final class UnfoldListFormattingProvider: EditorListFormattingProvider {

  var listLineFormatting: LineFormatting {
    LineFormatting(indentation: 28, spacingBefore: 4)
  }

  func listLineMarkerFor(
    editor: EditorView,
    index: Int,
    level: Int,
    previousLevel: Int,
    attributeValue: Any?
  ) -> ListLineMarker {
    if let item = attributeValue as? ChecklistItem {
      return checklistMarker(checked: item.checked)
    }
    if (attributeValue as? String) == "ordered" {
      return orderedMarker(index: index, level: level)
    }
    return bulletMarker(level: level)
  }

  private func orderedMarker(index: Int, level: Int) -> ListLineMarker {
    let zeroIndexed = max(0, level - 1)
    let label: String
    switch zeroIndexed % 3 {
    case 0: label = "\(index + 1)."
    case 1: label = "\(alphaLabel(index))."
    default: label = "\(romanLabel(index))."
    }
    let attr = NSAttributedString(
      string: label,
      attributes: [
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.text,
      ]
    )
    return ListLineMarker.string(attr)
  }

  private func alphaLabel(_ index: Int) -> String {
    let letters = "abcdefghijklmnopqrstuvwxyz"
    let i = index % letters.count
    return String(letters[letters.index(letters.startIndex, offsetBy: i)])
  }

  private func romanLabel(_ index: Int) -> String {
    let pairs: [(Int, String)] = [
      (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
    ]
    var n = index + 1
    var out = ""
    for (val, sym) in pairs {
      while n >= val {
        out += sym
        n -= val
      }
    }
    return out
  }

  private func bulletMarker(level: Int) -> ListLineMarker {
    let zeroIndexed = max(0, level - 1)
    let markers = ["•", "◦", "▪", "–", "›"]
    let marker = markers[zeroIndexed % markers.count]
    let attr = NSAttributedString(
      string: marker,
      attributes: [
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.text,
      ]
    )
    return ListLineMarker.string(attr)
  }

  private func checklistMarker(checked: Bool) -> ListLineMarker {
    let config = UIImage.SymbolConfiguration(pointSize: 18, weight: .regular)
    let symbolName = checked ? "checkmark.square.fill" : "square"
    let tint = checked ? UnfoldColors.accent : UnfoldColors.textMuted
    let image = UIImage(systemName: symbolName, withConfiguration: config)?
      .withTintColor(tint, renderingMode: .alwaysOriginal)
      ?? UIImage()
    return .image(image, size: CGSize(width: 18, height: 18))
  }
}
