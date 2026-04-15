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
final class UnfoldEditorController: NSObject, EditorViewDelegate {

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

  // MARK: - Private state

  private let editor: EditorView
  private let chipStrip = ScriptureChipStrip()
  private let lineDecorationOverlay = LineDecorationOverlay()
  private let formattingProvider = UnfoldListFormattingProvider()

  private var changeDebounceTimer: DispatchSourceTimer?
  private let changeDebounceQueue = DispatchQueue(
    label: "com.unfold.editor.change-debounce")
  private static let changeDebounceInterval: DispatchTimeInterval = .milliseconds(200)

  // MARK: - Init

  override init() {
    self.rootView = UIView()
    self.editor = EditorView()
    super.init()

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
      chipStrip.topAnchor.constraint(equalTo: rootView.topAnchor, constant: 8),
      chipStrip.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
      chipStrip.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
      chipStrip.heightAnchor.constraint(equalToConstant: 36),

      editor.topAnchor.constraint(equalTo: chipStrip.bottomAnchor, constant: 12),
      editor.leadingAnchor.constraint(equalTo: rootView.leadingAnchor, constant: 16),
      editor.trailingAnchor.constraint(equalTo: rootView.trailingAnchor, constant: -16),
      editor.bottomAnchor.constraint(equalTo: rootView.bottomAnchor, constant: -8),
    ])

    // Decoration overlay — sits inside the editor's scroll view content and
    // draws blockquote bars + code block backgrounds. It also intercepts
    // checklist marker taps in the leftmost zone.
    lineDecorationOverlay.editor = editor
    lineDecorationOverlay.translatesAutoresizingMaskIntoConstraints = false
    editor.scrollView.addSubview(lineDecorationOverlay)
    lineDecorationOverlay.onChecklistMarkerTap = { [weak self] charIndex in
      self?.toggleChecklist(at: charIndex)
    }
    DispatchQueue.main.async { [weak self] in
      self?.layoutOverlay()
    }
  }

  deinit {
    changeDebounceTimer?.cancel()
    changeDebounceTimer = nil
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
    editor.attributedText = HtmlDecoder.decode(html)
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

  // MARK: - Public commands — text formatting

  func toggleBold() {
    BoldCommand().execute(on: editor)
    scheduleHtmlEmit()
  }

  func toggleItalic() {
    ItalicsCommand().execute(on: editor)
    scheduleHtmlEmit()
  }

  // MARK: - Public commands — block types

  /// Applies a block type to the current paragraph. Accepted values:
  /// `"p"`, `"h1"`, `"h2"`, `"h3"`, `"blockquote"`, `"pre"`. Unknown values
  /// are silently ignored so JS callers can't crash the bridge by typoing.
  func setBlockType(_ type: String) {
    let paraRange = currentParagraphRange()
    guard paraRange.length > 0 else { return }

    // Switching out of a code block must strip the `.unfoldBlockType`
    // marker + any pre-specific background fill, otherwise the HtmlEncoder
    // keeps emitting <pre><code> for the paragraph and the visual bg bleeds
    // into the new block type.
    if type != "pre" {
      editor.removeAttribute(.unfoldBlockType, at: paraRange)
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
    ListCommand().execute(on: editor, attributeValue: value)
    scheduleHtmlEmit()
  }

  /// Clears list formatting on the current line / selection. Uses
  /// `ListCommand`'s nil-value branch which resets paragraph style and
  /// removes `.listItem`.
  func clearList() {
    ListCommand().execute(on: editor, attributeValue: nil)
    scheduleHtmlEmit()
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
  }

  func outdentList() {
    ListOutdentCommand().execute(on: editor)
    scheduleHtmlEmit()
  }

  // MARK: - Public commands — history

  func undo() {
    editor.undoManager?.undo()
    scheduleHtmlEmit()
  }

  func redo() {
    editor.undoManager?.redo()
    scheduleHtmlEmit()
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

    let attachment = NSTextAttachment()
    attachment.image = image
    attachment.bounds = CGRect(origin: .zero, size: displaySize)

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
    refreshScriptureChips()
    lineDecorationOverlay.invalidate()
    DispatchQueue.main.async { [weak self] in
      self?.layoutOverlay()
    }
    scheduleHtmlEmit()
  }

  func editor(_ editor: EditorView, didReceiveFocusAt range: NSRange) {
    onFocus?()
  }

  func editor(_ editor: EditorView, didLoseFocusFrom range: NSRange) {
    onBlur?()
  }

  // MARK: - Internals

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
    let contentSize = editor.scrollView.contentSize
    let editorWidth = editor.bounds.width
    lineDecorationOverlay.frame = CGRect(
      x: 0,
      y: 0,
      width: max(editorWidth, contentSize.width),
      height: max(contentSize.height, editor.bounds.height))
    lineDecorationOverlay.invalidate()
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

  /// Toggles the checked state of the checklist line containing `charIndex`.
  /// Called from the LineDecorationOverlay marker tap.
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
