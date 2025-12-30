// Viewport offset - can be adjusted via console
export const viewport = {
  offsetX: 0,
  offsetY: 50,
  zoom: 1.0
};

// Expose to window for console access
interface WindowWithViewport extends Window {
  vectorFieldViewport?: typeof viewport;
}

if (typeof window !== 'undefined') {
  (window as WindowWithViewport).vectorFieldViewport = viewport;
}

export function demoVectorField(
  x: number, y: number, t: number, canvasWidth: number, canvasHeight: number
): [number, number] {
  const phase = t * Math.PI * 2;
  // Use the original data space dimensions (200x150) regardless of canvas size
  const dataWidth = 200;
  const dataHeight = 150;
  // Scale input coordinates to match original data space, then apply viewport offset
  const scaledX = (x / canvasWidth) * dataWidth * viewport.zoom + viewport.offsetX;
  const scaledY = (y / canvasHeight) * dataHeight * viewport.zoom + viewport.offsetY;

  const baseFlowX = 1.0 + 0.3 * Math.sin(phase * 0.4);
  const baseFlowY = 0.2 * Math.sin(scaledY / 100 + phase * 0.3);

  const eddies = [
    { x: dataWidth * 0.25, y: dataHeight * 0.3, strength: 0.6, rotation: 1 },
    { x: dataWidth * 0.6, y: dataHeight * 0.7, strength: 0.5, rotation: -1 },
    { x: dataWidth * 0.8, y: dataHeight * 0.2, strength: 0.4, rotation: 1 }
  ];

  const whirlX = dataWidth * 0.45;
  const whirlY = dataHeight * 0.55;
  const whirlStrength = 1.4;

  let eddyX = 0;
  let eddyY = 0;

  for (const eddy of eddies) {
    const dx = scaledX - eddy.x;
    const dy = scaledY - eddy.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    if (r > 5) {
      const strength = eddy.strength * Math.exp(-r / 80) * (1 + 0.4 * Math.sin(phase + angle * 2));
      eddyX += -strength * Math.sin(angle) * eddy.rotation;
      eddyY += strength * Math.cos(angle) * eddy.rotation;
    }
  }

  const whirlDx = scaledX - whirlX;
  const whirlDy = scaledY - whirlY;
  const whirlR = Math.sqrt(whirlDx * whirlDx + whirlDy * whirlDy);
  const whirlAngle = Math.atan2(whirlDy, whirlDx);
  let whirlVx = 0;
  let whirlVy = 0;

  if (whirlR > 8) {
    const whirlForce = whirlStrength * Math.exp(-whirlR / 70) *
      (1 + 0.6 * Math.sin(phase * 1.1 + whirlAngle));
    whirlVx = -whirlForce * Math.sin(whirlAngle);
    whirlVy = whirlForce * Math.cos(whirlAngle);
  }

  const waveX = 0.8 * Math.sin(scaledY / 70 + phase * 0.6) * Math.cos(scaledX / 90);
  const waveY = 0.6 * Math.cos(scaledX / 80 + phase * 0.5) * Math.sin(scaledY / 110);

  let verticalY = 0;

  const current1X = dataWidth * 0.3;
  const dist1 = Math.abs(scaledX - current1X);
  if (dist1 < 120) {
    const strength1 = Math.exp(-dist1 / 60) * (1 + 0.5 * Math.sin(phase * 0.8));
    verticalY += 1.2 * strength1 * Math.sin(scaledY / 50 + phase);
  }

  const current2X = dataWidth * 0.7;
  const dist2 = Math.abs(scaledX - current2X);
  if (dist2 < 100) {
    const strength2 = Math.exp(-dist2 / 50) * (1 + 0.3 * Math.cos(phase * 1.2));
    verticalY += -0.9 * strength2 * Math.cos(scaledY / 60 + phase * 1.5);
  }

  // Scale the output velocities back to canvas space
  const canvasScaleX = canvasWidth / dataWidth;
  const canvasScaleY = canvasHeight / dataHeight;

  return [
    (baseFlowX + eddyX + whirlVx + waveX) * 90 * canvasScaleX,
    (baseFlowY + eddyY + whirlVy + waveY + verticalY) * 90 * canvasScaleY
  ];
}
