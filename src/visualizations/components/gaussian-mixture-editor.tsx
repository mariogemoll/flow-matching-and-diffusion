
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { axisToCovariance, covarianceToAxes } from '../../math/linalg';
import type { GaussianComponent, Point2D } from '../../types';
import { makeScale } from '../../util/misc';
import {
  X_DOMAIN,
  Y_DOMAIN
} from '../constants';
import { useEngine } from '../engine';

// Constants
const AXIS_VISUAL_SCALE = 0.6;
const SLIDER_TOP = 30;
const MIN_WEIGHT = 0.05;

type HandleType = 'center' | 'major-pos' | 'major-neg' | 'minor-pos' | 'minor-neg' | 'weight';

// Internal interface for the editor to maintain handle stability
interface LocalGaussianComponent {
  mean: Point2D;
  weight: number;
  majorAxis: Point2D;
  minorAxis: Point2D;
}

interface DragState {
  componentIndex: number;
  handleType: HandleType;
  startMouse: Point2D; // Pixel coordinates
  startMean: Point2D; // Data coordinates
  startWeight?: number;
}

interface GaussianMixtureEditorProps {
  width: number;
  height: number;
  components: GaussianComponent[];
  onChange: (components: GaussianComponent[]) => void;
  hidden?: boolean;
  style?: React.CSSProperties;
}

// Helpers
const HandleLine = React.forwardRef<
  SVGLineElement,
  React.SVGProps<SVGLineElement>
>((props, ref) => <line ref={ref} {...props} />);

const HandlePoint = React.forwardRef<
  SVGCircleElement,
  React.SVGProps<SVGCircleElement>
>((props, ref) => <circle ref={ref} {...props} />);

// Helper to convert weight to slider Y position
function weightToSliderY(weight: number, sliderBottom: number): number {
  const clamped = Math.max(MIN_WEIGHT, Math.min(1, weight));
  return sliderBottom - (clamped - MIN_WEIGHT) / (1 - MIN_WEIGHT) * (sliderBottom - SLIDER_TOP);
}

// Helper to convert slider Y position to weight
function sliderYToWeight(y: number, sliderBottom: number): number {
  const clampedY = Math.max(SLIDER_TOP, Math.min(sliderBottom, y));
  return MIN_WEIGHT + (sliderBottom - clampedY) /
    (sliderBottom - SLIDER_TOP) * (1 - MIN_WEIGHT);
}

function updateComponentWeight(
  components: LocalGaussianComponent[],
  index: number,
  targetWeight: number
): LocalGaussianComponent[] {
  const newComponents = components.map(c => ({ ...c }));
  const clampedTarget = Math.max(MIN_WEIGHT, Math.min(1, targetWeight));

  newComponents[index].weight = clampedTarget;

  const otherTotal = newComponents.reduce((sum, c, idx) =>
    idx === index ? sum : sum + c.weight, 0
  );

  if (newComponents.length > 1) {
    const scale = otherTotal > 0 ? (1 - clampedTarget) / otherTotal : 0;
    newComponents.forEach((c, idx) => {
      if (idx !== index) {
        c.weight = Math.max(0, c.weight * scale);
      }
    });
  }

  const total = newComponents.reduce((sum, c) => sum + c.weight, 0);
  if (total > 0) {
    newComponents.forEach(c => c.weight /= total);
  }

  return newComponents;
}

function areCovariancesEqual(
  a: [[number, number], [number, number]],
  b: [[number, number], [number, number]]
): boolean {
  const EPS = 1e-6;
  return Math.abs(a[0][0] - b[0][0]) < EPS &&
    Math.abs(a[0][1] - b[0][1]) < EPS &&
    Math.abs(a[1][0] - b[1][0]) < EPS &&
    Math.abs(a[1][1] - b[1][1]) < EPS;
}

