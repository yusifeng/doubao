#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PKG = 'com.anonymous.mydoubao2';
const REMOTE_DIR = 'files/dialog-sdk-debug';
const LOG_GLOB = 'speech_sdk_';
const ROOT = process.cwd();
const ARCHIVE_DIR = path.join(ROOT, 'tmp', 'voice-log-archive');
const REPORT_DIR = path.join(ROOT, 'tmp', 'voice-log-reports');
const MAX_SYNC_FILES = 6;
const MAX_ARCHIVE_FILES = 40;
const MAX_REPORT_FILES = 80;
const MESSAGE_TYPE_NAME_MAP = {
  3003: 'MESSAGE_TYPE_DIALOG_SESSION_STARTED_LEGACY',
  3007: 'MESSAGE_TYPE_DIALOG_TTS_SENTENCE_END',
  3008: 'MESSAGE_TYPE_DIALOG_TTS_SENTENCE_START',
  3009: 'MESSAGE_TYPE_DIALOG_USAGE_RESPONSE',
  3010: 'MESSAGE_TYPE_DIALOG_TTS_RESPONSE',
  3011: 'MESSAGE_TYPE_DIALOG_TTS_ENDED',
  3012: 'MESSAGE_TYPE_DIALOG_ASR_INFO',
  3013: 'MESSAGE_TYPE_DIALOG_ASR_RESPONSE',
  3014: 'MESSAGE_TYPE_DIALOG_ASR_ENDED',
  3015: 'MESSAGE_TYPE_DIALOG_CHAT_RESPONSE',
  3016: 'MESSAGE_TYPE_DIALOG_CHAT_ENDED',
  3018: 'MESSAGE_TYPE_DIALOG_PLAYER_AUDIO',
  3019: 'MESSAGE_TYPE_PLAYER_START_PLAY_AUDIO',
  3020: 'MESSAGE_TYPE_PLAYER_FINISH_PLAY_AUDIO',
  350: 'MESSAGE_TYPE_EVENT_TTS_SENTENCE_START_LEGACY',
  352: 'MESSAGE_TYPE_EVENT_TTS_RESPONSE_LEGACY',
  359: 'MESSAGE_TYPE_EVENT_TTS_ENDED_LEGACY',
  450: 'MESSAGE_TYPE_EVENT_ASR_INFO_LEGACY',
  451: 'MESSAGE_TYPE_EVENT_ASR_RESPONSE_LEGACY',
  550: 'MESSAGE_TYPE_EVENT_CHAT_RESPONSE_LEGACY',
  559: 'MESSAGE_TYPE_EVENT_CHAT_ENDED_LEGACY',
};

function formatCodeWithName(code) {
  const name = MESSAGE_TYPE_NAME_MAP[code];
  return name ? `${code} (${name})` : String(code);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function ensureDir(target) {
  fs.mkdirSync(target, { recursive: true });
}

function parseArgs(argv) {
  const flags = {
    sync: true,
    file: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') {
      flags.help = true;
      continue;
    }
    if (token === '--no-sync') {
      flags.sync = false;
      continue;
    }
    if (token === '--file') {
      flags.file = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
  }
  return flags;
}

function printHelp() {
  console.log([
    'voice-log-diagnose',
    '',
    'Usage:',
    '  pnpm run voice:diag',
    '  pnpm run voice:diag -- --no-sync',
    '  pnpm run voice:diag -- --file /absolute/path/to/speech_sdk_xxx.log',
    '',
    'Behavior:',
    '  1) If a device is connected, sync newest speech_sdk logs into tmp/voice-log-archive/',
    '  2) Parse one selected log file (latest archive by default)',
    '  3) Write a markdown report into tmp/voice-log-reports/',
    '',
    'The command can run without a connected device when archive logs already exist.',
  ].join('\n'));
}

function hasConnectedDevice() {
  try {
    const output = run('adb', ['devices'], { encoding: 'utf8' });
    const lines = output.split(/\r?\n/).slice(1).map((line) => line.trim()).filter(Boolean);
    return lines.some((line) => line.endsWith('\tdevice'));
  } catch {
    return false;
  }
}

function listRemoteLogs() {
  const output = run(
    'adb',
    ['shell', 'run-as', PKG, 'ls', '-1t', REMOTE_DIR],
    { encoding: 'utf8' },
  );
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(LOG_GLOB) && line.endsWith('.log'))
    .slice(0, MAX_SYNC_FILES);
}

