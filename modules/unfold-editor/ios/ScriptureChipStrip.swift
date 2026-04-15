import UIKit

final class ScriptureChipStrip: UIView {
  var onChipTap: ((ScriptureRef) -> Void)?

  private let scrollView = UIScrollView()
  private let stack = UIStackView()
  private let emptyLabel = UILabel()
  private var currentRefs: [ScriptureRef] = []

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear

    scrollView.showsHorizontalScrollIndicator = false
    scrollView.alwaysBounceHorizontal = true
    scrollView.translatesAutoresizingMaskIntoConstraints = false
    scrollView.contentInset = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
    addSubview(scrollView)

    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    scrollView.addSubview(stack)

    emptyLabel.text = "Type a scripture reference to see chips"
    emptyLabel.font = .systemFont(ofSize: 13, weight: .regular)
    emptyLabel.textColor = .tertiaryLabel
    emptyLabel.translatesAutoresizingMaskIntoConstraints = false
    addSubview(emptyLabel)

    NSLayoutConstraint.activate([
      scrollView.topAnchor.constraint(equalTo: topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),
      scrollView.heightAnchor.constraint(equalToConstant: 36),

      stack.topAnchor.constraint(equalTo: scrollView.topAnchor),
      stack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
      stack.heightAnchor.constraint(equalTo: scrollView.heightAnchor),

      emptyLabel.centerYAnchor.constraint(equalTo: centerYAnchor),
      emptyLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 16),
    ])
  }

  required init?(coder: NSCoder) { nil }

  func update(with refs: [ScriptureRef]) {
    // Dedupe by raw text so repeated mentions only appear once
    var seen = Set<String>()
    let unique = refs.filter { seen.insert($0.rawText).inserted }
    guard unique != currentRefs else { return }
    currentRefs = unique

    stack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    emptyLabel.isHidden = !unique.isEmpty

    for ref in unique {
      stack.addArrangedSubview(makeChip(for: ref))
    }
  }

  private func makeChip(for ref: ScriptureRef) -> UIView {
    var config = UIButton.Configuration.filled()
    config.title = ref.rawText
    config.baseBackgroundColor = UnfoldColors.accent.withAlphaComponent(0.15)
    config.baseForegroundColor = UnfoldColors.accent
    config.background.strokeColor = UnfoldColors.accent.withAlphaComponent(0.4)
    config.background.strokeWidth = 1.0
    config.cornerStyle = .capsule
    config.contentInsets = NSDirectionalEdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12)
    config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = UnfoldFonts.bodySemiBold(13)
      return outgoing
    }

    let button = UIButton(configuration: config)
    button.accessibilityIdentifier = "chip-\(ref.rawText)"
    button.accessibilityLabel = "Scripture: \(ref.rawText)"
    button.addAction(UIAction { [weak self] _ in self?.onChipTap?(ref) }, for: .touchUpInside)
    return button
  }
}
