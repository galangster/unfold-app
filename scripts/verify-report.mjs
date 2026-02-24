import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const startedAt = new Date();
const lines = [];

function run(name, cmd) {
  const t0 = Date.now();
  try {
    const out = execSync(cmd, { encoding: 'utf8' });
    const ms = Date.now() - t0;
    lines.push(`## ${name}\n- status: PASS\n- duration_ms: ${ms}\n\n\`\`\`\n${out.trim()}\n\`\`\``);
    return true;
  } catch (e) {
    const ms = Date.now() - t0;
    const out = `${e?.stdout || ''}\n${e?.stderr || ''}`.trim();
    lines.push(`## ${name}\n- status: FAIL\n- duration_ms: ${ms}\n\n\`\`\`\n${out}\n\`\`\``);
    return false;
  }
}

const checks = [
  ['verify:changed', 'bun run verify:changed'],
  ['verify:smoke', 'bun run verify:smoke'],
];

let ok = true;
for (const [name, cmd] of checks) {
  if (!run(name, cmd)) ok = false;
}

mkdirSync('reports/cvl', { recursive: true });
const finishedAt = new Date();
const summary = `# CVL Report\n\n- started_at: ${startedAt.toISOString()}\n- finished_at: ${finishedAt.toISOString()}\n- status: ${ok ? 'PASS' : 'FAIL'}\n\n${lines.join('\n\n')}`;
writeFileSync('reports/cvl/latest.md', summary);
writeFileSync('reports/cvl/latest.json', JSON.stringify({ startedAt, finishedAt, ok }, null, 2));

if (!ok) process.exit(1);