function syncFromDevice() {
  if (!hasConnectedDevice()) {
    return { synced: [], skipped: true, reason: 'no_device' };
  }
  let remoteFiles = [];
  try {
    remoteFiles = listRemoteLogs();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { synced: [], skipped: true, reason: `list_failed:${message}` };
  }
  const synced = [];
  for (const fileName of remoteFiles) {
    const localPath = path.join(ARCHIVE_DIR, fileName);
    if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
      continue;
    }
    const remotePath = `${REMOTE_DIR}/${fileName}`;
    try {
      const content = run(
        'adb',
        ['exec-out', 'run-as', PKG, 'cat', remotePath],
      );
      fs.writeFileSync(localPath, content);
      synced.push(localPath);
    } catch {
      // Ignore one-off pull failures and continue with available logs.
    }
  }
  return { synced, skipped: false, reason: '' };
}

function listArchivedLogs() {
  ensureDir(ARCHIVE_DIR);
  return fs.readdirSync(ARCHIVE_DIR)
    .filter((name) => name.startsWith(LOG_GLOB) && name.endsWith('.log'))
    .map((name) => path.join(ARCHIVE_DIR, name))
    .sort((left, right) => {
      const leftName = path.basename(left);
      const rightName = path.basename(right);
      if (leftName !== rightName) {
        return rightName.localeCompare(leftName);
      }
      const leftStat = fs.statSync(left).mtimeMs;
      const rightStat = fs.statSync(right).mtimeMs;
      return rightStat - leftStat;
    });
}

