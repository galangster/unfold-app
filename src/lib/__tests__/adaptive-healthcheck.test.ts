import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { HAIKU_REQUEST_MODEL } from '../ai-model';

const scriptUrl = pathToFileURL(join(process.cwd(), 'scripts/adaptive-healthcheck.mjs')).href;

function runHealthcheck(payload: unknown, status = 200) {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `
    globalThis.fetch = async (url, options) => {
      console.log('REQUEST ' + JSON.stringify({ url, ...options, body: JSON.parse(options.body) }));
      return {
        ok: ${status >= 200 && status < 300},
        status: ${status},
        text: async () => ${JSON.stringify(JSON.stringify(payload))},
      };
    };
    await import(${JSON.stringify(scriptUrl)});
  `], {
    encoding: 'utf8',
    env: { NODE_ENV: 'test', EXPO_PUBLIC_BACKEND_URL: 'https://healthcheck.invalid' },
    timeout: 10_000,
  });
  const requests = result.stdout.split('\n')
    .filter((line) => line.startsWith('REQUEST '))
    .map((line) => JSON.parse(line.slice('REQUEST '.length)));
  return { ...result, requests };
}

describe('adaptive healthcheck request contract', () => {
  it.each([
    { question: 'Which part of this synthetic study interests you?' },
    { content: [{ text: '{"question":"Which part of this synthetic study interests you?"}' }] },
  ])('checks the app request model before accepting a supported response', (payload) => {
    const result = runHealthcheck(payload);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      url: 'https://healthcheck.invalid/api/generate/adaptive-question',
      method: 'POST',
      body: { model: HAIKU_REQUEST_MODEL },
    });
    expect(result.stdout).toContain('[adaptive-health] PASS');
  });

  it('rejects a successful response that has no question', () => {
    const result = runHealthcheck({ question: ' ' });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('[adaptive-health] PASS');
  });

  it('rejects a failed HTTP response even when it contains a question', () => {
    const result = runHealthcheck({ question: 'Synthetic failure payload.' }, 503);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('[adaptive-health] PASS');
  });
});
