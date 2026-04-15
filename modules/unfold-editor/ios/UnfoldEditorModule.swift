import ExpoModulesCore

public class UnfoldEditorModule: Module {
  public func definition() -> ModuleDefinition {
    Name("UnfoldEditor")

    View(UnfoldEditorView.self) {
      // No props / events yet — this is the Phase B font-bundling smoke test.
    }
  }
}