function pruneByName(targetDir, prefix, suffix, keepMax) {
  ensureDir(targetDir);
  const entries = fs.readdirSync(targetDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .sort((left, right) => right.localeCompare(left));
  const stale = entries.slice(keepMax);
  for (const fileName of stale) {
    try {
      fs.unlinkSync(path.join(targetDir, fileName));
    } catch {
      // Best effort.
    }
  }
}

function safeJsonParse(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function appendToken(targetMap, key, token) {
  if (!key || !token) {
    return;
  }
  const current = targetMap.get(key) ?? '';
  targetMap.set(key, `${current}${token}`);
}

function collectId(targetSet, value) {
  if (typeof value !== 'string') {
    return;
  }
  const normalized = value.trim();
  if (!normalized) {
    return;
  }
  targetSet.add(normalized);
}

function analyzeLog(logPath) {
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const stats = {
    lineCount: lines.length,
    firstTimestamp: null,
    lastTimestamp: null,
  };

  const receivedCounts = new Map();
  const keyEvents = [];
  const asrFinals = [];
  const defaultReplyById = new Map();
  const customChunks = [];
  const send500Records = [];
  const received3010Times = [];
  const received3011Times = [];
  const received359Times = [];
  const seenQuestionIds = new Set();
  const seenReplyIds = new Set();
  const seenTraceIds = new Set();

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const tsMatch = line.match(/^\[(.*?)\]/);
    const timestamp = tsMatch?.[1] ?? '';
    if (timestamp) {
      if (!stats.firstTimestamp) {
        stats.firstTimestamp = timestamp;
      }
      stats.lastTimestamp = timestamp;
    }

    const recvMatch = line.match(/Received message type (\d+)/);
    if (recvMatch) {
      const code = Number(recvMatch[1]);
      receivedCounts.set(code, (receivedCounts.get(code) ?? 0) + 1);
      if (code === 3010) {
        received3010Times.push(timestamp);
      }
      if (code === 3011) {
        received3011Times.push(timestamp);
      }
      if (code === 3008 || code === 3010 || code === 3011) {
        keyEvents.push({
          timestamp,
          source: 'recv',
          code,
          summary: `message_type=${formatCodeWithName(code)}`,
        });
      }
    }

    const getEventMatch = line.match(/Get message event: (\d+), payload: (.*)$/);
      if (getEventMatch) {
        const code = Number(getEventMatch[1]);
        const payloadRaw = getEventMatch[2];
        const payload = safeJsonParse(payloadRaw);
        if (payload && typeof payload === 'object') {
          collectId(seenQuestionIds, payload.question_id);
          collectId(seenReplyIds, payload.reply_id);
          collectId(seenTraceIds, payload.trace_id);
        }
        if (code === 350 || code === 352 || code === 359) {
          keyEvents.push({
            timestamp,
            source: 'event',
            code,
            summary: `event=${formatCodeWithName(code)}`,
          });
        }
        if (code === 359) {
          received359Times.push(timestamp);
      }
      if (code === 451 && payload && Array.isArray(payload.results)) {
        for (const item of payload.results) {
          if (item && item.is_interim === false && typeof item.text === 'string' && item.text.trim()) {
            asrFinals.push({
              timestamp,
              text: item.text.trim(),
              questionId:
                typeof payload.question_id === 'string' && payload.question_id.trim()
                  ? payload.question_id.trim()
                  : null,
            });
          }
        }
      }
      if (code === 550 && payload && typeof payload.content === 'string') {
        const replyId = typeof payload.reply_id === 'string' ? payload.reply_id : 'unknown';
        const questionId =
          typeof payload.question_id === 'string' && payload.question_id.trim()
            ? payload.question_id.trim()
            : null;
        const previous = defaultReplyById.get(replyId) ?? {
          text: '',
          questionId: null,
        };
        previous.text = `${previous.text}${payload.content}`;
        if (!previous.questionId && questionId) {
          previous.questionId = questionId;
        }
        defaultReplyById.set(replyId, previous);
      }
      continue;
    }

    const sendEventMatch = line.match(/Send event: (\d+), payload: (.*)$/);
    if (sendEventMatch) {
      const code = Number(sendEventMatch[1]);
      const payloadRaw = sendEventMatch[2];
      const payload = safeJsonParse(payloadRaw);
      if (code === 500 && payload) {
        const chunk = typeof payload.content === 'string' ? payload.content : '';
        const start = payload.start === true;
        const end = payload.end === true;
        const questionId =
          typeof payload.question_id === 'string' && payload.question_id.trim()
            ? payload.question_id.trim()
            : null;
        const replyId =
          typeof payload.reply_id === 'string' && payload.reply_id.trim()
            ? payload.reply_id.trim()
            : null;
        const traceId =
          typeof payload.trace_id === 'string' && payload.trace_id.trim()
            ? payload.trace_id.trim()
            : null;
        send500Records.push({ timestamp, start, end, chunk, questionId, replyId });
        if (questionId) {
          seenQuestionIds.add(questionId);
        }
        if (replyId) {
          seenReplyIds.add(replyId);
        }
        if (traceId) {
          seenTraceIds.add(traceId);
        }
        if (chunk) {
          customChunks.push(chunk);
        }
        keyEvents.push({
          timestamp,
          source: 'send',
          code,
          summary: `event=${formatCodeWithName(500)} start=${start} end=${end} chunk_len=${chunk.length}`,
        });
      }
    }
  }

  const defaultReplies = [...defaultReplyById.entries()]
    .map(([replyId, value]) => ({
      replyId,
      questionId: value.questionId,
      text: value.text.trim(),
    }))
    .filter((item) => item.text.length > 0);

  const customReplyText = customChunks.join('').trim();
  const firstSend500End = send500Records.find((record) => record.end);
  const last3010 = received3010Times.length > 0 ? received3010Times[received3010Times.length - 1] : null;
  const firstEndSignal = received3011Times[0] ?? received359Times[0] ?? null;

  const checks = [];
  if (firstSend500End && last3010 && firstSend500End.timestamp < last3010) {
    checks.push({
      status: 'warn',
      key: 'custom_end_before_last_audio_heartbeat',
      detail: `send500(end=true)=${firstSend500End.timestamp} earlier than last 3010=${last3010}`,
    });
  }
  if (firstSend500End && !firstEndSignal) {
    checks.push({
      status: 'warn',
      key: 'missing_tts_end_signal_after_custom_end',
      detail: 'found send500(end=true) but no 3011/359 in this file',
    });
  }
  if (!firstSend500End && customReplyText) {
    checks.push({
      status: 'warn',
      key: 'custom_reply_without_end_marker',
      detail: 'found custom tts chunks but no send500(end=true)',
    });
  }
  if (checks.length === 0) {
    checks.push({
      status: 'ok',
      key: 'no_obvious_lifecycle_anomaly_by_log_rules',
      detail: 'basic lifecycle checks passed for this file',
    });
  }

  keyEvents.sort((left, right) => left.timestamp.localeCompare(right.timestamp));

  return {
    stats,
    receivedCounts,
    asrFinals,
    defaultReplies,
    customReplyText,
    send500Records,
    seenQuestionIds: [...seenQuestionIds].sort((left, right) => left.localeCompare(right)),
    seenReplyIds: [...seenReplyIds].sort((left, right) => left.localeCompare(right)),
    seenTraceIds: [...seenTraceIds].sort((left, right) => left.localeCompare(right)),
    keyEvents,
    checks,
  };
}

function mapEntriesSortedByKey(map) {
  return [...map.entries()].sort((left, right) => left[0] - right[0]);
}

function toMarkdown({
  selectedLogPath,
  syncResult,
  analysis,
}) {
  const relativeLog = path.relative(ROOT, selectedLogPath);
  const lines = [];
  lines.push('# Voice Log Diagnose Report');
  lines.push('');
  lines.push(`- Log file: \`${relativeLog}\``);
  lines.push(`- First timestamp: \`${analysis.stats.firstTimestamp ?? 'unknown'}\``);
  lines.push(`- Last timestamp: \`${analysis.stats.lastTimestamp ?? 'unknown'}\``);
  lines.push(`- Line count: \`${analysis.stats.lineCount}\``);
  if (syncResult.skipped) {
    lines.push(`- Device sync: skipped (\`${syncResult.reason}\`)`);
  } else {
    lines.push(`- Device sync: ok, new files=\`${syncResult.synced.length}\``);
  }
  lines.push('');

  lines.push('## Trace Keys');
  lines.push(`- traceIds: ${analysis.seenTraceIds.length > 0 ? analysis.seenTraceIds.join(', ') : '(none)'}`);
  lines.push(
    `- questionIds: ${analysis.seenQuestionIds.length > 0 ? analysis.seenQuestionIds.join(', ') : '(none)'}`,
  );
  lines.push(`- replyIds: ${analysis.seenReplyIds.length > 0 ? analysis.seenReplyIds.join(', ') : '(none)'}`);
  lines.push('');

  lines.push('## ASR Final (User)');
  if (analysis.asrFinals.length === 0) {
    lines.push('- (none)');
  } else {
    for (const item of analysis.asrFinals) {
      lines.push(`- [${item.timestamp}] question_id=${item.questionId ?? 'unknown'} text=${item.text}`);
    }
  }
  lines.push('');

  lines.push('## Assistant Text (Default Stream)');
  if (analysis.defaultReplies.length === 0) {
    lines.push('- (none)');
  } else {
    for (const item of analysis.defaultReplies) {
      lines.push(`- question_id=${item.questionId ?? 'unknown'} reply_id=${item.replyId}: ${item.text}`);
    }
  }
  lines.push('');

  lines.push('## Assistant Text (Custom ChatTTSText)');
  lines.push(analysis.customReplyText ? `- ${analysis.customReplyText}` : '- (none)');
  lines.push('');

  lines.push('## Lifecycle Checks');
  for (const check of analysis.checks) {
    lines.push(`- [${check.status}] ${check.key}: ${check.detail}`);
  }
  lines.push('');

  lines.push('## Key Event Timeline');
  const focused = analysis.keyEvents.slice(0, 240);
  if (focused.length === 0) {
    lines.push('- (none)');
  } else {
    for (const event of focused) {
      lines.push(`- [${event.timestamp}] ${event.source}:${event.code} ${event.summary}`);
    }
    if (analysis.keyEvents.length > focused.length) {
      lines.push(`- ... truncated ${analysis.keyEvents.length - focused.length} events`);
    }
  }
  lines.push('');

  lines.push('## Received Message Type Counts');
  for (const [code, count] of mapEntriesSortedByKey(analysis.receivedCounts)) {
    lines.push(`- ${formatCodeWithName(code)}: ${count}`);
  }
  lines.push('');

  return lines.join('\n');
}

function selectLogFile(preferredFile) {
  if (preferredFile) {
    const absolutePath = path.isAbsolute(preferredFile)
      ? preferredFile
      : path.join(ROOT, preferredFile);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`--file not found: ${absolutePath}`);
    }
    return absolutePath;
  }
  const archiveFiles = listArchivedLogs();
  if (archiveFiles.length === 0) {
    throw new Error('no archived speech_sdk logs found; connect device once or pass --file');
  }
  return archiveFiles[0];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  ensureDir(ARCHIVE_DIR);
  ensureDir(REPORT_DIR);

  const syncResult = args.sync
    ? syncFromDevice()
    : { synced: [], skipped: true, reason: 'disabled_by_flag' };

  const selectedLogPath = selectLogFile(args.file);
  const analysis = analyzeLog(selectedLogPath);
  const markdown = toMarkdown({
    selectedLogPath,
    syncResult,
    analysis,
  });

  const now = new Date();
  const reportFileName = `voice-log-report-${now.toISOString().replaceAll(':', '-').replaceAll('.', '_')}.md`;
  const reportPath = path.join(REPORT_DIR, reportFileName);
  fs.writeFileSync(reportPath, markdown, 'utf8');
  pruneByName(ARCHIVE_DIR, LOG_GLOB, '.log', MAX_ARCHIVE_FILES);
  pruneByName(REPORT_DIR, 'voice-log-report-', '.md', MAX_REPORT_FILES);

  console.log(`report: ${reportPath}`);
  console.log(`log: ${selectedLogPath}`);
  if (!syncResult.skipped && syncResult.synced.length > 0) {
    console.log(`synced: ${syncResult.synced.length}`);
  } else if (syncResult.skipped) {
    console.log(`sync: skipped (${syncResult.reason})`);
  } else {
    console.log('synced: 0 (already archived)');
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`voice-log-diagnose failed: ${message}`);
  process.exit(1);
}
