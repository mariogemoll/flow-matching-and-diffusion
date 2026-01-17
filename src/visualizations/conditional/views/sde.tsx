import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type SigmaScheduleName } from '../../../math/schedules/sigma';
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
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE
} from '../../constants';
import { useEngine } from '../../engine';
import { type CondSdeRenderer, createCondSdeRenderer } from '../../webgl/conditional/sde';
import { type CondPathActions, type CondPathParams } from '../index';

export function CondSdeView(): React.ReactElement {
  const engine = useEngine<CondPathParams, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondSdeRenderer | null>(null);

  const [showSdeTrajectories, setShowSdeTrajectories] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [sigmaSchedule, setSigmaSchedule] = useState<SigmaScheduleName>(DEFAULT_SIGMA_SCHEDULE);
  const [sdeNumSteps, setSdeNumSteps] = useState(DEFAULT_NUM_SDE_STEPS);
  const [maxSigma, setMaxSigma] = useState(DEFAULT_MAX_SIGMA);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  const paramsRef = useRef({
    showSdeTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    resampleRequested: false,
    resampleNoiseRequested: false
  });

  // Sync local params ref
  useEffect(() => {
    paramsRef.current.showSdeTrajectories = showSdeTrajectories;
    paramsRef.current.showSamples = showSamples;
    paramsRef.current.sigmaSchedule = sigmaSchedule;
    paramsRef.current.sdeNumSteps = sdeNumSteps;
    paramsRef.current.maxSigma = maxSigma;

    engine.renderOnce();
  }, [
    showSdeTrajectories,
    showSamples,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    engine
  ]);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createCondSdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const params = paramsRef.current;

      renderer.setShowSdeTrajectories(params.showSdeTrajectories);
      renderer.setShowSamples(params.showSamples);
      renderer.setSigmaSchedule(params.sigmaSchedule);
      renderer.setSdeNumSteps(params.sdeNumSteps);
      renderer.setMaxSigma(params.maxSigma);

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

      {/* Local controls - SDE-specific */}
      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showSdeTrajectories}
          onChange={setShowSdeTrajectories}
        />
        <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
        <ResampleSdeButton onClick={handleResample} />
        <SigmaScheduleSelection
          value={sigmaSchedule}
          onChange={setSigmaSchedule}
        />
        {showAdditionalControls ? (
          <>
            <NumStepsSlider value={sdeNumSteps} onChange={setSdeNumSteps} />
            <MaxSigmaSlider
              value={maxSigma}
              onChange={setMaxSigma}
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
