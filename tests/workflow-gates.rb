# Static workflow contract and synthetic dependency checks, not a GitHub runner.
# Uses Ruby's bundled YAML parser; no third-party test dependencies.
require 'yaml'
require 'json'

def check(condition, message)
  raise message unless condition
end

def dependencies(job)
  Array(job['needs'])
end

def verify(workflow)
  jobs = workflow.fetch('jobs')
  required = %w[editor-csp-regressions native-validation verify-return]
  check(dependencies(jobs.fetch('build')).sort == required.sort,
        'Packaging must require browser, native and portable verification')
  check(dependencies(jobs.fetch('portable-windows')) == ['portable-mac'],
        'Windows portable check must wait for the Mac parcel')
  check(dependencies(jobs.fetch('verify-return')) == ['portable-windows'],
        'Return verification must wait for the Windows reply')

  %w[editor-csp-regressions native-validation portable-mac portable-windows verify-return build].each do |id|
    job = jobs.fetch(id)
    check(!job.key?('if') && !job.key?('continue-on-error'),
          "#{id} must retain the default success-only job condition")
    job.fetch('steps').each do |step|
      check(!step.key?('continue-on-error'), "#{id} cannot ignore failed steps")
      if step.key?('if')
        check(id == 'native-validation' &&
              step['name'] == 'Check shared library for iPhone simulator' &&
              step['if'] == "runner.os == 'macOS'", 'Unexpected step-condition bypass')
      end
    end
  end

  native = jobs.fetch('native-validation')
  check(native.dig('strategy', 'matrix', 'os').sort == %w[macos-latest windows-latest],
        'Native validation must cover both platforms')
  commands = native.fetch('steps').map { |step| step['run'] }.compact
  check(commands.include?('cargo test --locked --manifest-path crates/library/Cargo.toml'),
        'Shared SQLite tests must remain required')
  check(commands.include?('cargo test --locked --manifest-path src-tauri/Cargo.toml --features inline-images-preview'),
        'Native storage tests must remain required')
  check(commands.any? { |cmd| cmd.include?('cargo check --locked --manifest-path crates/library/Cargo.toml --target aarch64-apple-ios-sim') },
        'Existing iOS compatibility check must remain')

  {'portable-mac'=>'send', 'portable-windows'=>'reply', 'verify-return'=>'verify'}.each do |job, mode|
    expected = "cargo run --locked --manifest-path crates/library/Cargo.toml --example platform_portable -- #{mode} test-parcel"
    check(jobs.fetch(job).fetch('steps').any? { |step| step['run'] == expected },
          "#{job} must exercise portable-master interchange")
  end

  config=JSON.parse(File.read(File.expand_path('../src-tauri/tauri.preview.conf.json', __dir__)))
  check(config.dig('build','features') == ['inline-images-preview'], 'Update native test features when packaged features change')
  main_config=JSON.parse(File.read(File.expand_path('../src-tauri/tauri.conf.json', __dir__)))
  check(main_config.dig('build','features') == config.dig('build','features'), 'Main and preview must test the same packaged image features')
  build = jobs.fetch('build')
  check(build.dig('strategy', 'matrix', 'include') == [
    {'os'=>'windows-latest', 'bundles'=>'nsis', 'name'=>'Windows-current-user'},
    {'os'=>'macos-latest', 'bundles'=>'app,dmg', 'name'=>'macOS-Apple-Silicon'}
  ], 'Installer matrix must remain unchanged')
  package = build.fetch('steps').find { |step| step['name'] == 'Package application' }
  expected = "cargo tauri build ${{ github.ref_name == 'sqlite-handoff-preview' && '--config src-tauri/tauri.preview.conf.json' || '' }} --bundles ${{ matrix.bundles }}"
  check(package && package['run'] == expected, 'Packaging command must remain unchanged')
  upload = build.fetch('steps').find { |step| step['uses'] == 'actions/upload-artifact@v6' }
  check(upload && upload['with'] == {
    'name'=>'${{ matrix.name }}', 'if-no-files-found'=>'error',
    'path'=>"src-tauri/target/release/bundle/nsis/*-setup.exe\nsrc-tauri/target/release/bundle/dmg/*.dmg\n"
  }, 'Both installer artifact paths and names must remain unchanged')
  check(build['steps'].index(upload) > build['steps'].index(package), 'Upload must follow packaging')
  # Only the guarded build job may upload distributables; portable fixtures are test data.
  jobs.each do |id, job|
    next if id == 'build'
    job.fetch('steps').each do |step|
      next unless step.fetch('uses', '').start_with?('actions/upload-artifact@')
      check(%w[portable-mac portable-windows].include?(id) &&
            step.dig('with', 'path') == 'test-parcel', 'Unexpected unguarded artifact upload')
    end
  end
  jobs
