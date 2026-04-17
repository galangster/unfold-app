import UIKit
import Proton

/// Controller that owns a Proton `EditorView` and its surrounding UI (scripture
/// chip strip above, line decoration overlay behind the text). This is the
/// bridged analogue of the spike's `EditorViewController` — with the
/// UIViewController wrapper removed so the view hierarchy can be hosted
/// directly inside an `ExpoView`.
///
/// The host view is responsible for:
///   - Registering fonts via `UnfoldEditorFontLoader.registerIfNeeded()` before
///     instantiating this controller (so `UnfoldFonts` lookups resolve).
///   - Adding `rootView` as a subview and forwarding `layoutSubviews` /
///     `traitCollectionDidChange` so content tracks its container.
///   - Hooking the `onChangeHtml` / `onScriptureRefs` / `onFocus` / `onBlur`
///     callbacks to `EventDispatcher` instances on the Expo View.
final class UnfoldEditorController: NSObject, EditorViewDelegate, UIGestureRecognizerDelegate {

  // MARK: - Public surface

  /// The view that the host should add to its hierarchy.
  let rootView: UIView

  /// Called after each text edit, at most every 200ms (§10.B.5).
  var onChangeHtml: ((String) -> Void)?

  /// Called after each text edit (same debounce window). Passes the list of
  /// currently-detected scripture references.
  var onScriptureRefs: (([ScriptureRef]) -> Void)?

  var onFocus: (() -> Void)?
  var onBlur: (() -> Void)?
  var onEditorSelectionChange: (([String: Any]) -> Void)?

  // MARK: - Private state

  private let editor: EditorView
  private let chipStrip = ScriptureChipStrip()
  private let lineDecorationOverlay = LineDecorationOverlay()
  private let formattingProvider = UnfoldListFormattingProvider()

  /// Tap gesture attached to the editor that toggles checklist items when
  /// the user taps inside the leftmost marker zone of a checklist line.
  /// Replaces the overlay's former hit-test interception — keeping the
  /// overlay interactive breaks iOS 16+ long-press-drag text selection.
  private var checklistTapGesture: UITapGestureRecognizer?

  /// Width of the leftmost zone reserved for checklist marker taps. Matches
  /// the indent used by the list formatting provider.
  private static let checklistMarkerHitZone: CGFloat = 32

  private var scrollObservation: NSKeyValueObservation?
  private var changeDebounceTimer: DispatchSourceTimer?
  private let changeDebounceQueue = DispatchQueue(
    label: "com.unfold.editor.change-debounce")

  private static let changeDebounceInterval: DispatchTimeInterval = .milliseconds(200)

  /// Tracks the keyboard appearance set by the JS prop so we can re-apply
  /// it after block-type changes (UIKit may reset it when font attributes change).
  private var currentKeyboardAppearance: UIKeyboardAppearance = .default

  /// Selection-change throttle state. 16ms (≈60fps) cap so rapid drag
  /// selections don't saturate the JS bridge.
  private var lastSelectionEmitTime: CFTimeInterval = 0
  private var selectionThrottleWorkItem: DispatchWorkItem?
  private static let selectionThrottleInterval: CFTimeInterval = 0.016

  // MARK: - Init

  /// Observes `willResignActiveNotification` to flush unsaved content.
  private var resignActiveObserver: NSObjectProtocol?

  /// Observes `UITextView.textDidChangeNotification` as a backup for Proton's
  /// `didChangeTextAt` delegate — the delegate relies on an internal
  /// `activeTextView` guard that can silently fail depending on the
  /// editable/focus lifecycle.
  private var textDidChangeObserver: NSObjectProtocol?

  /// Observers for keyboard frame changes — used to adjust the editor's
  /// bottom content inset so the cursor stays visible when the keyboard
  /// covers the lower portion of the view.
  private var keyboardWillShowObserver: NSObjectProtocol?
  private var keyboardWillHideObserver: NSObjectProtocol?
  private var keyboardWillChangeFrameObserver: NSObjectProtocol?

  override init() {
    self.rootView = UIView()
    self.editor = EditorView()
    super.init()

    // Flush any pending debounced HTML on app background. Without this,
    // a keystroke within 200ms of backgrounding would be lost because the
    // debounce timer hasn't fired yet.
    resignActiveObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.flushPendingHtml()
    }

    // Backup text-change observer: Proton's EditorViewDelegate.didChangeTextAt
    // relies on an internal `activeTextView` guard in RichTextEditorContext that
    // can silently fail when the editable/focus lifecycle doesn't trigger
    // textViewDidBeginEditing at the right time. This notification fires
    // directly from UIKit whenever any UITextView's text changes, bypassing
    // the Proton delegate chain.
    textDidChangeObserver = NotificationCenter.default.addObserver(
      forName: UITextView.textDidChangeNotification,
      object: editor.textInput, // Only our editor's internal UITextView
      queue: .main
    ) { [weak self] _ in
      self?.handleTextDidChange()
    }

