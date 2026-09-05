import { captureSimulatorReleaseProof } from './release-proof-lib.mjs';

function parseArgs(argv) {
  const out = { flags: {}, env: process.env };
  for (let i = 2; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--stamp-production') {
      out.flags.stampProduction = true;
      continue;
    }
    if (!flag.startsWith('--')) {
      throw new Error(`unexpected argument ${flag}`);
    }
    const key = flag.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`missing value for --${key}`);
    }
    out.flags[key] = value;
    i += 1;
  }
  return out;
}

const { flags, env } = parseArgs(process.argv);
if (flags['runtime-status'] !== undefined || flags.app !== undefined) {
  console.error('[cvl] capture FAIL: caller-supplied --runtime-status or --app is not release proof');
  process.exit(1);
}
for (const key of ['candidate', 'native', 'derived-data', 'simulator', 'out']) {
  if (!flags[key]) {
    console.error(`[cvl] capture FAIL: --${key} is required`);
    process.exit(1);
  }
}

const result = captureSimulatorReleaseProof({
  candidateDir: flags.candidate,
  nativeDir: flags.native,
  derivedData: flags['derived-data'],
  simulator: flags.simulator,
  outPath: flags.out,
  stampProduction: flags.stampProduction === true,
  env,
});
if (!result.ok) {
  console.error(`[cvl] capture FAIL: ${result.reason}`);
  process.exit(1);
}
console.log(`[cvl] captured simulator-release evidence: ${result.recordPath}`);
console.log('[cvl] local evidence record only; not App Store IPA or physical-device proof');
