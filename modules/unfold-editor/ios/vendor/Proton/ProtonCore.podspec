Pod::Spec.new do |s|
  s.name           = 'ProtonCore'
  s.version        = '1.0.0'
  s.summary        = 'Proton ObjC core (vendored for Unfold)'
  s.description    = 'Vendored copy of Proton Sources/ObjC. Mirrors the ProtonCore SPM target.'
  s.homepage       = 'https://github.com/rajdeep/proton'
  s.license        = { :type => 'Apache-2.0' }
  s.author         = { 'Rajdeep Kwatra' => 'rajdeep@example.com' }
  s.source         = { :git => '' }
  s.platforms      = { :ios => '15.1' }

  s.source_files         = 'Sources/ObjC/**/*.{h,m}'
  s.public_header_files  = 'Sources/ObjC/include/*.h'
end
