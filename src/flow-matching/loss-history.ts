// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

export type LossEntry = [number, number];

function decodeQuantizedLossHistory(buffer: ArrayBuffer): LossEntry[] {
  if (buffer.byteLength < 8) {
    throw new Error('Loss history file is too small to decode.');
  }

  const header = new DataView(buffer, 0, 8);
  const minLoss = header.getFloat32(0, true);
  const maxLoss = header.getFloat32(4, true);
  const quantizedLosses = new Uint8Array(buffer, 8);

  if (quantizedLosses.length === 0) {
    return [];
  }

  if (!Number.isFinite(minLoss) || !Number.isFinite(maxLoss)) {
    throw new Error('Loss history header is invalid.');
  }

  const lossRange = maxLoss - minLoss;
  return Array.from(quantizedLosses, (value, epoch) => {
    const loss = minLoss + (value / 255) * lossRange;
    return [epoch, loss];
  });
}

export async function loadLossHistory(url: string): Promise<LossEntry[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch loss history (${String(response.status)})`);
  }

  return decodeQuantizedLossHistory(await response.arrayBuffer());
}
