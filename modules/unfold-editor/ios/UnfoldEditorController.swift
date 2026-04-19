import UIKit
import Proton

/// Controller that owns a Proton `EditorView` and its surrounding UI (scripture
/// chip strip above, line decoration overlay behind the text). Bridged
/// analogue of the spike's `EditorViewController` — UIViewController wrapper
/// removed so the view hierarchy can be hosted directly inside an `ExpoView`.
///
/// Host responsibilities:
///   - Register fonts via `UnfoldEditorFontLoader.registerIfNeeded()` before
///     instantiating this controller (so `UnfoldFonts` lookups resolve).
///   - Add `rootView` as a subview and forward `layoutSubviews` /
///     `traitCollectionDidChange` so content tracks its container.
///   - Hook `onChangeHtml` / `onScriptureRefs` / `onFocus` / `onBlur` /
///     `onEditorSelectionChange` to `EventDispatcher` instances on the Expo View.
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

  /// Height of the React Native formatting toolbar that visually sits above the
  /// iOS keyboard. The native editor itself only knows the keyboard's top edge,
  /// so RN passes this extra occlusion height down explicitly.
  private var keyboardToolbarHeight: CGFloat = 0

  /// Coalesces repeated caret-visibility requests from text + selection changes
  /// into a single main-runloop scroll correction.
  private var hasPendingCaretVisibilityUpdate = false

  /// When true, a text edit changed content/selection and we should wait for
  /// Proton/TextKit layout to finish before performing the next caret-visibility
  /// correction. This avoids auto-scrolling once on stale geometry and then
  /// correcting again a moment later near the overflow boundary.
  private var needsCaretVisibilityAfterLayout = false

  /// Selection-change throttle state. 16ms (≈60fps) cap so rapid drag
  /// selections don't saturate the JS bridge.
  private var lastSelectionEmitTime: CFTimeInterval = 0
  private var selectionThrottleWorkItem: DispatchWorkItem?
  private static let selectionThrottleInterval: CFTimeInterval = 0.016

  // MARK: - Init

  /// Observes `willResignActiveNotification` to flush unsaved content.
  private var resignActiveObserver: NSObjectProtocol?

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
    // Apple Notes-style rubber-band scroll — always draggable even when
    // content is shorter than viewport, so the canvas feels like a real
    // document surface in both edit and view mode.
    //
    // Proton's `AutogrowingTextView.recalculateHeight()` dynamically toggles
    // `isScrollEnabled=false` whenever content fits inside bounds, which
    // silently kills `alwaysBounceVertical`. Setting `maxHeight = .infinite`
    // short-circuits that recalculation so scrolling stays enabled regardless
    // of content length — we already manage height via autolayout constraints
    // (chipStrip.bottom → editor.top → keyboardLayoutGuide.top).
    editor.maxHeight = .infinite
    editor.scrollView.isScrollEnabled = true
    editor.scrollView.alwaysBounceVertical = true
    rootView.addSubview(editor)

    NSLayoutConstraint.activate([
      chipStrip.topAnchor.constraint(equalTo: rootView.topAnchor),
      chipStrip.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
      chipStrip.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
      // Height is managed internally by ScriptureChipStrip (0 when empty, 36 with chips).

      editor.topAnchor.constraint(equalTo: chipStrip.bottomAnchor, constant: 4),
      editor.leadingAnchor.constraint(equalTo: rootView.leadingAnchor, constant: 16),
      editor.trailingAnchor.constraint(equalTo: rootView.trailingAnchor, constant: -16),
      // iOS-native keyboard avoidance via UIView.keyboardLayoutGuide.
      // Follows the keyboard's top edge when shown and the safe-area bottom
      // when hidden, so the editor's bottom is always the correct anchor
      // point for the caret — no manual observers required.
      editor.bottomAnchor.constraint(equalTo: rootView.keyboardLayoutGuide.topAnchor, constant: -8),
    ])

    // Decoration overlay — lives INSIDE the editor's scroll view so it
    // scrolls with the content naturally, but it must stay non-interactive in
    // the RN/Expo host so UIKit's own UITextInteraction keeps ownership of
    // long-press-drag selection. Checklist taps are handled by a gated tap
    // recognizer on the editor instead.
    lineDecorationOverlay.editor = editor
    editor.scrollView.addSubview(lineDecorationOverlay)

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
    if let observer = resignActiveObserver {
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
  func setKeyboardAppearance(_ appearance: String) {
    let nextAppearance: UIKeyboardAppearance
    switch appearance {
    case "light": nextAppearance = .light
    case "dark": nextAppearance = .dark
    default: nextAppearance = .default
    }
    currentKeyboardAppearance = nextAppearance
    editor.keyboardAppearance = appearance == "light" ? .light : appearance == "dark" ? .dark : .default
    if editor.isFirstResponder {
      editor.reloadInputViews()
    }
  }

  func setKeyboardToolbarHeight(_ height: Double) {
    let nextHeight = max(0, CGFloat(height))
    guard abs(nextHeight - keyboardToolbarHeight) >= 0.5 else { return }
    keyboardToolbarHeight = nextHeight
    updateEditorScrollInsets()
    scheduleCaretVisibilityUpdate()
  }

  private func updateEditorScrollInsets() {
    let bottomInset = keyboardToolbarHeight > 0 ? keyboardToolbarHeight + 16 : 0
    editor.contentInset = UIEdgeInsets(top: 0, left: 0, bottom: bottomInset, right: 0)
    editor.verticalScrollIndicatorInsets = UIEdgeInsets(top: 0, left: 0, bottom: bottomInset, right: 0)
  }

  /// Requests focus 300ms after mount so the host view has finished layout and

  /// from the prop setter on first mount — the delay lets layout settle so
  /// the keyboard doesn't animate in before the view is positioned.
  func requestAutoFocus() {
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
      _ = self?.editor.becomeFirstResponder()
    }
  }

  // MARK: - Public commands — block types

  /// Applies a block type to the current paragraph. Accepted values:
  /// `"p"`, `"h1"`, `"h2"`, `"h3"`, `"pre"`. Unknown values are silently
  /// ignored so JS callers can't crash the bridge by typoing. Blockquote
  /// isn't exposed as a toolbar block type — blockquotes only enter the
  /// document via scripture-insert HTML, and the round-trip path preserves
  /// them via `.unfoldBlockType = "blockquote"`.
  func setBlockType(_ type: String) {
    let paraRange = currentParagraphRange()

    // For empty content (length 0), skip attribute manipulation — just set
    // typingAttributes so the next typed character inherits the block style.
    if paraRange.length == 0 {
      let attrs = blockTypeAttributes(type)
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
      // Keep headings visually distinct, but keep the handoff into body copy
      // tight enough that the first paragraph doesn't feel detached.
      paragraph.paragraphSpacing = 2
      paragraph.paragraphSpacingBefore = spacingBefore
      paragraph.lineHeightMultiple = 1.15
      editor.addAttributes([
        .font: font,
        .foregroundColor: UnfoldColors.text,
        .paragraphStyle: paragraph,
        .unfoldBlockType: type,
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

    let lineRange = currentLineRange()
    if lineRange.length > 0,
       let existingValue = firstAttribute(.listItem, in: editor.attributedText, range: lineRange) {
      if sameListKind(existingValue, value) {
        ListCommand().execute(on: editor, attributeValue: nil)
      } else {
        editor.addAttribute(.listItem, value: value, at: lineRange)
        editor.typingAttributes[.listItem] = value
      }
      scheduleHtmlEmit()
      refreshSelectionState()
      return
    }

    // Pre-seed typingAttributes with a full body style when the current
    // paragraph is empty. Proton's `createListItemInANewLine` inserts a
    // blank-line filler (ZWSP) that inherits whatever typingAttributes are
    // present at the moment. Without a body font / paragraphStyle set,
    // the first bullet ends up using the default system font metrics and
    // the marker rect (drawn at paragraphSpacingBefore from the line top)
    // sits low relative to the text baseline — while subsequent bullets,
    // created via Enter from an already-styled line, inherit consistent
    // metrics and render correctly.
    let paraRange = currentParagraphRange()
    if paraRange.length == 0 {
      var attrs = editor.typingAttributes
      attrs[.font] = UnfoldFonts.body()
      attrs[.foregroundColor] = UnfoldColors.text
      let p = NSMutableParagraphStyle()
      p.paragraphSpacing = 4
      attrs[.paragraphStyle] = p
      editor.typingAttributes = attrs
    }

    ListCommand().execute(on: editor, attributeValue: value)
    scheduleHtmlEmit()
    refreshSelectionState()
  }

  /// Clears list formatting on the current line / selection. Uses
  /// `ListCommand`'s nil-value branch which resets paragraph style and
  /// removes `.listItem`.
  func clearList() {
    if normalizeIndentedParagraphWithoutListIfNeeded() {
      scheduleHtmlEmit()
      refreshSelectionState()
      return
    }

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
    if normalizeIndentedParagraphWithoutListIfNeeded() {
      scheduleHtmlEmit()
      refreshSelectionState()
      return
    }

    if editor.selectedRange.length == 0 {
      let lineRange = currentLineRange()
      if lineRange.length > 0 {
        editor.selectedRange = lineRange
        ListOutdentCommand().execute(on: editor)
        editor.selectedRange = NSRange(location: lineRange.location, length: 0)
        scheduleHtmlEmit()
        refreshSelectionState()
        return
      }
    }

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

  func editor(_ editor: EditorView, didChangeTextAt range: NSRange) {
    normalizeTrailingNewlineAfterHeadingIfNeeded()
    refreshScriptureChips()
    lineDecorationOverlay.invalidate()
    needsCaretVisibilityAfterLayout = true
    scheduleHtmlEmit()
  }

  func editor(_ editor: EditorView, didLayout content: NSAttributedString) {
    layoutOverlay()
    guard needsCaretVisibilityAfterLayout else { return }
    needsCaretVisibilityAfterLayout = false
    scheduleCaretVisibilityUpdate()
  }

  func editor(_ editor: EditorView, didReceiveFocusAt range: NSRange) {
    onFocus?()
  }

  func editor(_ editor: EditorView, didLoseFocusFrom range: NSRange) {
    onBlur?()
  }

  /// Resets typingAttributes to body when Enter is pressed. Without this,
  /// pressing Enter in an H1/H2/H3 keeps the heading font + paragraph style
  /// on the new line; pressing Enter in body that followed a heading leaves
  /// the heading's `paragraphSpacingBefore` on the new empty paragraph
  /// (visible as an outsized gap). Skips list + code-block paragraphs since
  /// those have their own continuation/style rules.
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

    // Skip list paragraphs — Proton's ListTextProcessor owns their
    // continuation + exit logic, and overwriting typingAttributes here
    // would strip the .listItem attr off the next character.
    if firstAttribute(.listItem, in: text, range: paraRange) != nil {
      return
    }

    let blockType = detectedBlockType(in: text, range: paraRange)

    // Skip code blocks — mono font + distinct paragraph spacing we want to keep.
    if blockType == "codeBlock" {
      return
    }

    let isHeading = blockType == "h1" || blockType == "h2" || blockType == "h3"

    if isHeading {
      handled = true

      let insertionLocation = range.location + range.length
      let bodyAttrs = blockTypeAttributes("p")
      let newline = NSAttributedString(string: "\n", attributes: bodyAttrs)

      self.editor.replaceCharacters(in: range, with: newline)

      let bodyParagraphStart = insertionLocation + 1
      let newString = self.editor.attributedText.string as NSString
      let bodyParagraphRange: NSRange
      if bodyParagraphStart < self.editor.attributedText.length {
        bodyParagraphRange = newString.paragraphRange(
          for: NSRange(location: bodyParagraphStart, length: 0))
      } else {
        bodyParagraphRange = NSRange(location: insertionLocation, length: 1)
      }

      if bodyParagraphRange.length > 0 {
        self.editor.removeAttribute(.unfoldBlockType, at: bodyParagraphRange)
        self.editor.addAttributes(bodyAttrs, at: bodyParagraphRange)
      }

      self.editor.typingAttributes = bodyAttrs
      self.editor.selectedRange = NSRange(location: bodyParagraphStart, length: 0)
      self.refreshSelectionState()
      self.scheduleHtmlEmit()
      return
    }

    let bodyPStyle = NSMutableParagraphStyle()
    bodyPStyle.paragraphSpacing = 4
    bodyPStyle.paragraphSpacingBefore = 0
    bodyPStyle.lineHeightMultiple = 0
    bodyPStyle.firstLineHeadIndent = 0
    bodyPStyle.headIndent = 0

    // Defer to next runloop so our reset runs AFTER Proton inserts the \n
    // and UITextView recomputes typingAttributes from attrs-at-cursor. If we
    // set it synchronously here, Proton's downstream processing overrides it.
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      var attrs = self.editor.typingAttributes
      // Always reset paragraphStyle so heading paragraphSpacingBefore can't
      // bleed into the new paragraph and produce an oversized gap.
      attrs[.paragraphStyle] = bodyPStyle
      // Strip any stale block-type marker so the new paragraph is plain body.
      attrs[.unfoldBlockType] = nil
      if isHeading {
        attrs[.font] = UnfoldFonts.body()
        attrs[.foregroundColor] = UnfoldColors.text
      }
      self.editor.typingAttributes = attrs

      // typingAttributes only controls attrs for FUTURE characters. The \n
      // that was just inserted above still carries the heading's
      // paragraphStyle — and because paragraph styles apply to the whole
      // paragraph (the new empty paragraph IS just that \n), the empty line
      // below the heading renders with H1's paragraphSpacingBefore + line
      // height until the user types at least one character. Retroactively
      // patch the just-inserted \n so the empty paragraph renders with body
      // metrics immediately.
      let cursor = self.editor.selectedRange.location
      let textLength = self.editor.attributedText.length
      if cursor > 0 && cursor <= textLength {
        let newlineRange = NSRange(location: cursor - 1, length: 1)
        var nlAttrs: [NSAttributedString.Key: Any] = [.paragraphStyle: bodyPStyle]
        if isHeading {
          nlAttrs[.font] = UnfoldFonts.body()
          nlAttrs[.foregroundColor] = UnfoldColors.text
        }
        self.editor.addAttributes(nlAttrs, at: newlineRange)
      }
      self.refreshSelectionState()
    }
  }

  func editor(
    _ editor: EditorView,
    didChangeSelectionAt range: NSRange,
    attributes: [NSAttributedString.Key: Any],
    contentType: EditorContent.Name
  ) {
    normalizeSelectionAfterHeadingBreakIfNeeded(range)

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

    // Keep caret visible above the keyboard on cursor moves too (arrow keys,
    // tapping into a paragraph below the fold, etc.) — not just on typing.
    // But if a text edit already requested a post-layout correction, let that
    // later pass own the scroll so we don't auto-scroll once on stale line
    // geometry and then correct again after layout settles.
    if !needsCaretVisibilityAfterLayout {
      scheduleCaretVisibilityUpdate()
    }
  }

  private func scheduleCaretVisibilityUpdate() {
    guard !hasPendingCaretVisibilityUpdate else { return }
    hasPendingCaretVisibilityUpdate = true
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.hasPendingCaretVisibilityUpdate = false
      self.ensureCaretVisible()
    }
  }

  /// Keeps the caret comfortably above the keyboard as the user types or
  /// moves the cursor. Proton's EditorView is itself a UIScrollView + custom
  /// content; `scrollRectToVisible` only scrolls the MINIMUM amount needed,
  /// which parks the caret right at the bottom of visible bounds (the
  /// keyboard's top edge) so the line the user is typing on is still clipped.
  /// Instead, compute the caret's Y in content coords and force a scroll
  /// offset that keeps ≥`bottomSafeZone` points of breathing room below.
  private func ensureCaretVisible() {
    guard editor.isFirstResponder else { return }
    guard let selectedRange = editor.textInput.selectedTextRange else { return }
    guard let targetRect = currentSelectedLineRect(fallbackTo: selectedRange.end),
          !targetRect.isNull,
          !targetRect.isInfinite else { return }

    let scrollView = editor.scrollView
    let adjustedInsets = scrollView.adjustedContentInset
    let visibleTop = scrollView.contentOffset.y + adjustedInsets.top
    let visibleHeight = scrollView.bounds.height - adjustedInsets.top - adjustedInsets.bottom
    guard visibleHeight > 0 else { return }
    let visibleBottom = visibleTop + visibleHeight

    // Reserve enough breathing room below the active line so descenders,
    // list markers, and the React Native toolbar sitting above the keyboard all
    // stay visible without tugging the scroll position on every keystroke.
    let bottomSafeZone: CGFloat = 24
    let topSafeZone: CGFloat = 16

    let caretTop = targetRect.minY
    let caretBottom = targetRect.maxY

    var targetOffsetY = scrollView.contentOffset.y
    if caretBottom > visibleBottom - bottomSafeZone {
      targetOffsetY = caretBottom - scrollView.bounds.height + adjustedInsets.bottom + bottomSafeZone
    } else if caretTop < visibleTop + topSafeZone {
      targetOffsetY = caretTop - adjustedInsets.top - topSafeZone
    } else {
      return
    }

    let minOffsetY = -adjustedInsets.top
    let maxOffsetY = max(minOffsetY, scrollView.contentSize.height - scrollView.bounds.height + adjustedInsets.bottom)
    targetOffsetY = min(max(minOffsetY, targetOffsetY), maxOffsetY)
    if abs(targetOffsetY - scrollView.contentOffset.y) < 1.5 { return }
    scrollView.setContentOffset(CGPoint(x: 0, y: targetOffsetY), animated: false)
  }

  private func currentSelectedLineRect(fallbackTo position: UITextPosition) -> CGRect? {
    let textInput = editor.textInput
    guard let textView = textInput as? UITextView else {
      let caretRect = textInput.caretRect(for: position)
      return (!caretRect.isNull && !caretRect.isInfinite) ? caretRect.insetBy(dx: 0, dy: -6) : nil
    }

    let text = textView.attributedText.string as NSString
    if text.length == 0 {
      let caretRect = textInput.caretRect(for: position)
      return (!caretRect.isNull && !caretRect.isInfinite) ? caretRect.insetBy(dx: 0, dy: -6) : nil
    }

    let probeLocation = min(max(editor.selectedRange.location, 0), max(text.length - 1, 0))
    let lineRange = text.lineRange(for: NSRange(location: probeLocation, length: 0))
    if lineRange.location != NSNotFound,
       textView.layoutManager.numberOfGlyphs > 0 {
      let glyphRange = textView.layoutManager.glyphRange(forCharacterRange: lineRange, actualCharacterRange: nil)
      if glyphRange.location != NSNotFound,
         textView.layoutManager.isValidGlyphIndex(glyphRange.location) {
        var effectiveRange = NSRange()
        var lineRect = textView.layoutManager.lineFragmentUsedRect(forGlyphAt: glyphRange.location, effectiveRange: &effectiveRange)
        if !lineRect.isNull && effectiveRange.location != NSNotFound {
          lineRect.origin.x += textView.textContainerInset.left
          lineRect.origin.y += textView.textContainerInset.top

          if lineRange.endLocation >= text.length,
             textView.layoutManager.extraLineFragmentRect.height > 0 {
            var extraRect = textView.layoutManager.extraLineFragmentRect
            extraRect.origin.x += textView.textContainerInset.left
            extraRect.origin.y += textView.textContainerInset.top
            lineRect = lineRect.union(extraRect)
          }

          return lineRect.insetBy(dx: 0, dy: -6)
        }
      }
    }

    guard lineRange.length > 0,
          let start = textInput.position(from: textInput.beginningOfDocument, offset: lineRange.location),
          let end = textInput.position(from: textInput.beginningOfDocument, offset: NSMaxRange(lineRange)),
          let textRange = textInput.textRange(from: start, to: end) else {
      let caretRect = textInput.caretRect(for: position)
      return (!caretRect.isNull && !caretRect.isInfinite) ? caretRect.insetBy(dx: 0, dy: -6) : nil
    }

    var unionRect: CGRect = .null
    for selectionRect in textInput.selectionRects(for: textRange) {
      let rect = selectionRect.rect
      guard rect.height > 1, rect.width > 0 else { continue }
      unionRect = unionRect.union(rect)
    }

    let caretRect = textInput.caretRect(for: position)
    if !caretRect.isNull && !caretRect.isInfinite {
      unionRect = unionRect.isNull ? caretRect : unionRect.union(caretRect)
    }

    guard !unionRect.isNull else { return nil }
    return unionRect.insetBy(dx: 0, dy: -6)
  }

  // MARK: - Internals

  /// Returns the set of attributes for a given block type, suitable for
  /// setting as typingAttributes on an empty paragraph.
  private func blockTypeAttributes(_ type: String) -> [NSAttributedString.Key: Any] {
    switch type {
    case "p":
      let p = NSMutableParagraphStyle()
      p.paragraphSpacing = 4
      p.paragraphSpacingBefore = 0
      p.lineHeightMultiple = 0
      return [.font: UnfoldFonts.body(), .foregroundColor: UnfoldColors.text, .paragraphStyle: p]
    case "h1":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 2; p.paragraphSpacingBefore = 16; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h1, .foregroundColor: UnfoldColors.text, .paragraphStyle: p, .unfoldBlockType: "h1"]
    case "h2":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 2; p.paragraphSpacingBefore = 12; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h2, .foregroundColor: UnfoldColors.text, .paragraphStyle: p, .unfoldBlockType: "h2"]
    case "h3":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 2; p.paragraphSpacingBefore = 10; p.lineHeightMultiple = 1.15
      return [.font: UnfoldFonts.h3, .foregroundColor: UnfoldColors.text, .paragraphStyle: p, .unfoldBlockType: "h3"]
    case "pre":
      let p = NSMutableParagraphStyle(); p.paragraphSpacing = 6; p.paragraphSpacingBefore = 6
      return [.font: UIFont.monospacedSystemFont(ofSize: 15, weight: .regular), .foregroundColor: UnfoldColors.text, .paragraphStyle: p, .unfoldBlockType: "codeBlock"]
    default:
      return [:]
    }
  }

  /// Returns the first non-nil attribute value inside `range`, scanning left to
  /// right. Block identity can disappear at `range.location` after user edits,
  /// so Enter-handling and list/code detection must inspect the whole paragraph.
  private func firstAttribute(
    _ key: NSAttributedString.Key,
    in str: NSAttributedString,
    range: NSRange
  ) -> Any? {
    var result: Any? = nil
    str.enumerateAttribute(key, in: range, options: []) { value, _, stop in
      if let value = value {
        result = value
        stop.pointee = true
      }
    }
    return result
  }

  private func detectedBlockType(in str: NSAttributedString, range: NSRange) -> String? {
    if let explicit = firstAttribute(.unfoldBlockType, in: str, range: range) as? String {
      return explicit
    }

    if firstAttribute(.listItem, in: str, range: range) != nil {
      return "list"
    }

    if let font = firstAttribute(.font, in: str, range: range) as? UIFont {
      let isBoldish = font.fontDescriptor.symbolicTraits.contains(.traitBold)
        || font.fontName.lowercased().contains("semibold")
        || font.fontName.lowercased().contains("bold")

      if isBoldish {
        if font.pointSize >= 26 { return "h1" }
        if font.pointSize >= 20 { return "h2" }
        if font.pointSize >= 17 { return "h3" }
      }
    }

    return nil
  }

  private func sameListKind(_ lhs: Any, _ rhs: Any) -> Bool {
    switch (lhs, rhs) {
    case (_ as ChecklistItem, _ as ChecklistItem):
      return true
    case let (lhs as String, rhs as String):
      return lhs == rhs
    default:
      return false
    }
  }

  @discardableResult
  private func normalizeIndentedParagraphWithoutListIfNeeded() -> Bool {
    let lineRange = currentLineRange()
    guard lineRange.length > 0 else { return false }
    guard firstAttribute(.listItem, in: editor.attributedText, range: lineRange) == nil else { return false }

    let attrs = editor.attributedText.attributes(at: lineRange.location, effectiveRange: nil)
    guard let paragraphStyle = attrs[.paragraphStyle] as? NSParagraphStyle,
          paragraphStyle.firstLineHeadIndent > 0 || paragraphStyle.headIndent > 0 else {
      return false
    }

    let bodyAttrs = blockTypeAttributes("p")
    editor.addAttributes(bodyAttrs, at: lineRange)
    editor.removeAttribute(.listItem, at: lineRange)

    var typing = editor.typingAttributes
    typing[.listItem] = nil
    typing[.paragraphStyle] = bodyAttrs[.paragraphStyle]
    typing[.font] = bodyAttrs[.font]
    typing[.foregroundColor] = bodyAttrs[.foregroundColor]
    editor.typingAttributes = typing
    return true
  }

  private func normalizeTrailingNewlineAfterHeadingIfNeeded() {
    let cursor = editor.selectedRange.location
    let text = editor.attributedText
    let nsString = text.string as NSString

    guard cursor > 0, cursor <= text.length else { return }
    let newlineRange = NSRange(location: cursor - 1, length: 1)
    guard nsString.substring(with: newlineRange) == "\n" else { return }

    let previousProbeLocation = max(0, cursor - 2)
    let previousParagraphRange = nsString.paragraphRange(
      for: NSRange(location: previousProbeLocation, length: 0))

    let previousBlockType = detectedBlockType(in: text, range: previousParagraphRange)
    let wasHeading = previousBlockType == "h1" || previousBlockType == "h2" || previousBlockType == "h3"
    guard wasHeading else { return }

    let bodyAttrs = blockTypeAttributes("p")
    editor.removeAttribute(.unfoldBlockType, at: newlineRange)
    editor.addAttributes(bodyAttrs, at: newlineRange)
    editor.typingAttributes = bodyAttrs
    refreshSelectionState()
  }

  private func normalizeSelectionAfterHeadingBreakIfNeeded(_ range: NSRange) {
    guard range.length == 0 else { return }

    let text = editor.attributedText
    let nsString = text.string as NSString
    let cursor = range.location

    guard cursor > 0, cursor <= text.length else { return }
    let newlineRange = NSRange(location: cursor - 1, length: 1)
    guard nsString.substring(with: newlineRange) == "\n" else { return }

    let previousProbeLocation = max(0, cursor - 2)
    let previousParagraphRange = nsString.paragraphRange(
      for: NSRange(location: previousProbeLocation, length: 0))
    let previousBlockType = detectedBlockType(in: text, range: previousParagraphRange)
    let wasHeading = previousBlockType == "h1" || previousBlockType == "h2" || previousBlockType == "h3"
    guard wasHeading else { return }

    let bodyAttrs = blockTypeAttributes("p")
    editor.removeAttribute(.unfoldBlockType, at: newlineRange)
    editor.addAttributes(bodyAttrs, at: newlineRange)
    editor.typingAttributes = bodyAttrs
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

  /// Sizes the overlay to the editor's scroll-view content and triggers a
  /// redraw. Mirrors the spike's `layoutOverlay` — the overlay is a subview
  /// of the scroll view so it scrolls with the content.
  private func layoutOverlay() {
    let contentSize = editor.scrollView.contentSize
    let editorWidth = editor.bounds.width
    lineDecorationOverlay.frame = CGRect(
      x: 0,
      y: 0,
      width: max(editorWidth, contentSize.width),
      height: max(contentSize.height, editor.bounds.height))
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

  @objc private func handleChecklistMarkerTap(_ gestureRecognizer: UITapGestureRecognizer) {
    let point = gestureRecognizer.location(in: editor)
    guard let charIndex = checklistLineCharIndex(for: point) else { return }
    toggleChecklist(at: charIndex)
  }

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
    let attr = editor.attributedText.attribute(.listItem, at: lineRange.location, effectiveRange: nil)
    return (attr is ChecklistItem) ? charIndex : nil
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldReceive touch: UITouch
  ) -> Bool {
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
