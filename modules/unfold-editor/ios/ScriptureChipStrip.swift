import UIKit

final class ScriptureChipStrip: UIView {
  var onChipTap: ((ScriptureRef) -> Void)?

  private let scrollView = UIScrollView()
  private let stack = UIStackView()
  private var currentRefs: [ScriptureRef] = []
  /// Controls the chip strip's own height — 0 when empty, 36 when chips exist.
  private var heightConstraint: NSLayoutConstraint!

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    clipsToBounds = true

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

    // Height constraint on self — directly controls this view's height in the
    // parent layout. Start collapsed (no chips = no vertical space).
    heightConstraint = heightAnchor.constraint(equalToConstant: 0)

    NSLayoutConstraint.activate([
      heightConstraint,

      scrollView.topAnchor.constraint(equalTo: topAnchor),
      scrollView.leadingAnchor.constraint(equalTo: leadingAnchor),
      scrollView.trailingAnchor.constraint(equalTo: trailingAnchor),
      scrollView.bottomAnchor.constraint(equalTo: bottomAnchor),

      stack.topAnchor.constraint(equalTo: scrollView.topAnchor),
      stack.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor),
      stack.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor),
      stack.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor),
      stack.heightAnchor.constraint(equalTo: scrollView.heightAnchor),
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

    for ref in unique {
      stack.addArrangedSubview(makeChip(for: ref))
    }

    // Collapse to 0 height when empty so no vertical space is wasted.
    let targetHeight: CGFloat = unique.isEmpty ? 0 : 36
    guard heightConstraint.constant != targetHeight else { return }
    heightConstraint.constant = targetHeight
    superview?.setNeedsLayout()
    superview?.layoutIfNeeded()
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
