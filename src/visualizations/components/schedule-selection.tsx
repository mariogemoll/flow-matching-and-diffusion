import React, { useEffect, useMemo, useRef } from 'react';

import {
  ALPHA_BETA_SCHEDULES,
  type AlphaBetaScheduleName,
  getAlpha,
  getBeta
} from '../../math/schedules/alpha-beta';
import { makeScale } from '../../util/misc';
import { SCHEDULE_DOT_COLOR, SCHEDULE_LINE_COLOR } from '../constants';
import { useEngine } from '../engine';
import { IconicDropdown, type IconicDropdownOption } from './iconic-dropdown';

const CHART_MARGIN = 2;
const CHART_SAMPLES = 40;

/* ------------------------------ Charts ------------------------------ */

interface ChartProps {
  width?: number;
  height?: number;
  backgroundColor?: string;
  animated?: boolean;
}

function GenericChart({
  functions,
  width = 16,
  height = 16,
  backgroundColor = 'transparent',
  animated = false
}: ChartProps & { functions: ((t: number) => number)[] }): React.ReactElement {
  const engine = animated ? useEngine() : null;
  const dotRefs = useRef<(SVGCircleElement | null)[]>(functions.map(() => null));

  const chartWidth = width - 2 * CHART_MARGIN;
  const chartHeight = height - 2 * CHART_MARGIN;

  const xScale = useMemo(() => makeScale([0, 1], [0, chartWidth]), [chartWidth]);
  const yScale = useMemo(() => makeScale([0, 1], [chartHeight, 0]), [chartHeight]);

  const paths = useMemo(() => {
    return functions.map((fn) => {
      let d = '';
      for (let i = 0; i <= CHART_SAMPLES; i++) {
        const t = i / CHART_SAMPLES;
        const x = xScale(t);
        const y = yScale(fn(t));
        const cmd = i === 0 ? 'M' : 'L';
        d += `${cmd}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      return d;
    });
  }, [functions, xScale, yScale]);

  useEffect(() => {
    if (!animated || !engine) { return; }

    let frameId: number;

    const update = (): void => {
      const t = Math.max(0, Math.min(1, engine.frame.clock.t));
      const x = xScale(t);

      dotRefs.current.forEach((ref, idx) => {
        if (ref) {
          const y = yScale(functions[idx](t));
          ref.setAttribute('cx', x.toFixed(1));
          ref.setAttribute('cy', y.toFixed(1));
        }
      });

      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return (): void => { cancelAnimationFrame(frameId); };
  }, [animated, functions, xScale, yScale, engine]);

  return (
    <svg
      width={width}
      height={height}
      style={{ display: 'block', backgroundColor, borderRadius: '2px' }}
    >
      <g transform={`translate(${String(CHART_MARGIN)},${String(CHART_MARGIN)})`}>
        {paths.map((path, idx) => (
          <path
            key={idx}
            d={path}
            fill="none"
            stroke={SCHEDULE_LINE_COLOR}
            strokeWidth="1.5"
          />
        ))}
        {animated && dotRefs.current.map((_, idx) => (
          <circle
            key={idx}
            ref={(el) => { dotRefs.current[idx] = el; }}
            r="2"
            fill={SCHEDULE_DOT_COLOR}
          />
        ))}
      </g>
    </svg>
  );
}

function AlphaBetaChart({
  schedule,
  ...props
}: ChartProps & { schedule: AlphaBetaScheduleName }): React.ReactElement {
  return (
    <GenericChart
      {...props}
      functions={[
        (t): number => getAlpha(t, schedule),
        (t): number => getBeta(t, schedule)
      ]}
    />
  );
}

/* ------------------------------ Selections ------------------------------ */

interface ScheduleSelectionProps<T> {
  value: T;
  onChange: (s: T) => void;
}

function ScheduleSelectionComponent<T extends string>({
  value,
  onChange,
  scheduleMap,
  ChartComponent
}: {
  value: T;
  onChange: (s: T) => void;
  scheduleMap: Record<T, { displayName: string }>;
  ChartComponent: React.ComponentType<{ schedule: T; animated?: boolean }>;
}): React.ReactElement {
  const options: IconicDropdownOption<T>[] = useMemo(
    () =>
      (Object.keys(scheduleMap) as T[]).map((key) => ({
        value: key,
        label: scheduleMap[key].displayName,
        icon: <ChartComponent schedule={key} />
      })),
    [scheduleMap, ChartComponent]
  );

  return (
    <IconicDropdown
      value={value}
      onChange={onChange}
      options={options}
      width={200}
      triggerIcon={<ChartComponent schedule={value} animated />}
    />
  );
}

export function AlphaBetaScheduleSelection({
  value,
  onChange
}: ScheduleSelectionProps<AlphaBetaScheduleName>): React.ReactElement {
  return (
    <ScheduleSelectionComponent
      value={value}
      onChange={onChange}
      scheduleMap={ALPHA_BETA_SCHEDULES}
      ChartComponent={AlphaBetaChart}
    />
  );
}
