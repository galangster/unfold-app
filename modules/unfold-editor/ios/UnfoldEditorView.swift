import ExpoModulesCore
import UIKit

/// Native view hosted by the `unfold-editor` Expo Module.
///
/// Wraps a `UnfoldEditorController` whose root view contains the Proton
/// `EditorView`, the scripture chip strip, and the line decoration overlay.
/// Props come in through `@objc` accessors wired by `UnfoldEditorModule`;
/// events flow out through `EventDispatcher` instances read from the same
/// module definition.
final class UnfoldEditorView: ExpoView {

  let controller: UnfoldEditorController

  // Events emitted back to React Native.
  let onChangeHtml = EventDispatcher()
  let onScriptureRefs = EventDispatcher()
  let onEditorFocus = EventDispatcher()
  let onEditorBlur = EventDispatcher()
  let onEditorSelectionChange = EventDispatcher()

  /// Tracks whether `initialHtml` has been applied yet. RN will push the prop
  /// on first mount (and never again, per the uncontrolled-editor rule in
  /// §10.B.6), but we still guard so a late prop push doesn't nuke in-progress
  /// user edits.
  private var didApplyInitialHtml = false

  /// `initialHtml` prop. Assigned exactly once on the first non-nil, non-empty
  /// push. Subsequent writes are ignored — to replace content after mount the
  /// caller must unmount and remount the component.
  @objc var initialHtml: String = "" {
    didSet {
      guard !didApplyInitialHtml else { return }
      didApplyInitialHtml = true
      controller.loadHtml(initialHtml)
    }
  }

  required init(appContext: AppContext? = nil) {
    // Register fonts before the Proton EditorView is instantiated so
    // `UnfoldFonts.body()` and friends resolve against bundled Inter +
    // InstrumentSerif TTFs instead of system fallbacks.
    UnfoldEditorFontLoader.registerIfNeeded()

    self.controller = UnfoldEditorController()
    super.init(appContext: appContext)

    clipsToBounds = true
    backgroundColor = UnfoldColors.background

    controller.rootView.translatesAutoresizingMaskIntoConstraints = false
    addSubview(controller.rootView)
    NSLayoutConstraint.activate([
      controller.rootView.topAnchor.constraint(equalTo: topAnchor),
      controller.rootView.leadingAnchor.constraint(equalTo: leadingAnchor),
      controller.rootView.trailingAnchor.constraint(equalTo: trailingAnchor),
      controller.rootView.bottomAnchor.constraint(equalTo: bottomAnchor),
    ])

    controller.onChangeHtml = { [weak self] html in
      self?.onChangeHtml(["html": html])
    }
    controller.onScriptureRefs = { [weak self] refs in
      let serialized = refs.map { ref -> [String: Any] in
        [
          "rawText": ref.rawText,
          "location": ref.range.location,
          "length": ref.range.length,
        ]
      }
      self?.onScriptureRefs(["refs": serialized])
    }
    controller.onFocus = { [weak self] in
      self?.onEditorFocus([:])
    }
    controller.onBlur = { [weak self] in
      self?.onEditorBlur([:])
    }
    controller.onEditorSelectionChange = { [weak self] state in
      self?.onEditorSelectionChange(state)
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    controller.hostDidLayout()
  }

  override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
    super.traitCollectionDidChange(previousTraitCollection)
    guard traitCollection.userInterfaceStyle != previousTraitCollection?.userInterfaceStyle else {
      return
    }
    controller.hostTraitCollectionDidChange()
  }
}
