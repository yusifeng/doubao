import { gzip, inflate } from 'pako';

const PROTOCOL_VERSION = 0b0001;
const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;

const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR_RESPONSE = 0b1111;

const POS_SEQUENCE = 0b0001;
const NEG_SEQUENCE = 0b0010;
const MSG_WITH_EVENT = 0b0100;

const JSON_SERIALIZATION = 0b0001;
const NO_SERIALIZATION = 0b0000;

const GZIP_COMPRESSION = 0b0001;
const NO_COMPRESSION = 0b0000;

type HeaderOptions = {
  messageType?: number;
  messageTypeSpecificFlags?: number;
  serialization?: number;
  compression?: number;
};

export type ParsedServerFrame = {
  text: string | null;
  audio: Uint8Array | null;
  error: string | null;
  event: number | null;
  sequence: number | null;
  sessionId: string | null;
  messageType: number;
};

function generateHeader(options: HeaderOptions = {}): Uint8Array {
  const messageType = options.messageType ?? CLIENT_FULL_REQUEST;
  const messageTypeSpecificFlags = options.messageTypeSpecificFlags ?? MSG_WITH_EVENT;
  const serialization = options.serialization ?? JSON_SERIALIZATION;
  const compression = options.compression ?? GZIP_COMPRESSION;
  return Uint8Array.from([
    (PROTOCOL_VERSION << 4) | 0b0001,
    (messageType << 4) | messageTypeSpecificFlags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

function u32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >> 24) & 0xff,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ]);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

function utf8Bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function parseJsonText(payload: Record<string, unknown>): string | null {
  const direct =
    typeof payload.content === 'string'
      ? payload.content
      : typeof payload.text === 'string'
        ? payload.text
        : null;
  if (direct) {
    return direct;
  }

  const nested = payload.result as Record<string, unknown> | undefined;
  if (nested && typeof nested.content === 'string') {
    return nested.content;
  }

  return null;
}

function readU32(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
  return view.getUint32(0, false);
}

function decodePayloadBody(body: Uint8Array, compression: number): Uint8Array | null {
  if (compression === NO_COMPRESSION) {
    return body;
  }
  if (compression === GZIP_COMPRESSION) {
    try {
      return inflate(body);
    } catch {
      return null;
    }
  }
  return null;
}

function parsePayloadMessage(body: Uint8Array, serialization: number): { text: string | null; audio: Uint8Array | null } {
  if (serialization === JSON_SERIALIZATION) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
      return { text: parseJsonText(parsed), audio: null };
    } catch {
      return { text: null, audio: null };
    }
  }

  if (serialization === NO_SERIALIZATION && body.length > 0) {
    return { text: null, audio: body };
  }

  return { text: null, audio: null };
}

export function buildStartConnectionFrame(): Uint8Array {
  const payload = gzip(utf8Bytes('{}'));
  return concatBytes([generateHeader(), u32(1), u32(payload.length), payload]);
}

export function buildStartSessionFrame(sessionId: string, request: object): Uint8Array {
  const sessionBytes = utf8Bytes(sessionId);
  const payload = gzip(utf8Bytes(JSON.stringify(request)));
  return concatBytes([
    generateHeader(),
    u32(100),
    u32(sessionBytes.length),
    sessionBytes,
    u32(payload.length),
    payload,
  ]);
}

export function buildFinishSessionFrame(sessionId: string): Uint8Array {
  const sessionBytes = utf8Bytes(sessionId);
  const payload = gzip(utf8Bytes('{}'));
  return concatBytes([
    generateHeader(),
    u32(102),
    u32(sessionBytes.length),
    sessionBytes,
    u32(payload.length),
    payload,
  ]);
}

export function buildFinishConnectionFrame(): Uint8Array {
  const payload = gzip(utf8Bytes('{}'));
  return concatBytes([generateHeader(), u32(2), u32(payload.length), payload]);
}

export function buildTextQueryFrame(sessionId: string, text: string): Uint8Array {
  const sessionBytes = utf8Bytes(sessionId);
  const payload = gzip(utf8Bytes(JSON.stringify({ content: text })));
  return concatBytes([
    generateHeader(),
    u32(501),
    u32(sessionBytes.length),
    sessionBytes,
    u32(payload.length),
    payload,
  ]);
}