export const GaussianMixtureEditor = React.memo(function GaussianMixtureEditor({
  width,
  height,
  components,
  onChange,
  hidden,
  style
}: GaussianMixtureEditorProps) {
  const [localComponents, setLocalComponents] = useState<LocalGaussianComponent[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredComponentIndex, setHoveredComponentIndex] = useState<number | null>(null);
  const [selectedComponentIndex, setSelectedComponentIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const engine = useEngine();

  // Refs for high-speed DOM updates
  const handleRefs = useRef<{
    center: (SVGCircleElement | null)[];
    majorPos: (SVGCircleElement | null)[];
    majorNeg: (SVGCircleElement | null)[];
    minorPos: (SVGCircleElement | null)[];
    minorNeg: (SVGCircleElement | null)[];
    majorLine: (SVGLineElement | null)[];
    minorLine: (SVGLineElement | null)[];
    weightHandle: (SVGCircleElement | null)[];
      }>({
        center: [],
        majorPos: [],
        majorNeg: [],
        minorPos: [],
        minorNeg: [],
        majorLine: [],
        minorLine: [],
        weightHandle: []
      });

  const localComponentsRef = useRef<LocalGaussianComponent[]>([]);
  const lastPushedRef = useRef<GaussianComponent[] | null>(null);
  const pendingUpdateRef = useRef<boolean>(false);

  const sliderBottom = height - 50;
  const xScale = useMemo(() => makeScale(X_DOMAIN, [0, width]), [width]);
  const yScale = useMemo(() => makeScale(Y_DOMAIN, [height, 0]), [height]);

  // Clear selection if it becomes invalid
  useEffect(() => {
    if (selectedComponentIndex !== null && selectedComponentIndex >= localComponents.length) {
      setSelectedComponentIndex(null);
    }
  }, [localComponents.length, selectedComponentIndex]);

  // Sync props to local state
  useEffect(() => {
    if (localComponents.length !== components.length) {
      const initial = components.map(c => ({
        mean: c.mean,
        weight: c.weight,
        ...covarianceToAxes(c.covariance)
      }));
      setLocalComponents(initial);
      localComponentsRef.current = initial;
      return;
    }

    if (lastPushedRef.current === components) { return; }

    const needsUpdate = components.some((c, i) => {
      const local = localComponents[i] as LocalGaussianComponent | undefined;
      if (!local) { return true; }
      const meanDiff = Math.abs(c.mean[0] - local.mean[0]) + Math.abs(c.mean[1] - local.mean[1]);
      if (meanDiff > 1e-6) { return true; }
      if (Math.abs(c.weight - local.weight) > 1e-6) { return true; }
      const localCov = axisToCovariance(local.majorAxis, local.minorAxis);
      return !areCovariancesEqual(c.covariance, localCov);
    });

    if (needsUpdate) {
      const updated = components.map(c => ({
        mean: c.mean,
        weight: c.weight,
        ...covarianceToAxes(c.covariance)
      }));
      setLocalComponents(updated);
      localComponentsRef.current = updated;
    }
  }, [components]);

  // High-frequency DOM update loop
  useEffect(() => {
    const updateDOM = (): void => {
      const components = localComponentsRef.current;
      const refs = handleRefs.current;

      components.forEach((comp, idx) => {
        const cx = xScale(comp.mean[0]);
        const cy = yScale(comp.mean[1]);

        const center = refs.center[idx];
        if (center) {
          center.setAttribute('cx', String(cx));
          center.setAttribute('cy', String(cy));
        }

        const majX = xScale(comp.mean[0] + comp.majorAxis[0] * AXIS_VISUAL_SCALE);
        const majY = yScale(comp.mean[1] + comp.majorAxis[1] * AXIS_VISUAL_SCALE);
        const majNegX = xScale(comp.mean[0] - comp.majorAxis[0] * AXIS_VISUAL_SCALE);
        const majNegY = yScale(comp.mean[1] - comp.majorAxis[1] * AXIS_VISUAL_SCALE);

        const mPX = refs.majorPos[idx];
        if (mPX) {
          mPX.setAttribute('cx', String(majX));
          mPX.setAttribute('cy', String(majY));
        }
        const mNX = refs.majorNeg[idx];
        if (mNX) {
          mNX.setAttribute('cx', String(majNegX));
          mNX.setAttribute('cy', String(majNegY));
        }
        const mL = refs.majorLine[idx];
        if (mL) {
          mL.setAttribute('x1', String(majNegX));
          mL.setAttribute('y1', String(majNegY));
          mL.setAttribute('x2', String(majX));
          mL.setAttribute('y2', String(majY));
        }

        const minX = xScale(comp.mean[0] + comp.minorAxis[0] * AXIS_VISUAL_SCALE);
        const minY = yScale(comp.mean[1] + comp.minorAxis[1] * AXIS_VISUAL_SCALE);
        const minNegX = xScale(comp.mean[0] - comp.minorAxis[0] * AXIS_VISUAL_SCALE);
        const minNegY = yScale(comp.mean[1] - comp.minorAxis[1] * AXIS_VISUAL_SCALE);

        const miPX = refs.minorPos[idx];
        if (miPX) {
          miPX.setAttribute('cx', String(minX));
          miPX.setAttribute('cy', String(minY));
        }
        const miNX = refs.minorNeg[idx];
        if (miNX) {
          miNX.setAttribute('cx', String(minNegX));
          miNX.setAttribute('cy', String(minNegY));
        }
        const miL = refs.minorLine[idx];
        if (miL) {
          miL.setAttribute('x1', String(minNegX));
          miL.setAttribute('y1', String(minNegY));
          miL.setAttribute('x2', String(minX));
          miL.setAttribute('y2', String(minY));
        }

        const wH = refs.weightHandle[idx];
        if (wH) {
          wH.setAttribute('cy', String(weightToSliderY(comp.weight, sliderBottom)));
        }
      });
    };

    return engine.register(updateDOM);
  }, [width, height, localComponents.length, engine, xScale, yScale, sliderBottom]);

  const getEventPoint = (e: React.MouseEvent | MouseEvent): Point2D => {
    if (!svgRef.current) { return [0, 0]; }
    const rect = svgRef.current.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const onMouseDown = (
    e: React.MouseEvent,
    componentIndex: number,
    handleType: HandleType
  ): void => {
    e.stopPropagation();
    e.preventDefault();
    const startMouse = getEventPoint(e);
    const component = localComponentsRef.current[componentIndex] as
      LocalGaussianComponent | undefined;
    if (!component) { return; }

    setSelectedComponentIndex(componentIndex);
    setDragState({
      componentIndex,
      handleType,
      startMouse,
      startMean: [...component.mean],
      startWeight: component.weight
    });
  };

  const throttledUpdate = (newLocals: LocalGaussianComponent[]): void => {
    if (pendingUpdateRef.current) { return; }
    pendingUpdateRef.current = true;
    requestAnimationFrame(() => {
      pendingUpdateRef.current = false;
      const newProps = newLocals.map(c => ({
        mean: c.mean,
        weight: c.weight,
        covariance: axisToCovariance(c.majorAxis, c.minorAxis)
      }));
      lastPushedRef.current = newProps;
      onChange(newProps);
    });
  };

  const createNewComponent = (): void => {
    // Create a random new component
    const mean: Point2D = [
      X_DOMAIN[0] + Math.random() * (X_DOMAIN[1] - X_DOMAIN[0]),
      Y_DOMAIN[0] + Math.random() * (Y_DOMAIN[1] - Y_DOMAIN[0])
    ];
    const angle = Math.random() * Math.PI;
    const majorLen = 0.3 + Math.random() * 0.5;
    const minorLen = 0.2 + Math.random() * 0.3;
    const majorAxis: Point2D = [
      Math.cos(angle) * majorLen,
      Math.sin(angle) * majorLen
    ];
    const minorAxis: Point2D = [
      -Math.sin(angle) * minorLen,
      Math.cos(angle) * minorLen
    ];

    const newLocal: LocalGaussianComponent = { mean, weight: 0.5, majorAxis, minorAxis };
    const newLocals = [...localComponentsRef.current, newLocal];
    // Normalize weights
    const total = newLocals.reduce((sum, c) => sum + c.weight, 0);
    newLocals.forEach(c => c.weight /= total);

    localComponentsRef.current = newLocals;
    setLocalComponents(newLocals);
    setSelectedComponentIndex(newLocals.length - 1);
    throttledUpdate(newLocals);
  };

  const deleteSelectedComponent = (): void => {
    if (selectedComponentIndex === null) { return; }
    if (localComponentsRef.current.length <= 1) { return; } // Keep at least one component

    const newLocals = localComponentsRef.current.filter((_, idx) => idx !== selectedComponentIndex);
    // Normalize weights
    const total = newLocals.reduce((sum, c) => sum + c.weight, 0);
    if (total > 0) { newLocals.forEach(c => c.weight /= total); }

    localComponentsRef.current = newLocals;
    setLocalComponents(newLocals);
    setSelectedComponentIndex(null);
    throttledUpdate(newLocals);
  };

  useEffect(() => {
    if (!dragState) { return; }
    const onMouseMove = (e: MouseEvent): void => {
      if (!svgRef.current) { return; }
      const currentMouse = getEventPoint(e);

      let newLocals = [...localComponentsRef.current];
      const comp = { ...newLocals[dragState.componentIndex] };

      if (dragState.handleType === 'weight') {
        const newWeight = sliderYToWeight(currentMouse[1], sliderBottom);
        newLocals = updateComponentWeight(newLocals, dragState.componentIndex, newWeight);
      } else {
        const dxPixels = currentMouse[0] - dragState.startMouse[0];
        const dyPixels = currentMouse[1] - dragState.startMouse[1];
        const startMeanPixel = [xScale(dragState.startMean[0]), yScale(dragState.startMean[1])];
        const currentMeanPixel = [startMeanPixel[0] + dxPixels, startMeanPixel[1] + dyPixels];

        // Clamp mean to domain
        const clampedMeanPixelX = Math.max(0, Math.min(width, currentMeanPixel[0]));
        const clampedMeanPixelY = Math.max(0, Math.min(height, currentMeanPixel[1]));

        if (dragState.handleType === 'center') {
          const newMeanData: Point2D = [
            xScale.inverse(clampedMeanPixelX),
            yScale.inverse(clampedMeanPixelY)
          ];
          comp.mean = newMeanData;
        } else {
          // For axis handles, we use the raw mouse position, not the mean delta
          const mouseData: Point2D = [
            xScale.inverse(currentMouse[0]),
            yScale.inverse(currentMouse[1])
          ];
          const mean = comp.mean;
          let vx = mouseData[0] - mean[0];
          let vy = mouseData[1] - mean[1];
          if (dragState.handleType.endsWith('-neg')) { vx = -vx; vy = -vy; }
          const newAxisVec: Point2D = [vx / AXIS_VISUAL_SCALE, vy / AXIS_VISUAL_SCALE];
          const len = Math.hypot(newAxisVec[0], newAxisVec[1]);
          if (len > 0.01) {
            if (dragState.handleType.includes('major')) {
              const oldMinorLen = Math.hypot(comp.minorAxis[0], comp.minorAxis[1]);
              comp.majorAxis = newAxisVec;
              const ux = newAxisVec[0] / len; const uy = newAxisVec[1] / len;
              comp.minorAxis = [-uy * oldMinorLen, ux * oldMinorLen];
            } else {
              const oldMajorLen = Math.hypot(comp.majorAxis[0], comp.majorAxis[1]);
              comp.minorAxis = newAxisVec;
              const ux = newAxisVec[0] / len; const uy = newAxisVec[1] / len;
              comp.majorAxis = [uy * oldMajorLen, -ux * oldMajorLen];
            }
          }
        }
        newLocals[dragState.componentIndex] = comp;
      }
      localComponentsRef.current = newLocals;
      throttledUpdate(newLocals);
    };

    const onMouseUp = (): void => { setDragState(null); };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return (): void => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragState, xScale, yScale, sliderBottom]);

  const BUTTON_SIZE = 24;
  const BUTTON_MARGIN = 8;
  const addButtonX = width - BUTTON_SIZE - BUTTON_MARGIN;
  const deleteButtonX = addButtonX - BUTTON_SIZE - BUTTON_MARGIN;
  const buttonY = height - BUTTON_SIZE - BUTTON_MARGIN;

  const onBackgroundClick = (e: React.MouseEvent): void => {
    // Only clear selection if clicking directly on SVG background (not on a component)
    if (e.target === svgRef.current) {
      setSelectedComponentIndex(null);
    }
  };

  return (
    <svg
      ref={svgRef}
      className="gmm-editor"
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'visible',
        pointerEvents: 'auto',
        zIndex: 10,
        display: (hidden ?? false) ? 'none' : 'block',
        ...style
      }}
      onClick={onBackgroundClick}
    >
      <g style={{ pointerEvents: 'auto' }}>
        {localComponents.map((comp, idx) => {
          const sliderX = width - 20 - idx * 15;
          const isSelected = selectedComponentIndex === idx;
          const isHovered = hoveredComponentIndex === idx && !isSelected;
          const stateClass = isSelected ? 'is-selected' : (isHovered ? 'is-hovered' : '');

          return (
            <g key={`slider-${String(idx)}`}
              className={`gmm-weight-group ${stateClass}`}
              onMouseEnter={() => { setHoveredComponentIndex(idx); }}
              onMouseLeave={() => { setHoveredComponentIndex(null); }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <HandleLine
                x1={sliderX} y1={SLIDER_TOP}
                x2={sliderX} y2={sliderBottom}
              />
              <HandlePoint
                ref={el => { handleRefs.current.weightHandle[idx] = el; }}
                cx={sliderX} cy={weightToSliderY(comp.weight, sliderBottom)} r={6}
                onMouseDown={(e) => { onMouseDown(e, idx, 'weight'); }}
              />
            </g>
          );
        })}

        {localComponents.map((comp, idx) => {
          const isDragging = dragState?.componentIndex === idx;
          const isSelected = selectedComponentIndex === idx;
          const isHovered = (hoveredComponentIndex === idx && !isSelected) || isDragging;
          const stateClass = isSelected ? 'is-selected' : (isHovered ? 'is-hovered' : '');

          return (
            <g key={`comp-${String(idx)}`}
              className={`gmm-component ${stateClass}`}
              onMouseEnter={() => { setHoveredComponentIndex(idx); }}
              onMouseLeave={() => { setHoveredComponentIndex(null); }}
              onClick={(e) => { e.stopPropagation(); }}
            >
              <HandleLine
                ref={el => { handleRefs.current.majorLine[idx] = el; }}
              />
              <HandleLine
                ref={el => { handleRefs.current.minorLine[idx] = el; }}
              />
              <HandlePoint
                ref={el => { handleRefs.current.center[idx] = el; }} r={6}
                className="gmm-handle-center"
                onMouseDown={(e) => { onMouseDown(e, idx, 'center'); }}
              />
              <HandlePoint
                ref={el => { handleRefs.current.majorPos[idx] = el; }} r={4}
                className="gmm-handle-point"
                onMouseDown={(e) => { onMouseDown(e, idx, 'major-pos'); }}
              />
              <HandlePoint
                ref={el => { handleRefs.current.majorNeg[idx] = el; }} r={4}
                className="gmm-handle-point"
                onMouseDown={(e) => { onMouseDown(e, idx, 'major-neg'); }}
              />
              <HandlePoint
                ref={el => { handleRefs.current.minorPos[idx] = el; }} r={4}
                className="gmm-handle-point"
                onMouseDown={(e) => { onMouseDown(e, idx, 'minor-pos'); }}
              />
              <HandlePoint
                ref={el => { handleRefs.current.minorNeg[idx] = el; }} r={4}
                className="gmm-handle-point"
                onMouseDown={(e) => { onMouseDown(e, idx, 'minor-neg'); }}
              />
            </g>
          );
        })}

        {/* Delete button (only shown when something is selected) */}
        {selectedComponentIndex !== null && localComponents.length > 1 && (
          <g
            className="gmm-button gmm-button-delete"
            style={{ cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); deleteSelectedComponent(); }}
          >
            <rect
              x={deleteButtonX} y={buttonY} width={BUTTON_SIZE} height={BUTTON_SIZE} rx={4}
            />
            <line
              x1={deleteButtonX + 6} y1={buttonY + 6}
              x2={deleteButtonX + BUTTON_SIZE - 6} y2={buttonY + BUTTON_SIZE - 6}
            />
            <line
              x1={deleteButtonX + BUTTON_SIZE - 6} y1={buttonY + 6}
              x2={deleteButtonX + 6} y2={buttonY + BUTTON_SIZE - 6}
            />
          </g>
        )}

        {/* Add button */}
        <g
          className="gmm-button gmm-button-add"
          style={{ cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); createNewComponent(); }}
        >
          <rect
            x={addButtonX} y={buttonY} width={BUTTON_SIZE} height={BUTTON_SIZE} rx={4}
          />
          <line
            x1={addButtonX + BUTTON_SIZE / 2} y1={buttonY + 6}
            x2={addButtonX + BUTTON_SIZE / 2} y2={buttonY + BUTTON_SIZE - 6}
          />
          <line
            x1={addButtonX + 6} y1={buttonY + BUTTON_SIZE / 2}
            x2={addButtonX + BUTTON_SIZE - 6} y2={buttonY + BUTTON_SIZE / 2}
          />
        </g>
      </g>
    </svg>
  );
});
