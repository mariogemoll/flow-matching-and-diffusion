import { frameIndexToTime } from './src/conditional-trajectory-logic';

const LOG_SCALE_POWER = 2;
const NUM_FRAMES = 100;

console.log('Non-uniform time steps (logarithmic scale):');
console.log('First 10 steps:');
for (let i = 0; i <= 10; i++) {
  const t = frameIndexToTime(i, NUM_FRAMES, LOG_SCALE_POWER);
  const dt = i > 0 ? t - frameIndexToTime(i - 1, NUM_FRAMES, LOG_SCALE_POWER) : 0;
  console.log(`Frame ${i}: t=${t.toFixed(4)}, dt=${dt.toFixed(4)}`);
}

console.log('\nLast 10 steps:');
for (let i = NUM_FRAMES - 10; i <= NUM_FRAMES; i++) {
  const t = frameIndexToTime(i, NUM_FRAMES, LOG_SCALE_POWER);
  const dt = i > 0 ? t - frameIndexToTime(i - 1, NUM_FRAMES, LOG_SCALE_POWER) : 0;
  console.log(`Frame ${i}: t=${t.toFixed(4)}, dt=${dt.toFixed(6)}`);
}

// Calculate max and min dt
let maxDt = 0;
let minDt = Infinity;
for (let i = 1; i <= NUM_FRAMES; i++) {
  const t = frameIndexToTime(i, NUM_FRAMES, LOG_SCALE_POWER);
  const tPrev = frameIndexToTime(i - 1, NUM_FRAMES, LOG_SCALE_POWER);
  const dt = t - tPrev;
  maxDt = Math.max(maxDt, dt);
  minDt = Math.min(minDt, dt);
}

console.log(`\nMax dt: ${maxDt.toFixed(6)}`);
console.log(`Min dt: ${minDt.toFixed(6)}`);
console.log(`Ratio (max/min): ${(maxDt / minDt).toFixed(2)}`);
