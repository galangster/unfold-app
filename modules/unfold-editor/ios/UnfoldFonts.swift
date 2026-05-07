import UIKit

/// Unfold typography tokens.
/// Mirrors `~/clawd/work/unfold/app/mobile/src/constants/fonts.ts`.
///
/// Inter = body + UI (sans).
/// Gupter = display serif.
///
/// Fonts ship as resources in Resources/Fonts/ and are registered via
/// UIAppFonts in Info.plist (auto-loaded at app start).
enum UnfoldFonts {

  // MARK: - Inter (body / UI)
  //
  // All body font helpers scale to the user's iOS Dynamic Type setting via
  // UIFontMetrics. UI labels (toolbar buttons, chip text) opt OUT by passing
  // `dynamic: false` so they don't grow into other elements.

  static func body(_ size: CGFloat = 16, dynamic: Bool = true) -> UIFont {
    let base = UIFont(name: "Inter-Regular", size: size)
      ?? UIFont.systemFont(ofSize: size, weight: .regular)
    return dynamic ? UIFontMetrics(forTextStyle: .body).scaledFont(for: base) : base
  }

  static func bodyItalic(_ size: CGFloat = 16, dynamic: Bool = true) -> UIFont {
    let base = UIFont(name: "Inter-Italic", size: size)
      ?? UIFont.italicSystemFont(ofSize: size)
    return dynamic ? UIFontMetrics(forTextStyle: .body).scaledFont(for: base) : base
  }

  static func bodyMedium(_ size: CGFloat = 16, dynamic: Bool = true) -> UIFont {
    let base = UIFont(name: "Inter-Medium", size: size)
      ?? UIFont.systemFont(ofSize: size, weight: .medium)
    return dynamic ? UIFontMetrics(forTextStyle: .body).scaledFont(for: base) : base
  }

  static func bodySemiBold(_ size: CGFloat = 16, dynamic: Bool = true) -> UIFont {
    let base = UIFont(name: "Inter-SemiBold", size: size)
      ?? UIFont.systemFont(ofSize: size, weight: .semibold)
    return dynamic ? UIFontMetrics(forTextStyle: .body).scaledFont(for: base) : base
  }

  static func bodyBold(_ size: CGFloat = 16, dynamic: Bool = true) -> UIFont {
    let base = UIFont(name: "Inter-Bold", size: size)
      ?? UIFont.systemFont(ofSize: size, weight: .bold)
    return dynamic ? UIFontMetrics(forTextStyle: .body).scaledFont(for: base) : base
  }

  // MARK: - Gupter display serif
  //
  // Nick prefers serif display type without italic styling.
  static func displaySerif(_ size: CGFloat) -> UIFont {
    UIFont(name: "Gupter-Regular", size: size)
      ?? UIFont.systemFont(ofSize: size, weight: .semibold)
  }

  // MARK: - Heading helpers (Inter Bold/SemiBold; scaled via title text styles)
  //
  // Headings use UIFontMetrics with title1/title2/title3 so they scale on the
  // Apple-recommended curve for headings (slightly less aggressive than body
  // scale). This keeps visual hierarchy intact at every Dynamic Type setting.

  static var h1: UIFont {
    let base = UIFont(name: "Inter-Bold", size: 28)
      ?? UIFont.systemFont(ofSize: 28, weight: .bold)
    return UIFontMetrics(forTextStyle: .title1).scaledFont(for: base)
  }

  static var h2: UIFont {
    let base = UIFont(name: "Inter-Bold", size: 22)
      ?? UIFont.systemFont(ofSize: 22, weight: .bold)
    return UIFontMetrics(forTextStyle: .title2).scaledFont(for: base)
  }

  static var h3: UIFont {
    let base = UIFont(name: "Inter-SemiBold", size: 18)
      ?? UIFont.systemFont(ofSize: 18, weight: .semibold)
    return UIFontMetrics(forTextStyle: .title3).scaledFont(for: base)
  }

  // MARK: - Debug

  /// Logs all available fonts. Useful for verifying PostScript names of bundled fonts.
  static func printAvailableFonts() {
    let interesting = UIFont.familyNames
      .filter { $0.lowercased().contains("inter") || $0.lowercased().contains("gupter") }
    for family in interesting {
      print("[Fonts] family: \(family)")
      for name in UIFont.fontNames(forFamilyName: family) {
        print("[Fonts]   \(name)")
      }
    }
  }
}
