require 'digest'

# Backport RevenueCat's Xcode 27 fix without changing the installed SDK version.
# https://github.com/RevenueCat/purchases-ios/commit/870899891ac9a05118ae6ee16d4ae189b2c1eac2
module UnfoldRevenueCatCompatibility
  ORIGINAL_SHA = '7d5eb572233ad587841d61be7294b32583d35724be6aa39006982d298774c511'.freeze
  PATCHED_SHA = 'c24c2c37e341bc2bd33dcdfeb9b0b6f394e1f5eb0609774c3aa50f41b3610344'.freeze
  INITIALIZER = <<~SWIFT.lines.map { |line| "    #{line}" }.join.freeze
    /// "Designated" initializer
    private init(stringRepresentation: String, underlyingColor: (any Sendable)?) {
        self.stringRepresentation = stringRepresentation
        self._underlyingColor = underlyingColor
    }
  SWIFT
  MARKER = "    fileprivate var _underlyingColor: (any Sendable)?\n\n".freeze

  def self.apply(path)
    source = File.binread(path)
    digest = Digest::SHA256.hexdigest(source)
    return :unchanged if digest == PATCHED_SHA
    raise 'RevenueCat PaywallColor changed. Review the Xcode 27 backport before building.' unless digest == ORIGINAL_SHA

    patched = source.sub(INITIALIZER + "\n", '').sub(MARKER, MARKER + INITIALIZER)
    raise 'RevenueCat Xcode 27 backport did not match the reviewed patch.' unless Digest::SHA256.hexdigest(patched) == PATCHED_SHA

    mode = File.stat(path).mode
    begin
      File.chmod(mode | 0200, path)
      File.binwrite(path, patched)
    ensure
      File.chmod(mode, path)
    end
    :patched
  end
end
