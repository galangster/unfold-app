#!/usr/bin/env node
/**
 * Dev-only canned replies for auto-trial generating fixtures.
 * Bind to 127.0.0.1:8797. No production seam.
 *
 *   node scripts/qa/trial-series-stub-server.mjs
 */
import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 8797;
const JOB_GENERATING = 'qa-fixture-generating';
const JOB_FAILED = 'qa-fixture-failed';

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function jobReply(jobId) {
  if (jobId === JOB_FAILED) {
    return {
      jobId,
      status: 'failed',
      jobType: 'initial_arc',
      canRetry: true,
      error: 'Generation failed on server',
    };
  }
  return {
    jobId: jobId || JOB_GENERATING,
    status: 'processing',
    jobType: 'initial_arc',
  };
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}:${PORT}`);
  const path = url.pathname;

  if (req.method === 'GET' && path === '/api/config') {
    json(res, 200, {
      version: 1,
      source: 'db',
      autoTrialSeries: {
        enabled: true,
        platforms: ['ios', 'android'],
        maxTrialDays: 7,
      },
    });
    return;
  }

  if (req.method === 'POST' && path === '/api/jobs/generate-day') {
    json(res, 201, jobReply(JOB_GENERATING));
    return;
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)(?:\/retry)?$/);
  if (jobMatch && (req.method === 'GET' || req.method === 'POST')) {
    json(res, 200, jobReply(decodeURIComponent(jobMatch[1])));
    return;
  }

  if (req.method === 'POST' && path === '/api/sync/push') {
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown stub route' } });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`trial-series stub listening on http://${HOST}:${PORT}\n`);
});