    // Keyboard inset tracking: push the editor's bottom contentInset up by
    // the keyboard height so the cursor stays visible. UITextView normally
    // handles this automatically via UITextInputTraits, but Proton's
    // internal scroll view is separate from the page-level scroll, so iOS
    // doesn't adjust the cursor for us.
    keyboardWillShowObserver = NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillShowNotification, object: nil, queue: .main
    ) { [weak self] note in self?.applyKeyboardInset(from: note) }
    keyboardWillChangeFrameObserver = NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main
    ) { [weak self] note in self?.applyKeyboardInset(from: note) }
    keyboardWillHideObserver = NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main
    ) { [weak self] note in self?.clearKeyboardInset(from: note) }

    rootView.backgroundColor = UnfoldColors.background
    rootView.translatesAutoresizingMaskIntoConstraints = false

    chipStrip.translatesAutoresizingMaskIntoConstraints = false
    chipStrip.onChipTap = { [weak self] _ in
      // Chip tap is swallowed at the controller level for now — the host
      // could surface this via another event if it ever needs navigation.
      _ = self
    }
    rootView.addSubview(chipStrip)

    editor.translatesAutoresizingMaskIntoConstraints = false
    editor.backgroundColor = UnfoldColors.background
    editor.tintColor = UnfoldColors.accent
    editor.listFormattingProvider = formattingProvider
    editor.registerProcessor(ListTextProcessor())
    editor.delegate = self
    // Don't let vertical drags auto-dismiss the keyboard — same rule as
    // the spike so toolbar interactions don't accidentally kill focus.
    editor.scrollView.keyboardDismissMode = .none
    rootView.addSubview(editor)

    NSLayoutConstraint.activate([
      chipStrip.topAnchor.constraint(equalTo: rootView.topAnchor),
      chipStrip.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
      chipStrip.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
      // Height is managed internally by ScriptureChipStrip (0 when empty, 36 with chips).

      editor.topAnchor.constraint(equalTo: chipStrip.bottomAnchor, constant: 4),
      editor.leadingAnchor.constraint(equalTo: rootView.leadingAnchor, constant: 16),
      editor.trailingAnchor.constraint(equalTo: rootView.trailingAnchor, constant: -16),
      editor.bottomAnchor.constraint(equalTo: rootView.bottomAnchor, constant: -8),
    ])

    // Decoration overlay — positioned as a sibling of the editor, constrained
    // to the same bounds. Draws blockquote bars + code block backgrounds.
    // The overlay is non-interactive; checklist marker taps are handled by a
    // tap gesture on the editor instead (see below).
    lineDecorationOverlay.editor = editor
    lineDecorationOverlay.translatesAutoresizingMaskIntoConstraints = false
    rootView.addSubview(lineDecorationOverlay)
    NSLayoutConstraint.activate([
      lineDecorationOverlay.topAnchor.constraint(equalTo: editor.topAnchor),
      lineDecorationOverlay.leadingAnchor.constraint(equalTo: editor.leadingAnchor),
      lineDecorationOverlay.trailingAnchor.constraint(equalTo: editor.trailingAnchor),
      lineDecorationOverlay.bottomAnchor.constraint(equalTo: editor.bottomAnchor),
    ])

    // Checklist marker tap — gated by the gesture delegate so it only
    // recognizes inside the leftmost marker zone of checklist lines. All
    // other touches (including long-press-drag for text selection) pass
    // through to the editor's own text-interaction pathways.
    let checklistTap = UITapGestureRecognizer(
      target: self,
      action: #selector(handleChecklistMarkerTap(_:)))
    checklistTap.delegate = self
    editor.addGestureRecognizer(checklistTap)
    checklistTapGesture = checklistTap

    // Observe scroll changes so the overlay redraws when the user scrolls
    scrollObservation = editor.scrollView.observe(
      \.contentOffset, options: [.new]
    ) { [weak self] _, _ in
      self?.lineDecorationOverlay.invalidate()
    }

    // Ensure chip strip renders above the editor in z-order
    rootView.bringSubviewToFront(chipStrip)
  }

  deinit {
    scrollObservation?.invalidate()
    scrollObservation = nil
    for observer in [
      resignActiveObserver,
      textDidChangeObserver,
      keyboardWillShowObserver,
      keyboardWillHideObserver,
      keyboardWillChangeFrameObserver,
    ].compactMap({ $0 }) {
      NotificationCenter.default.removeObserver(observer)
    }
    changeDebounceTimer?.cancel()
    changeDebounceTimer = nil
    selectionThrottleWorkItem?.cancel()
    selectionThrottleWorkItem = nil
  }

  // MARK: - Host hooks

  /// Called from the ExpoView's `layoutSubviews`. Keeps the decoration overlay
  /// matching the scroll view content size.
  func hostDidLayout() {
    layoutOverlay()
  }

  /// Called from the ExpoView's `traitCollectionDidChange`. Re-renders any
  /// theme-sensitive image placeholders.
  func hostTraitCollectionDidChange() {
    redrawPlaceholderAttachments()
  }

  // MARK: - Public commands

  /// Loads an HTML string into the editor. Preserves the editor's existing
  /// selection if one was set (currently always 0,0 on first load).
  func loadHtml(_ html: String) {
    guard !html.isEmpty else {
      editor.attributedText = NSAttributedString()
      refreshScriptureChips()
      return
    }
    let decoded = HtmlDecoder.decode(html)
    editor.attributedText = decoded
    refreshScriptureChips()
    DispatchQueue.main.async { [weak self] in
      self?.layoutOverlay()
    }
  }

  /// Encodes the current editor content to HTML. Main-thread only.
  func getHtml() -> String {
    HtmlEncoder.encode(editor.attributedText)
  }

  @discardableResult
  func focus() -> Bool {
    editor.becomeFirstResponder()
  }

  @discardableResult
  func blur() -> Bool {
    editor.resignFirstResponder()
  }

  /// Returns the current formatting state at the cursor / selection start.
  /// Used by JS for initial mount state and post-command toolbar refresh.
  func getSelectionState() -> [String: Any] {
    HtmlEncoder.querySelectionState(
      in: editor.attributedText,
      selectedRange: editor.selectedRange,
      typingAttributes: editor.typingAttributes)
  }

  // MARK: - Public commands — text formatting

  func toggleBold() {
    BoldCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  func toggleItalic() {
    ItalicsCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  func toggleUnderline() {
    UnderlineCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  func toggleStrikethrough() {
    StrikethroughCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  // MARK: - Public commands — inline insertion

  /// Inserts a hyperlink at the current selection. Behavior:
  /// - Invalid URL (empty, or `URL(string:)` returns nil) → no-op.
  /// - Non-empty selection → wraps the selected text in the link attribute.
  /// - Empty selection → inserts the URL string as display text, wrapped in
  ///   the link attribute, and advances the cursor past it.
  ///
  /// The HtmlEncoder already handles `.link` attributes by emitting
  /// `<a href="...">`, and suppresses the visual underline when serializing
  /// (links render underlined by convention but the `<u>` is implicit).
  func insertLink(_ url: String) {
    guard !url.isEmpty, let linkURL = URL(string: url) else { return }
    let selectedRange = editor.selectedRange
    if selectedRange.length > 0 {
      editor.addAttributes([
        .link: linkURL,
        .foregroundColor: UnfoldColors.accent,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
        .underlineColor: UnfoldColors.accent,
      ], at: selectedRange)
    } else {
      let display = NSAttributedString(string: url, attributes: [
        .link: linkURL,
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.accent,
        .underlineStyle: NSUnderlineStyle.single.rawValue,
        .underlineColor: UnfoldColors.accent,
      ])
      editor.replaceCharacters(in: selectedRange, with: display)
      let newCursor = NSRange(
        location: selectedRange.location + display.length,
        length: 0)
      editor.selectedRange = newCursor
    }
    scheduleHtmlEmit()
  }

  // MARK: - Public setters — declarative props

  /// Sets the empty-state placeholder. Pass `nil` (or an empty string from
  /// JS) to clear. Styling matches the body-muted text color so the hint
  /// doesn't compete with real content.
  func setPlaceholder(_ text: String?) {
    guard let text = text, !text.isEmpty else {
      editor.placeholderText = nil
      return
    }
    editor.placeholderText = NSAttributedString(
      string: text,
      attributes: [
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.textMuted,
      ])
  }

  /// Toggles whether the editor accepts edits. Mirrors `editor.isEditable`.
  func setEditable(_ editable: Bool) {
    editor.isEditable = editable
    // Proton's AutogrowingTextView starts with isScrollEnabled=false and
    // manages it dynamically during layout. When entering read mode, the
    // content likely exceeds the view bounds — force scrolling on so the
    // user can scroll through the note. AutogrowingTextView will re-manage
    // this when layout changes occur (e.g. keyboard appears in edit mode).
    if !editable {
      editor.isScrollEnabled = true
    }
  }

  /// Sets the keyboard appearance. Accepts `"default"`, `"light"`, or
  /// `"dark"`; anything else maps to `.default`.
  /// UIKit does not live-update an already-showing keyboard when
  /// `keyboardAppearance` changes — `reloadInputViews()` forces a refresh so
  /// the keyboard chrome matches the current app theme immediately.
  func setKeyboardAppearance(_ value: String) {
    let appearance: UIKeyboardAppearance
    switch value {
    case "light": appearance = .light
    case "dark":  appearance = .dark
    default:      appearance = .default
    }
    currentKeyboardAppearance = appearance
    editor.keyboardAppearance = appearance
    if editor.isFirstResponder {
      editor.reloadInputViews()
    }
  }

  /// Requests first-responder after a short delay. Matches the spike timing
  /// (§10.B.6: "call becomeFirstResponder 300ms after mount"). Safe to call
  /// from the prop setter on first mount — the delay lets layout settle so
  /// the keyboard doesn't animate in before the view is positioned.
  func requestAutoFocus() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      _ = self?.editor.becomeFirstResponder()
    }
  }

  // MARK: - Public commands — block types

  /// Applies a block type to the current paragraph. Accepted values:
  /// `"p"`, `"h1"`, `"h2"`, `"h3"`, `"blockquote"`, `"pre"`. Unknown values
  /// are silently ignored so JS callers can't crash the bridge by typoing.
  func setBlockType(_ type: String) {
    let paraRange = currentParagraphRange()

    // For empty content (length 0), skip attribute manipulation — just set
    // typingAttributes so the next typed character inherits the block style.
    if paraRange.length == 0 {
      var attrs = blockTypeAttributes(type)
      if attrs.isEmpty { return }
      DispatchQueue.main.async { [weak self] in
        self?.editor.typingAttributes = attrs
      }
      scheduleHtmlEmit()
      return
    }

    // Always clear previous block-type marker so switching between
    // blockquote / code / plain doesn't leave stale markers.
    editor.removeAttribute(.unfoldBlockType, at: paraRange)
    if type != "pre" {
      editor.removeAttribute(.backgroundColor, at: paraRange)
    }

    switch type {
    case "p":
      let paragraph = NSMutableParagraphStyle()
      paragraph.paragraphSpacing = 4
      paragraph.paragraphSpacingBefore = 0
      editor.addAttributes([
        .font: UnfoldFonts.body(),
        .foregroundColor: UnfoldColors.text,
        .paragraphStyle: paragraph,
      ], at: paraRange)

    case "h1", "h2", "h3":
      let (font, spacingBefore): (UIFont, CGFloat) = {
        switch type {
        case "h1": return (UnfoldFonts.h1, 16)
        case "h2": return (UnfoldFonts.h2, 12)
        default:   return (UnfoldFonts.h3, 10)
        }
      }()
      let paragraph = NSMutableParagraphStyle()
      paragraph.paragraphSpacing = 8
      paragraph.paragraphSpacingBefore = spacingBefore
      paragraph.lineHeightMultiple = 1.15
      editor.addAttributes([
        .font: font,
        .foregroundColor: UnfoldColors.text,
        .paragraphStyle: paragraph,
      ], at: paraRange)

    case "blockquote":
      let paragraph = NSMutableParagraphStyle()
      paragraph.firstLineHeadIndent = 16
      paragraph.headIndent = 16
      paragraph.paragraphSpacing = 8
      paragraph.paragraphSpacingBefore = 8
      editor.addAttributes([
        .font: UnfoldFonts.bodyItalic(),
        .foregroundColor: UnfoldColors.textMuted,
        .paragraphStyle: paragraph,
        .unfoldBlockType: "blockquote",
      ], at: paraRange)

    case "pre":
      let mono = UIFont.monospacedSystemFont(ofSize: 15, weight: .regular)
      let paragraph = NSMutableParagraphStyle()
      paragraph.paragraphSpacing = 6
      paragraph.paragraphSpacingBefore = 6
      editor.addAttributes([
        .font: mono,
        .foregroundColor: UnfoldColors.text,
        .backgroundColor: UnfoldColors.inputBackground,
        .paragraphStyle: paragraph,
        .unfoldBlockType: "codeBlock",
      ], at: paraRange)

    default:
      return
    }

    // Sync typing attributes so new characters typed on a freshly-formatted
    // empty line inherit the block style (font, color, paragraph, marker).
    // Deferred to next run-loop tick because Proton resets typingAttributes
    // synchronously during attribute changes.
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let loc = self.editor.selectedRange.location
      if loc < self.editor.attributedText.length {
        var attrs = self.editor.attributedText.attributes(at: loc, effectiveRange: nil)
        attrs.removeValue(forKey: .attachment)
        self.editor.typingAttributes = attrs
      } else if self.editor.attributedText.length > 0 {
        let last = self.editor.attributedText.length - 1
        var attrs = self.editor.attributedText.attributes(at: last, effectiveRange: nil)
        attrs.removeValue(forKey: .attachment)
        self.editor.typingAttributes = attrs
      }
      self.refreshSelectionState()
    }

    scheduleHtmlEmit()
  }

  // MARK: - Public commands — lists

  /// Toggles list formatting on the current line / selection. Accepted
  /// values: `"bullet"`, `"ordered"`, `"checklist"`.
  func setList(_ type: String) {
    let value: Any
    switch type {
    case "bullet":    value = "bullet"
    case "ordered":   value = "ordered"
    case "checklist": value = ChecklistItem(checked: false)
    default: return
    }

    // Reset font/color when converting a blockquote (italic + muted) into a
    // list — ListCommand manages indent via its own paragraph style but
    // doesn't touch font or color, so without this reset the new bullet
    // would render in italic/muted. Detected via inherited headIndent.
    let paraRange = currentParagraphRange()
    if paraRange.length > 0 {
      let paragraphStyle = editor.attributedText.attribute(
        .paragraphStyle,
        at: paraRange.location,
        effectiveRange: nil) as? NSParagraphStyle
      if (paragraphStyle?.headIndent ?? 0) >= 16 {
        let pStyle = NSMutableParagraphStyle()
        pStyle.paragraphSpacing = 4
        pStyle.paragraphSpacingBefore = 0
        editor.addAttributes([
          .font: UnfoldFonts.body(),
          .foregroundColor: UnfoldColors.text,
          .paragraphStyle: pStyle,
        ], at: paraRange)
      }
    }

    ListCommand().execute(on: editor, attributeValue: value)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  /// Clears list formatting on the current line / selection. Uses
  /// `ListCommand`'s nil-value branch which resets paragraph style and
  /// removes `.listItem`.
  func clearList() {
    ListCommand().execute(on: editor, attributeValue: nil)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  /// Toggles the checked state of the checklist item on the current line.
  /// No-op if the current line isn't a checklist item.
  func toggleChecklist() {
    let lineRange = currentLineRange()
    guard lineRange.length > 0 else { return }
    toggleChecklist(at: lineRange.location)
  }

  func indentList() {
    ListIndentCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  func outdentList() {
    ListOutdentCommand().execute(on: editor)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  // MARK: - Public commands — history

  func undo() {
    editor.undoManager?.undo()
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  func redo() {
    editor.undoManager?.redo()
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  // MARK: - Public commands — insertion

  /// Inserts an image at the current cursor position from a local file URI
  /// (`file://...` or a bare path). Scales to 320pt max width preserving
  /// aspect ratio. Silently no-ops if the image can't be decoded.
  func insertImage(_ uri: String) {
    guard let image = loadImage(from: uri) else { return }
    let maxWidth: CGFloat = 320
    let scale = min(1.0, maxWidth / max(image.size.width, 1))
    let displaySize = CGSize(
      width: image.size.width * scale,
      height: image.size.height * scale)

    let attachment = UnfoldImageAttachment(
      image: image,
      sourceURI: uri,
      bounds: CGRect(origin: .zero, size: displaySize))

    let attachmentString = NSMutableAttributedString()
    attachmentString.append(NSAttributedString(string: "\n"))
    attachmentString.append(NSAttributedString(attachment: attachment))
    attachmentString.append(NSAttributedString(string: "\n", attributes: [
      .font: UnfoldFonts.body(),
      .foregroundColor: UnfoldColors.text,
    ]))

    editor.replaceCharacters(in: editor.selectedRange, with: attachmentString)
    scheduleHtmlEmit()
  }

  // MARK: - EditorViewDelegate

  func editor(
    _ editor: EditorView,
    shouldHandle key: EditorKey,
    modifierFlags: UIKeyModifierFlags,
    at range: NSRange,
    handled: inout Bool
  ) {
    guard key == .enter else { return }

    let text = editor.attributedText
    let nsString = text.string as NSString
    guard nsString.length > 0 else { return }

    let paraRange = nsString.paragraphRange(for: range)
    guard paraRange.length > 0 else { return }

    let bodyPStyle = NSMutableParagraphStyle()
    bodyPStyle.paragraphSpacing = 4
    let bodyAttrs: [NSAttributedString.Key: Any] = [
      .font: UnfoldFonts.body(),
      .foregroundColor: UnfoldColors.text,
      .paragraphStyle: bodyPStyle,
    ]

    // List continuation: if the current paragraph is a list item, we need to
    // explicitly carry `.listItem` + list paragraph style onto the new line.
    // Proton's upstream `shouldProcess` tries via typingAttributes but
    // paragraph-style attributes get stripped at paragraph boundaries on
    // iOS, so the visible marker disappears on the new empty line. We force
    // it here on the main-queue bounce AFTER Proton inserts the \n.
    if let listItemValue = text.attribute(
      .listItem, at: paraRange.location, effectiveRange: nil)
    {
      let listParaStyle = text.attribute(
        .paragraphStyle, at: paraRange.location, effectiveRange: nil
      ) as? NSParagraphStyle
      let listFont = text.attribute(
        .font, at: paraRange.location, effectiveRange: nil
      ) as? UIFont ?? UnfoldFonts.body()
      let listColor = text.attribute(
        .foregroundColor, at: paraRange.location, effectiveRange: nil
      ) as? UIColor ?? UnfoldColors.text

      let trimmed = nsString.substring(with: paraRange)
        .trimmingCharacters(in: .whitespacesAndNewlines)
        .replacingOccurrences(of: "\u{200B}", with: "")

      if trimmed.isEmpty {
        // Empty list line + Enter → exit the list (double-Enter pattern).
        // Proton's `exitListsIfRequired` will call `terminateList` to strip
        // `.listItem`; we reset typing attributes to body so the next char
        // renders plainly without list indent or marker.
        DispatchQueue.main.async { [weak self] in
          self?.editor.typingAttributes = bodyAttrs
        }
        return
      }

      // Non-empty list line + Enter → continuation. Strategy:
      // 1) Attribute Proton's just-inserted `\n` with `.listItem` + list
      //    paragraph style so the terminator joins the list range.
      // 2) Insert a ZWSP (`\u{200B}`) at the cursor with the same list
      //    attributes. This gives `NSLayoutManager` a real glyph on the new
      //    empty line so `enumerateLineFragments` produces a fragment there
      //    and `drawListMarkers` reliably paints a marker on every new line,
      //    not just the first (the post-loop `extraLineFragmentRect` path in
      //    `LayoutManager.drawListMarkers` only draws one trailing marker).
      // 3) Cursor sits AFTER the ZWSP so the next char the user types lands
      //    inside the list paragraph; ZWSP is invisible so the user sees a
      //    clean empty line with a bullet. Matches Proton's own
      //    `createListItemInANewLine` pattern (ListTextProcessor.swift:296).
      //
      // Re-entrancy note: `editor.replaceCharacters` triggers another
      // `willProcessEditing` cycle, but `TextProcessor.willProcessEditing`
      // only invokes `handleKeyWithModifiers(.enter)` when `changedText ==
      // "\n"` (TextProcessor.swift:78). ZWSP is not `\n`, so
      // `exitListsIfRequired` does NOT fire — our attributes are preserved.
      var listAttrs: [NSAttributedString.Key: Any] = [
        .listItem: listItemValue,
        .font: listFont,
        .foregroundColor: listColor,
      ]
      if let style = listParaStyle {
        listAttrs[.paragraphStyle] = style
      }

      // INTERCEPT: prevent UITextView from inserting a plain `\n`. We insert
      // `\n` + ZWSP ourselves with full list attrs so the new paragraph has
      // `.listItem` AND a paragraphStyle with `firstLineHeadIndent > 0`.
      //
      // Why the paragraphStyle matters: Proton's `ListTextProcessor.shouldProcess`
      // (ListTextProcessor.swift:64) only carries `.listItem` onto newly-typed
      // characters when BOTH conditions hold at cursor-1:
      //   1) `.listItem` attribute present
      //   2) paragraphStyle.firstLineHeadIndent > 0
      // A bare `\n` with only `.listItem` but no list paragraphStyle fails
      // condition 2 → typed chars are orphaned → list ends on line 3+.
      //
      // Inserting `\n` + ZWSP with BOTH attrs (matching Proton's
      // `createListItemInANewLine` pattern at line 296-311) satisfies both.
      // Cursor moves past the ZWSP; the ZWSP is invisible but provides a real
      // glyph so `NSLayoutManager.enumerateLineFragments` produces a fragment
      // on the new line and `drawListMarkers` paints the marker reliably.
      let newline = NSAttributedString(string: "\n\u{200B}", attributes: listAttrs)
      let insertRange = NSRange(location: range.location, length: 0)
      editor.replaceCharacters(in: insertRange, with: newline)
      editor.selectedRange = NSRange(
        location: range.location + 2, length: 0
      )
      editor.typingAttributes = listAttrs
      lineDecorationOverlay.invalidate()
      handled = true
      return
    }

    // Heading → body on Enter: headings have font size >= 18 (h3 minimum).
    // Without this, pressing Enter in an H1 keeps the H1 font on the new line.
    let paraFont = text.attribute(
      .font, at: paraRange.location, effectiveRange: nil) as? UIFont
    guard (paraFont?.pointSize ?? 0) >= 18 else { return }

    DispatchQueue.main.async { [weak self] in
      self?.editor.typingAttributes = bodyAttrs
    }
  }

  func editor(_ editor: EditorView, didChangeTextAt range: NSRange) {
    handleTextDidChange()
  }

  /// Core text-change handler called from both Proton's `didChangeTextAt`
  /// delegate AND the `UITextView.textDidChangeNotification` backup observer.
  /// Uses `textChangeGeneration` to avoid double-processing when both fire.
  private var textChangeGeneration: UInt64 = 0
  private var lastProcessedGeneration: UInt64 = 0

  private func handleTextDidChange() {
    textChangeGeneration &+= 1
    let gen = textChangeGeneration
    guard gen != lastProcessedGeneration else { return }
    lastProcessedGeneration = gen

    refreshScriptureChips()
    extendBlockMarkers()
    lineDecorationOverlay.invalidate()
    DispatchQueue.main.async { [weak self] in
      self?.layoutOverlay()
      self?.ensureCaretVisible()
    }
    scheduleHtmlEmit()
  }

  /// Forces the current caret to be visible above the keyboard. UIKit's
  /// UITextView normally handles this, but Proton's EditorView composes
  /// the text view inside a custom scroll container and the built-in
  /// behaviour doesn't fire as the user types past the visible area. We
  /// call this from `handleTextDidChange` (new char typed) and
  /// `didChangeSelectionAt` (cursor moved) so the caret is always in view.
  private func ensureCaretVisible() {
    guard editor.isFirstResponder else { return }
    guard let selectedRange = editor.textInput.selectedTextRange else { return }
    let caretInTextView = editor.textInput.caretRect(for: selectedRange.end)
    // caretRect is in the text view's coord space, but `editor.scrollView`
    // IS the text view (UITextView : UIScrollView in Proton's setup), so
    // no conversion is needed.
    guard !caretInTextView.isNull, !caretInTextView.isInfinite else { return }
    // Expand the rect slightly so we have breathing room above the keyboard.
    let padded = caretInTextView.insetBy(dx: 0, dy: -12)
    editor.scrollView.scrollRectToVisible(padded, animated: false)
  }

  func editor(_ editor: EditorView, didReceiveFocusAt range: NSRange) {
    onFocus?()
  }

  func editor(_ editor: EditorView, didLoseFocusFrom range: NSRange) {
    onBlur?()
  }

  func editor(
    _ editor: EditorView,
    didChangeSelectionAt range: NSRange,
    attributes: [NSAttributedString.Key: Any],
    contentType: EditorContent.Name
  ) {
    // Re-apply keyboard appearance — UIKit can reset it when the cursor
    // moves between paragraphs with different font attributes (e.g.
    // heading → body), causing light/dark keyboard mismatch.
    if editor.keyboardAppearance != currentKeyboardAppearance {
      editor.keyboardAppearance = currentKeyboardAppearance
      if editor.isFirstResponder {
        editor.reloadInputViews()
      }
    }

    let state = HtmlEncoder.querySelectionState(
      in: editor.attributedText,
      selectedRange: range,
      typingAttributes: editor.typingAttributes)
    throttleSelectionEmit(state)

    // Keep the caret on-screen as it moves (typing, tap-to-reposition,
    // arrow keys, etc). Deferred to next runloop so layout is settled.
    DispatchQueue.main.async { [weak self] in
      self?.ensureCaretVisible()
    }
  }

  // MARK: - Internals

  /// Returns the set of attributes for a given block type, suitable for
  /// setting as typingAttributes on an empty paragraph.
  private func blockTypeAttributes(_ type: String) -> [NSAttributedString.Key: Any] {
    switch type {
    case "p":
      let p = NSMutableParagraphStyle()
      p.paragraphSpacing = 4
      return [.font: UnfoldFonts.body(), .foregroundColor: UnfoldColors.text, .paragraphStyle: p]
    case "h1":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 8; p.paragraphSpacingBefore = 16; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h1, .foregroundColor: UnfoldColors.text, .paragraphStyle: p]
    case "h2":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 8; p.paragraphSpacingBefore = 12; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h2, .foregroundColor: UnfoldColors.text, .paragraphStyle: p]
    case "h3":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 8; p.paragraphSpacingBefore = 10; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h3, .foregroundColor: UnfoldColors.text, .paragraphStyle: p]
    case "blockquote":
      let p = NSMutableParagraphStyle(); p.firstLineHeadIndent = 16; p.headIndent = 16; p.paragraphSpacing = 8; p.paragraphSpacingBefore = 8
      return [.font: UnfoldFonts.bodyItalic(), .foregroundColor: UnfoldColors.textMuted, .paragraphStyle: p, .unfoldBlockType: "blockquote"]
    case "pre":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 6; p.paragraphSpacingBefore = 6
      return [.font: UIFont.monospacedSystemFont(ofSize: 15, weight: .regular), .foregroundColor: UnfoldColors.text, .paragraphStyle: p, .unfoldBlockType: "codeBlock"]
    default:
      return [:]
    }
  }

  /// UITextView's typingAttributes ignores custom NSAttributedString keys, so
  /// when typing inside a blockquote/code-block paragraph the `.unfoldBlockType`
  /// marker only stays on the terminator `\n` (set during continuation). This
  /// method scans the paragraph containing the cursor, looking for the marker
  /// on any character (reverse scan from end), and extends it to the full
  /// paragraph range. Does NOT infer block type from paragraph style — that
  /// would re-add the marker to paragraphs intentionally converted to body
  /// via the exit handler. Paragraph-style-based detection is handled by the
  /// overlay for visual rendering only.
  private func extendBlockMarkers() {
    let text = editor.attributedText
    let nsString = text.string as NSString
    guard nsString.length > 0 else { return }

    let paraRange = nsString.paragraphRange(for: editor.selectedRange)
    guard paraRange.length > 0 else { return }

    // Check first character for marker — if present, already extended
    let firstMarker = text.attribute(
      .unfoldBlockType, at: paraRange.location, effectiveRange: nil) as? String
    if firstMarker != nil { return }

    // Scan from end of paragraph backwards for the marker on any character
    // (typically it lives on the `\n` terminator set by the continuation handler).
    var foundMarker: String? = nil
    if paraRange.length > 1 {
      for i in stride(from: NSMaxRange(paraRange) - 1,
                      through: paraRange.location, by: -1) {
        if let m = text.attribute(
          .unfoldBlockType, at: i, effectiveRange: nil) as? String {
          foundMarker = m
          break
        }
      }
    }

    guard let marker = foundMarker else { return }

    // Extend marker to full paragraph so HtmlEncoder and overlay see it
    editor.addAttribute(.unfoldBlockType, value: marker, at: paraRange)
  }

  /// Paragraph range containing the current selection. Returns a zero-length
  /// range if the editor is empty.
  private func currentParagraphRange() -> NSRange {
    let text = editor.attributedText.string as NSString
    return text.paragraphRange(for: editor.selectedRange)
  }

  /// Line range containing the current selection. Narrower than
  /// `currentParagraphRange` — used for per-line toggles like checklist.
  private func currentLineRange() -> NSRange {
    let text = editor.attributedText.string as NSString
    return text.lineRange(for: editor.selectedRange)
  }

  /// Loads a UIImage from a file URI or bare path. Returns nil if the path
  /// doesn't resolve to a decodable image.
  private func loadImage(from uri: String) -> UIImage? {
    if let url = URL(string: uri), url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }
    return UIImage(contentsOfFile: uri)
  }

  private func refreshScriptureChips() {
    let refs = ScriptureRefParser.extract(from: editor.attributedText.string)
    chipStrip.update(with: refs)
    onScriptureRefs?(refs)
  }

  private func layoutOverlay() {
    // The overlay is now constrained to the editor's bounds via Auto Layout.
    // Just trigger a redraw.
    lineDecorationOverlay.invalidate()
  }

  /// Immediately emits the current HTML, cancelling any pending debounce.
  /// Called on `willResignActive` to ensure content isn't lost when the user
  /// backgrounds the app within the 200ms debounce window.
  private func flushPendingHtml() {
    changeDebounceTimer?.cancel()
    changeDebounceTimer = nil
    let html = getHtml()
    onChangeHtml?(html)
  }

  /// Debounced emission of `onChangeHtml`. Re-entering the 200ms window
  /// resets the timer so a burst of keystrokes produces a single emit.
  private func scheduleHtmlEmit() {
    changeDebounceTimer?.cancel()
    let timer = DispatchSource.makeTimerSource(queue: changeDebounceQueue)
    timer.schedule(deadline: .now() + Self.changeDebounceInterval)
    timer.setEventHandler { [weak self] in
      DispatchQueue.main.async {
        guard let self = self else { return }
        let html = self.getHtml()
        self.onChangeHtml?(html)
      }
    }
    changeDebounceTimer = timer
    timer.resume()
  }

  /// Throttled emission of `onEditorSelectionChange`. Emits immediately if
  /// outside the 16ms cooldown window; otherwise defers to the next window
  /// boundary so the last state in a burst is never dropped.
  ///
  /// Must be called from the main thread (Proton's delegate fires there).
  private func throttleSelectionEmit(_ state: [String: Any]) {
    let now = CACurrentMediaTime()
    let elapsed = now - lastSelectionEmitTime

    if elapsed >= Self.selectionThrottleInterval {
      // Outside cooldown — emit immediately
      lastSelectionEmitTime = now
      selectionThrottleWorkItem?.cancel()
      selectionThrottleWorkItem = nil
      onEditorSelectionChange?(state)
    } else {
      // Inside cooldown — schedule deferred emit at end of window
      selectionThrottleWorkItem?.cancel()
      let item = DispatchWorkItem { [weak self] in
        guard let self = self else { return }
        self.lastSelectionEmitTime = CACurrentMediaTime()
        self.onEditorSelectionChange?(state)
        self.selectionThrottleWorkItem = nil
      }
      selectionThrottleWorkItem = item
      let delay = Self.selectionThrottleInterval - elapsed
      DispatchQueue.main.asyncAfter(
        deadline: .now() + delay,
        execute: item)
    }
  }

  /// Re-queries the current selection state and emits it to JS.
  /// Call after commands that change formatting but don't move the cursor
  /// (e.g., toggleBold on empty selection), since `didChangeSelectionAt`
  /// only fires when the cursor position changes.
  private func refreshSelectionState() {
    let state = HtmlEncoder.querySelectionState(
      in: editor.attributedText,
      selectedRange: editor.selectedRange,
      typingAttributes: editor.typingAttributes)
    throttleSelectionEmit(state)
  }

  /// Handles a tap inside the checklist marker zone. The gesture delegate
  /// has already verified the tap location, so we trust it here.
  @objc private func handleChecklistMarkerTap(_ gr: UITapGestureRecognizer) {
    let point = gr.location(in: editor)
    guard let charIndex = checklistLineCharIndex(for: point) else { return }
    toggleChecklist(at: charIndex)
  }

  /// Resolves a point (in the editor's view coordinate space) to the
  /// character index of the line it hits — but only if that line is a
  /// `ChecklistItem`. Returns `nil` for any point outside the marker zone
  /// or on a non-checklist line. Accounts for scroll offset when mapping
  /// to the text's document coordinate space.
  private func checklistLineCharIndex(for viewPoint: CGPoint) -> Int? {
    guard viewPoint.x < Self.checklistMarkerHitZone else { return nil }
    let scrollOffset = editor.scrollView.contentOffset
    let textPoint = CGPoint(
      x: viewPoint.x + scrollOffset.x,
      y: viewPoint.y + scrollOffset.y)
    let textInput = editor.textInput
    guard let position = textInput.closestPosition(to: textPoint) else { return nil }
    let charIndex = textInput.offset(from: textInput.beginningOfDocument, to: position)
    let text = editor.attributedText.string as NSString
    guard charIndex >= 0, charIndex < text.length else { return nil }
    let lineRange = text.lineRange(for: NSRange(location: charIndex, length: 0))
    guard lineRange.length > 0 else { return nil }
    let attr = editor.attributedText.attribute(
      .listItem, at: lineRange.location, effectiveRange: nil)
    return (attr is ChecklistItem) ? charIndex : nil
  }

  // MARK: - UIGestureRecognizerDelegate

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldReceive touch: UITouch
  ) -> Bool {
    // Only gate our own tap gesture. Every other gesture (Proton's selection
    // loupe, long-press-drag, scroll pan) must be untouched.
    guard gestureRecognizer === checklistTapGesture else { return true }
    let viewPoint = touch.location(in: editor)
    return checklistLineCharIndex(for: viewPoint) != nil
  }

  /// Toggles the checked state of the checklist line containing `charIndex`.
  private func toggleChecklist(at charIndex: Int) {
    let text = editor.attributedText.string as NSString
    let safeIndex = min(max(0, charIndex), max(0, text.length - 1))
    let lineRange = text.lineRange(for: NSRange(location: safeIndex, length: 0))
    guard lineRange.length > 0 else { return }
    let rawAttr = editor.attributedText.attribute(
      .listItem,
      at: lineRange.location,
      effectiveRange: nil)
    guard var checklistItem = rawAttr as? ChecklistItem else { return }
    checklistItem.checked.toggle()
    editor.addAttribute(.listItem, value: checklistItem, at: lineRange)
    if checklistItem.checked {
      editor.addAttributes([
        .strikethroughStyle: NSUnderlineStyle.single.rawValue,
        .strikethroughColor: UnfoldColors.textMuted,
        .foregroundColor: UnfoldColors.textMuted,
      ], at: lineRange)
    } else {
      editor.addAttributes([
        .strikethroughStyle: 0,
        .foregroundColor: UnfoldColors.text,
      ], at: lineRange)
    }
    lineDecorationOverlay.invalidate()
    scheduleHtmlEmit()
  }

  /// Adjusts the editor's internal scrollView.contentInset.bottom so the
  /// cursor stays above the keyboard. Called from keyboardWillShow and
  /// keyboardWillChangeFrame so that rotation / external keyboard swap is
  /// handled too.
  private func applyKeyboardInset(from note: Notification) {
    guard let frame = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
    else { return }
    // Convert the keyboard's window-space frame to the editor's coordinate
    // space so we only account for the portion that actually overlaps.
    let keyboardInView = editor.convert(frame, from: nil)
    let overlap = max(0, editor.bounds.maxY - keyboardInView.minY)
    let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? TimeInterval) ?? 0.25
    let curveRaw = (note.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? UInt(UIView.AnimationCurve.easeInOut.rawValue)
    UIView.animate(
      withDuration: duration,
      delay: 0,
      options: UIView.AnimationOptions(rawValue: curveRaw << 16),
      animations: { [weak self] in
        guard let self = self else { return }
        var inset = self.editor.scrollView.contentInset
        inset.bottom = overlap + 12 // small padding so cursor isn't flush against the keyboard top
        self.editor.scrollView.contentInset = inset
        self.editor.scrollView.verticalScrollIndicatorInsets = inset
        // Ensure the cursor is visible after the inset change.
        if let selectedRange = self.editor.textInput.selectedTextRange {
          let caret = self.editor.textInput.caretRect(for: selectedRange.end)
          self.editor.scrollView.scrollRectToVisible(caret, animated: false)
        }
      },
      completion: nil)
  }

  private func clearKeyboardInset(from note: Notification) {
    let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? TimeInterval) ?? 0.25
    let curveRaw = (note.userInfo?[UIResponder.keyboardAnimationCurveUserInfoKey] as? UInt) ?? UInt(UIView.AnimationCurve.easeInOut.rawValue)
    UIView.animate(
      withDuration: duration,
      delay: 0,
      options: UIView.AnimationOptions(rawValue: curveRaw << 16),
      animations: { [weak self] in
        guard let self = self else { return }
        var inset = self.editor.scrollView.contentInset
        inset.bottom = 0
        self.editor.scrollView.contentInset = inset
        self.editor.scrollView.verticalScrollIndicatorInsets = inset
      },
      completion: nil)
  }

  /// Walks the editor's attributed text, finds every `UnfoldPlaceholderAttachment`,
  /// and replaces its image with a freshly-drawn one resolved against the
  /// current trait collection. Triggered by theme changes.
  private func redrawPlaceholderAttachments() {
    let mutable = NSMutableAttributedString(attributedString: editor.attributedText)
    let fullRange = NSRange(location: 0, length: mutable.length)
    var didChange = false
    mutable.enumerateAttribute(.attachment, in: fullRange, options: []) { value, range, _ in
      guard let placeholder = value as? UnfoldPlaceholderAttachment else { return }
      let width = placeholder.bounds.width
      let height = placeholder.bounds.height
      placeholder.image = SampleImageGenerator.makeImage(
        width: width,
        height: height,
        caption: placeholder.caption,
        traits: rootView.traitCollection)
      mutable.removeAttribute(.attachment, range: range)
      mutable.addAttribute(.attachment, value: placeholder, range: range)
      didChange = true
    }
    if didChange {
      let savedSelection = editor.selectedRange
      editor.attributedText = mutable
      editor.selectedRange = savedSelection
    }
  }
}
