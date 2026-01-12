export function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

export function makeScale(
  domain: [number, number],
  range: [number, number]
): (x: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  return (x: number) => r0 + ((x - d0) / (d1 - d0)) * (r1 - r0);
}
