export type PcmEnergy = { peak: number; rms: number };

export function analyzePcm16Energy(frame: Uint8Array): PcmEnergy {
  if (frame.length < 2) {
    return { peak: 0, rms: 0 };
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  let peak = 0;
  let sumSquares = 0;
  let sampleCount = 0;

  for (let offset = 0; offset + 1 < frame.length; offset += 2) {
    const sample = view.getInt16(offset, true) / 32768;
    const amplitude = Math.abs(sample);
    if (amplitude > peak) {
      peak = amplitude;
    }
    sumSquares += sample * sample;
    sampleCount += 1;
  }

  if (sampleCount === 0) {
    return { peak: 0, rms: 0 };
  }

  return {
    peak,
    rms: Math.sqrt(sumSquares / sampleCount),
  };
}

export function concatAudioChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}
