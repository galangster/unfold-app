import ExpoModulesCore

/// Expo Module definition for `unfold-editor`.
///
/// All imperative commands live as view-scoped `AsyncFunction`s inside the
/// `View(...)` block. From JS they're called directly on the view ref (see
/// `DomWebView` in `@expo/dom-webview` for the same pattern). Expo Modules
/// dispatches view-scoped AsyncFunctions onto the main thread automatically,
/// so each handler is free to touch `EditorView` directly — no manual
/// `DispatchQueue.main.async` wrapping needed.
public class UnfoldEditorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("UnfoldEditor")

    View(UnfoldEditorView.self) {
      Prop("initialHtml") { (view: UnfoldEditorView, html: String) in
        view.initialHtml = html
      }

      Prop("placeholder") { (view: UnfoldEditorView, text: String?) in
        view.controller.setPlaceholder(text)
      }

      Prop("editable") { (view: UnfoldEditorView, editable: Bool) in
        view.controller.setEditable(editable)
      }

      Prop("autoFocus") { (view: UnfoldEditorView, autoFocus: Bool) in
        // Only trigger on first mount with `true`. The controller's 300ms
        // delay handles layout settling — calling this multiple times is
        // harmless (each call just becomes a no-op once firstResponder).
        if autoFocus {
          view.controller.requestAutoFocus()
        }
      }

      Prop("keyboardAppearance") { (view: UnfoldEditorView, appearance: String) in
        view.controller.setKeyboardAppearance(appearance)
      }

      Prop("keyboardToolbarHeight") { (view: UnfoldEditorView, height: Double) in
        view.controller.setKeyboardToolbarHeight(height)
      }

      Prop("colorScheme") { (view: UnfoldEditorView, scheme: String) in
        view.setColorScheme(scheme)
      }

      Events("onChangeHtml", "onScriptureRefs", "onEditorFocus", "onEditorBlur", "onEditorSelectionChange")

      // --- Day 5: bridge proof (getHtml / focus / blur) ---

      AsyncFunction("getHtml") { (view: UnfoldEditorView) -> String in
        view.controller.getHtml()
      }

      AsyncFunction("focus") { (view: UnfoldEditorView) in
        _ = view.controller.focus()
      }

      AsyncFunction("blur") { (view: UnfoldEditorView) in
        _ = view.controller.blur()
      }

      // --- Day 6: commands 4–14 (§10.B.4) ---

      AsyncFunction("toggleBold") { (view: UnfoldEditorView) in
        view.controller.toggleBold()
      }

      AsyncFunction("toggleItalic") { (view: UnfoldEditorView) in
        view.controller.toggleItalic()
      }

      AsyncFunction("toggleUnderline") { (view: UnfoldEditorView) in
        view.controller.toggleUnderline()
      }

      AsyncFunction("toggleStrikethrough") { (view: UnfoldEditorView) in
        view.controller.toggleStrikethrough()
      }

      AsyncFunction("insertLink") { (view: UnfoldEditorView, url: String) in
        view.controller.insertLink(url)
      }

      AsyncFunction("setBlockType") { (view: UnfoldEditorView, type: String) in
        view.controller.setBlockType(type)
      }

      AsyncFunction("setList") { (view: UnfoldEditorView, type: String) in
        view.controller.setList(type)
      }

      AsyncFunction("clearList") { (view: UnfoldEditorView) in
        view.controller.clearList()
      }

      AsyncFunction("toggleChecklist") { (view: UnfoldEditorView) in
        view.controller.toggleChecklist()
      }

      AsyncFunction("indentList") { (view: UnfoldEditorView) in
        view.controller.indentList()
      }

      AsyncFunction("outdentList") { (view: UnfoldEditorView) in
        view.controller.outdentList()
      }

      AsyncFunction("undo") { (view: UnfoldEditorView) in
        view.controller.undo()
      }

      AsyncFunction("redo") { (view: UnfoldEditorView) in
        view.controller.redo()
      }

      AsyncFunction("insertImage") { (view: UnfoldEditorView, uri: String) in
        view.controller.insertImage(uri)
      }

      // --- Day 8: selection state ---

      AsyncFunction("getSelectionState") { (view: UnfoldEditorView) -> [String: Any] in
        view.controller.getSelectionState()
      }
    }
  }
}
