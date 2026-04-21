import UIKit

/// Unfold design tokens (dynamic — automatically respond to dark/light mode).
/// Mirrors `~/clawd/work/unfold/app/mobile/src/constants/colors.ts`.
///
/// All colors are `UIColor` instances built with `UIColor(dynamicProvider:)`
/// so they swap automatically when the user changes their iOS theme.
enum UnfoldColors {

  // MARK: - Backgrounds

  static let background = dynamic(
    dark: hex(0x0A_0A_0A),
    light: hex(0xFA_F7_F2))

  static let backgroundPure = dynamic(
    dark: .black,
    light: .white)

  static let backgroundElevated = dynamic(
    dark: hex(0x14_12_10),
    light: .white)

  // MARK: - Text hierarchy

  static let text = dynamic(
    dark: hex(0xF5_F0_EB),
    light: hex(0x1C_17_10))

  static let textMuted = dynamic(
    dark: hex(0xF5_F0_EB).withAlphaComponent(0.6),
    light: hex(0x1C_17_10).withAlphaComponent(0.68))

  static let textSubtle = dynamic(
    dark: hex(0xF5_F0_EB).withAlphaComponent(0.4),
    light: hex(0x1C_17_10).withAlphaComponent(0.55))

  static let textHint = dynamic(
    dark: hex(0xF5_F0_EB).withAlphaComponent(0.25),
    light: hex(0x1C_17_10).withAlphaComponent(0.40))

  // MARK: - Interactive

  static let inputBackground = dynamic(
    dark: hex(0xF5_F0_EB).withAlphaComponent(0.05),
    light: hex(0x1C_17_10).withAlphaComponent(0.06))

  static let border = dynamic(
    dark: hex(0xF5_F0_EB).withAlphaComponent(0.08),
    light: hex(0x1C_17_10).withAlphaComponent(0.10))

  // MARK: - Accent (warm gold, contrast-tuned per theme)

  /// Bright gold for dark mode. Deeper gold (`#866B2F`, AA contrast on cream) for light.
  static let accent = dynamic(
    dark: hex(0xC8_A5_5C),
    light: hex(0x86_6B_2F))

  static let contrastText = UIColor.white

  // MARK: - Helpers

  private static func hex(_ value: UInt32) -> UIColor {
    let r = CGFloat((value >> 16) & 0xFF) / 255
    let g = CGFloat((value >> 8) & 0xFF) / 255
    let b = CGFloat(value & 0xFF) / 255
    return UIColor(red: r, green: g, blue: b, alpha: 1)
  }

  private static func dynamic(dark: UIColor, light: UIColor) -> UIColor {
    UIColor { traits in
      traits.userInterfaceStyle == .dark ? dark : light
    }
  }
}
