#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_PORT = 7357;
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), 'logs/voice-assistant-remote.ndjson');
const MAX_BODY_BYTES = 5 * 1024 * 1024;

function parseArgs(argv) {
  const result = {
    port: DEFAULT_PORT,
    output: DEFAULT_OUTPUT_PATH,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value > 0) {
        result.port = Math.floor(value);
      }
      index += 1;
      continue;
    }
    if (arg === '--out') {
      const value = argv[index + 1];
      if (value) {
        result.output = path.resolve(process.cwd(), value);
      }
      index += 1;
    }
  }
  return result;
}

function getLocalIpv4Addresses() {
  const interfaces = os.networkInterfaces();
  const values = Object.values(interfaces).flatMap((items) => items ?? []);
  return values
    .filter((item) => item.family === 'IPv4' && !item.internal)
    .map((item) => item.address);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function normalizeEvents(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && typeof payload === 'object' && Array.isArray(payload.events)) {
    return payload.events;
  }
  return [];
}

async function main() {
  const { port, output } = parseArgs(process.argv.slice(2));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  if (!fs.existsSync(output)) {
    fs.writeFileSync(output, '', 'utf8');
  }

  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    if (request.method !== 'POST' || request.url !== '/ingest') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    try {
      const rawBody = await readRequestBody(request);
      const parsed = rawBody ? JSON.parse(rawBody) : {};
      const events = normalizeEvents(parsed);
      if (events.length === 0) {
        response.writeHead(202, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, accepted: 0 }));
        return;
      }

      const nowIso = new Date().toISOString();
      const remoteAddress = request.socket.remoteAddress ?? 'unknown';
      const lines = events
        .map((event) =>
          JSON.stringify({
            receivedAt: nowIso,
            remoteAddress,
            ...event,
          }),
        )
        .join('\n');
      fs.appendFileSync(output, `${lines}\n`, 'utf8');

      const firstEvent = events[0] ?? {};
      const channel = typeof firstEvent.channel === 'string' ? firstEvent.channel : 'unknown';
      const traceId =
        typeof firstEvent.payload?.traceId === 'string'
          ? firstEvent.payload.traceId
          : typeof firstEvent.payload?.trace_id === 'string'
          ? firstEvent.payload.trace_id
          : '-';
      console.log(
        `[collector] accepted=${events.length} channel=${channel} traceId=${traceId} from=${remoteAddress}`,
      );

      response.writeHead(204);
      response.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: message }));
    }
  });

  server.listen(port, '0.0.0.0', () => {
    const ips = getLocalIpv4Addresses();
    console.log(`[collector] writing logs to ${output}`);
    console.log(`[collector] listening on http://0.0.0.0:${port}/ingest`);
    if (ips.length > 0) {
      ips.forEach((ip) => {
        console.log(`[collector] phone endpoint: http://${ip}:${port}/ingest`);
      });
    }
    console.log('[collector] health: GET /health');
  });
}

void main();