export function buildAudioFrame(sessionId: string, frame: Uint8Array): Uint8Array {
  const sessionBytes = utf8Bytes(sessionId);
  const payload = gzip(frame);
  return concatBytes([
    generateHeader({
      messageType: CLIENT_AUDIO_ONLY_REQUEST,
      serialization: NO_SERIALIZATION,
      compression: GZIP_COMPRESSION,
    }),
    u32(200),
    u32(sessionBytes.length),
    sessionBytes,
    u32(payload.length),
    payload,
  ]);
}

export function parseServerFrame(input: ArrayBuffer): ParsedServerFrame {
  const empty: ParsedServerFrame = {
    text: null,
    audio: null,
    error: null,
    event: null,
    sequence: null,
    sessionId: null,
    messageType: -1,
  };

  try {
    const bytes = new Uint8Array(input);
    if (bytes.length < 4) {
      return { ...empty, error: 'server frame too short' };
    }

    const headerSize = bytes[0] & 0x0f;
    const headerBytes = headerSize * 4;
    if (headerSize < 1 || bytes.length < headerBytes) {
      return { ...empty, error: 'invalid server frame header' };
    }

    const messageType = bytes[1] >> 4;
    const messageTypeSpecificFlags = bytes[1] & 0x0f;
    const serialization = bytes[2] >> 4;
    const compression = bytes[2] & 0x0f;
    const payload = bytes.slice(headerBytes);

    const current: ParsedServerFrame = { ...empty, messageType };

    if (messageType === SERVER_ERROR_RESPONSE) {
      const code = readU32(payload, 0);
      const payloadSize = readU32(payload, 4);
      if (code === null || payloadSize === null || 8 + payloadSize > payload.length) {
        return { ...current, error: 'malformed server error frame' };
      }
      const rawBody = payload.slice(8, 8 + payloadSize);
      const body = decodePayloadBody(rawBody, compression);
      if (!body) {
        return { ...current, error: `server error ${code}: failed to decode payload` };
      }
      const parsed = parsePayloadMessage(body, serialization);
      const fallbackText = new TextDecoder().decode(body);
      return {
        ...current,
        error: `server error ${code}: ${parsed.text ?? fallbackText}`,
      };
    }

    if (messageType !== SERVER_FULL_RESPONSE && messageType !== SERVER_ACK) {
      return current;
    }

    let cursor = 0;

    if ((messageTypeSpecificFlags & POS_SEQUENCE) > 0 || (messageTypeSpecificFlags & NEG_SEQUENCE) > 0) {
      const sequence = readU32(payload, cursor);
      if (sequence === null) {
        return { ...current, error: 'malformed sequence field' };
      }
      current.sequence = sequence;
      cursor += 4;
    }

    if ((messageTypeSpecificFlags & MSG_WITH_EVENT) > 0) {
      const event = readU32(payload, cursor);
      if (event === null) {
        return { ...current, error: 'malformed event field' };
      }
      current.event = event;
      cursor += 4;
    }

    const sessionIdSize = readU32(payload, cursor);
    if (sessionIdSize === null) {
      return { ...current, error: 'missing session id size' };
    }
    cursor += 4;
    if (cursor + sessionIdSize > payload.length) {
      return { ...current, error: 'invalid session id size' };
    }

    current.sessionId = new TextDecoder().decode(payload.slice(cursor, cursor + sessionIdSize));
    cursor += sessionIdSize;

    const payloadSize = readU32(payload, cursor);
    if (payloadSize === null) {
      return { ...current, error: 'missing payload size' };
    }
    cursor += 4;
    if (cursor + payloadSize > payload.length) {
      return { ...current, error: 'payload truncated' };
    }

    const rawBody = payload.slice(cursor, cursor + payloadSize);
    const body = decodePayloadBody(rawBody, compression);
    if (!body) {
      return { ...current, error: 'failed to decode payload body' };
    }

    const parsed = parsePayloadMessage(body, serialization);
    return {
      ...current,
      text: parsed.text,
      audio: parsed.audio,
    };
  } catch {
    return { ...empty, error: 'failed to parse server frame' };
  }
}
