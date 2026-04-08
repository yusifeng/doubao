function getRandomByte(): number {
  const cryptoObj = globalThis.crypto as { getRandomValues?: (array: Uint8Array) => Uint8Array } | undefined;
  if (cryptoObj?.getRandomValues) {
    return cryptoObj.getRandomValues(new Uint8Array(1))[0] ?? 0;
  }
  return Math.floor(Math.random() * 256);
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, '0');
}

// UUIDv7-like sortable id. Keeps timestamp ordering and UUID textual shape.
export function generateUuidV7Like(): string {
  const timestamp = BigInt(Date.now());
  const bytes = new Uint8Array(16);

  for (let index = 0; index < 16; index += 1) {
    bytes[index] = getRandomByte();
  }

  // 48-bit unix timestamp in milliseconds.
  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Set version 7 and RFC variant.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, toHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
