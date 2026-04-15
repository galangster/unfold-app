import CoreText
import Foundation
import UIKit

/// Phase B smoke test: bundle a single custom font inside an Expo Module
/// and prove it loads at runtime via CTFontManagerRegisterFontsForURL.
///
/// If this class can resolve "Inter-Regular" after `registerIfNeeded()` runs,
/// the font-bundling path for the full native editor module works.
enum UnfoldEditorFontLoader {

  private static var didRegister = false

  /// Registers every .ttf in the module's resource bundle. Idempotent —
  /// subsequent calls are no-ops.
  static func registerIfNeeded() {
    guard !didRegister else { return }
    didRegister = true

    guard let bundle = resourceBundle() else {
      NSLog("[UnfoldEditor] FONT_LOADER: resource bundle not found")
      return
    }

    guard let urls = bundle.urls(forResourcesWithExtension: "ttf", subdirectory: nil),
          !urls.isEmpty
    else {
      NSLog("[UnfoldEditor] FONT_LOADER: no .ttf files in resource bundle at \(bundle.bundleURL.path)")
      return
    }

    for url in urls {
      var errorRef: Unmanaged<CFError>?
      let ok = CTFontManagerRegisterFontsForURL(url as CFURL, .process, &errorRef)
      if ok {
        NSLog("[UnfoldEditor] FONT_LOADER: registered \(url.lastPathComponent)")
      } else {
        let err = errorRef?.takeRetainedValue()
        NSLog("[UnfoldEditor] FONT_LOADER: FAILED \(url.lastPathComponent) — \(String(describing: err))")
      }
    }

    logResolvedInterFamily()
  }

  /// Returns the first PostScript name from the "Inter" family, or nil.
  /// Called AFTER `registerIfNeeded()` to prove the bundled font is live.
  static func resolvedInterPostScriptName() -> String? {
    let interFamilies = UIFont.familyNames.filter { $0.lowercased().contains("inter") }
    for family in interFamilies {
      let names = UIFont.fontNames(forFamilyName: family)
      if let first = names.first {
        return first
      }
    }
    return nil
  }

  // MARK: - Private

  private static func resourceBundle() -> Bundle? {
    // CocoaPods resource_bundles drops a .bundle file next to the framework.
    // With use_frameworks! linkage, the framework bundle contains
    // UnfoldEditorFonts.bundle as a nested resource.
    let moduleBundle = Bundle(for: BundleToken.self)
    if let url = moduleBundle.url(forResource: "UnfoldEditorFonts", withExtension: "bundle"),
       let nested = Bundle(url: url)
    {
      return nested
    }
    // Fall back to the module bundle itself (static lib linkage copies
    // resources directly into the app bundle).
    return moduleBundle
  }

  private static func logResolvedInterFamily() {
    let interFamilies = UIFont.familyNames.filter { $0.lowercased().contains("inter") }
    if interFamilies.isEmpty {
      NSLog("[UnfoldEditor] FONT_LOADER: no Inter family found after registration")
      return
    }
    for family in interFamilies {
      NSLog("[UnfoldEditor] FONT_LOADER: family '\(family)'")
      for name in UIFont.fontNames(forFamilyName: family) {
        NSLog("[UnfoldEditor] FONT_LOADER:   postscript '\(name)'")
      }
    }
  }

  private final class BundleToken {}
}
