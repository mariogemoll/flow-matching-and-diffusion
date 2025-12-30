import type { Point2D } from '../types';

export function calculateTrajectory(
  vectorFieldFn: (x: number, y: number, t: number) => [number, number],
  bounds: { width: number; height: number },
  steps: number,
  startPos: Point2D,
  startTime: number
): Point2D[] {
  const trajectory: Point2D[] = [];
  let x = startPos[0];
  let y = startPos[1];
  trajectory.push([x, y]);

  const totalDuration = 1.0 - startTime;
  const safeSteps = Math.max(2, Math.floor(steps));
  const dt = totalDuration / safeSteps;

  for (let step = 0; step < safeSteps; step++) {
    const t = startTime + (step * dt);
    const [vx, vy] = vectorFieldFn(x, y, t);
    x += vx * dt;
    y += vy * dt;

    if (x < 0 || x > bounds.width || y < 0 || y > bounds.height) {
      break;
    }

    trajectory.push([x, y]);
  }

  return trajectory;
}