end

workflow = YAML.safe_load(File.read(File.expand_path('../.github/workflows/build.yml', __dir__)))
jobs = verify(workflow)
puts 'PASS workflow dependencies, required validation and unchanged installer contract'

# Evaluate the declared graph with synthetic outcomes, including either native platform failing.
states = %w[success failure cancelled skipped]
scenarios = 0
states.repeated_permutation(6) do |browser, windows, mac, send, reply, returned|
  results = {}
  requested = {
    'editor-csp-regressions'=>browser,
    'native-validation'=>[windows, mac].all? { |s| s == 'success' } ? 'success' : 'failure',
    'portable-mac'=>send, 'portable-windows'=>reply, 'verify-return'=>returned, 'build'=>'success'
  }
  requested.each do |id, outcome|
    results[id] = dependencies(jobs.fetch(id)).all? { |dep| results[dep] == 'success' } ? outcome : 'skipped'
  end
  all_pass = [browser, windows, mac, send, reply, returned].all? { |s| s == 'success' }
  check((results['build'] == 'success') == all_pass, "Unsafe packaging result: #{results}")
  scenarios += 1
end
puts "PASS #{scenarios} synthetic success/failure/cancellation/skip combinations"

mutations = []
%w[editor-csp-regressions native-validation verify-return].each do |dep|
  mutations << ->(w) { w['jobs']['build']['needs'].delete(dep) }
end
mutations.concat([
  ->(w) { w['jobs']['build']['if'] = 'always()' },
  ->(w) { w['jobs']['verify-return'].delete('needs') },
  ->(w) { w['jobs']['native-validation']['strategy']['matrix']['os'].delete('windows-latest') },
  ->(w) { w['jobs']['native-validation']['steps'].find { |s| s['name'] == 'Native storage tests' }['continue-on-error'] = true },
  ->(w) { w['jobs']['build']['steps'].last['with']['path'] = 'only-a-mac.dmg' }
])
mutations.each_with_index do |mutate, index|
  copy = Marshal.load(Marshal.dump(workflow))
  mutate.call(copy)
  rejected = false
  begin
    verify(copy)
  rescue RuntimeError
    rejected = true
  end
  check(rejected, "Workflow mutation #{index + 1} was not detected")
end
puts "PASS #{mutations.length} deliberate workflow regressions rejected"

# Tauri checks frontendDist before Cargo runs the existing frontend generator.
def verify_frontend_bootstrap(placeholder_exists, build_script)
  check(placeholder_exists, 'A clean checkout must contain the web directory')
  check(build_script.include?('cargo:rerun-if-changed=../web/index.html'),
        'Missing generated frontend must invalidate the cached Cargo build script')
end
root=File.expand_path('..', __dir__)
script=File.read(File.join(root, 'src-tauri/build.rs'))
verify_frontend_bootstrap(File.file?(File.join(root, 'web/.gitkeep')), script)
[[false, script], [true, script.gsub('cargo:rerun-if-changed=../web/index.html','')]].each do |placeholder, source|
  rejected=false
  begin
    verify_frontend_bootstrap(placeholder, source)
  rescue RuntimeError
    rejected=true
  end
  check(rejected, 'Frontend bootstrap regression was not detected')
end
puts 'PASS clean-checkout directory and cache-invalidation guards; two deliberate bootstrap regressions rejected'
