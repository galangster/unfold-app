Pod::Spec.new do |s|
  s.name           = 'Proton'
  s.version        = '1.0.0'
  s.summary        = 'Proton native rich text editor (vendored for Unfold)'
  s.description    = 'Vendored copy of Proton Sources/Swift. Mirrors the Proton SPM target. Depends on ProtonCore for ObjC interop.'
  s.homepage       = 'https://github.com/rajdeep/proton'
  s.license        = { :type => 'Apache-2.0' }
  s.author         = { 'Rajdeep Kwatra' => 'rajdeep@example.com' }
  s.source         = { :git => '' }
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'

  s.source_files   = 'Sources/Swift/**/*.swift'
  s.dependency 'ProtonCore'
end
