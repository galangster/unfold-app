require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'UnfoldEditor'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = 'UNLICENSED'
  s.author         = 'Unfold'
  s.homepage       = 'https://unfold.app'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Proton'

  # Only ship the module's own sources. `vendor/Proton` is compiled by the
  # separate ProtonCore/Proton pods (see Podfile), so excluding it here keeps
  # the Swift + ObjC sources from being built twice.
  s.source_files = '*.{h,m,swift}'
  s.exclude_files = 'vendor/**/*'

  s.resource_bundles = {
    'UnfoldEditorFonts' => ['Resources/Fonts/*.ttf']
  }
end
