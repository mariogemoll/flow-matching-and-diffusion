import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type Point2D } from '../../../types';
import { clearWebGl } from '../../../webgl';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { type CondSdeRenderer, createCondSdeRenderer } from '../../webgl/conditional/sde';
import { type CondPathActions, type CondPathState } from '../index';

export function CondSdeView(): React.ReactElement {
  const engine = useEngine<CondPathState, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondSdeRenderer | null>(null);

  // Local UI state (controls visibility only)
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  // Read config from global state
  const {
    showTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma
  } = engine.frame.state.sdeConfig;

  // Use refs for mutable state accessed in render loop
  const paramsRef = useRef({
    resampleRequested: false,
    resampleNoiseRequested: false
  });

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createCondSdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const params = paramsRef.current;
      const { sdeConfig } = frame.state;

      renderer.setShowSdeTrajectories(sdeConfig.showTrajectories);
      renderer.setShowSamples(sdeConfig.showSamples);
      renderer.setSigmaSchedule(sdeConfig.sigmaSchedule);
      renderer.setSdeNumSteps(sdeConfig.sdeNumSteps);
      renderer.setMaxSigma(sdeConfig.maxSigma);

      if (params.resampleRequested) {
        renderer.resample();
        params.resampleRequested = false;
      }
      if (params.resampleNoiseRequested) {
        renderer.resampleNoise();
        params.resampleNoiseRequested = false;
      }

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    paramsRef.current.resampleRequested = true;
    engine.renderOnce();
  };

  const handleResampleNoise = (): void => {
    paramsRef.current.resampleNoiseRequested = true;
    engine.renderOnce();
  };

  return (
    <ViewContainer>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />

      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showTrajectories}
          onChange={(v) => { engine.actions.setSdeConfig({ showTrajectories: v }); }}
        />
        <ShowSamplesCheckbox
          checked={showSamples}
          onChange={(v) => { engine.actions.setSdeConfig({ showSamples: v }); }}
        />
        <ResampleSdeButton onClick={handleResample} />
        <SigmaScheduleSelection
          value={sigmaSchedule}
          onChange={(v) => { engine.actions.setSdeConfig({ sigmaSchedule: v }); }}
        />
        {showAdditionalControls ? (
          <>
            <NumStepsSlider
              value={sdeNumSteps}
              onChange={(v) => { engine.actions.setSdeConfig({ sdeNumSteps: v }); }}
            />
            <MaxSigmaSlider
              value={maxSigma}
              onChange={(v) => { engine.actions.setSdeConfig({ maxSigma: v }); }}
              schedule={sigmaSchedule}
            />
            <ResampleDiffusionNoiseButton onClick={handleResampleNoise} />
          </>
        ) : null}
        <EllipsisToggle
          expanded={showAdditionalControls}
          onToggle={() => { setShowAdditionalControls((current) => !current); }}
        />
      </ViewControls>
    </ViewContainer>
  );
}
