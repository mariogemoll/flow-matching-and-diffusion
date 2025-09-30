export function viridis(t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const colors = [
    [0.267004, 0.004874, 0.329415],
    [0.282623, 0.140926, 0.457517],
    [0.253935, 0.265254, 0.529983],
    [0.206756, 0.371758, 0.553117],
    [0.163625, 0.471133, 0.558148],
    [0.127568, 0.566949, 0.550556],
    [0.134692, 0.658636, 0.517649],
    [0.266941, 0.748751, 0.440573],
    [0.477504, 0.821444, 0.318195],
    [0.741388, 0.873449, 0.149561],
    [0.993248, 0.906157, 0.143936]
  ];

  const scaled = clamped * (colors.length - 1);
  const index = Math.floor(scaled);
  const frac = scaled - index;

  const c1 = colors[Math.min(index, colors.length - 1)];
  const c2 = colors[Math.min(index + 1, colors.length - 1)];

  const r = Math.round((c1[0] + (c2[0] - c1[0]) * frac) * 255);
  const g = Math.round((c1[1] + (c2[1] - c1[1]) * frac) * 255);
  const b = Math.round((c1[2] + (c2[2] - c1[2]) * frac) * 255);

  return `rgb(${r}, ${g}, ${b})`;
}
