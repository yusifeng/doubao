import { PCM_BITS_PER_SAMPLE, PCM_CHANNELS, PCM_SAMPLE_RATE } from './expoRealtime.constants';

export function bytesToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    output += chars[(triple >> 18) & 63];
    output += chars[(triple >> 12) & 63];
    output += i + 1 < bytes.length ? chars[(triple >> 6) & 63] : '=';
    output += i + 2 < bytes.length ? chars[triple & 63] : '=';
  }
  return output;
}

export function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (!clean) {
    return new Uint8Array(0);
  }
  const values: number[] = [];
  for (let index = 0; index < clean.length; index += 4) {
    const c0 = clean[index];
    const c1 = clean[index + 1];
    const c2 = clean[index + 2] ?? '=';
    const c3 = clean[index + 3] ?? '=';
    const n0 = chars.indexOf(c0);
    const n1 = chars.indexOf(c1);
    const n2 = c2 === '=' ? 0 : chars.indexOf(c2);
    const n3 = c3 === '=' ? 0 : chars.indexOf(c3);
    if (n0 < 0 || n1 < 0 || n2 < 0 || n3 < 0) {
      continue;
    }
    const triple = (n0 << 18) | (n1 << 12) | (n2 << 6) | n3;
    values.push((triple >> 16) & 0xff);
    if (c2 !== '=') {
      values.push((triple >> 8) & 0xff);
    }
    if (c3 !== '=') {
      values.push(triple & 0xff);
    }
  }
  return Uint8Array.from(values);
}

export function pcmToWav(pcm: Uint8Array): Uint8Array {
  const blockAlign = (PCM_CHANNELS * PCM_BITS_PER_SAMPLE) / 8;
  const byteRate = PCM_SAMPLE_RATE * blockAlign;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, PCM_CHANNELS, true);
  view.setUint32(24, PCM_SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, PCM_BITS_PER_SAMPLE, true);
  write(36, 'data');
  view.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcm, 44);
  return wav;
}

export function concatUint8(left: Uint8Array, right: Uint8Array): Uint8Array {
  const merged = new Uint8Array(left.length + right.length);
  if (left.length > 0) {
    merged.set(left, 0);
  }
  if (right.length > 0) {
    merged.set(right, left.length);
  }
  return merged;
}
