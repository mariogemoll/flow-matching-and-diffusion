import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type SigmaScheduleName } from '../../../math/schedules/sigma';
import { clearWebGl, type WebGl } from '../../../webgl';
import { EllipsisToggle } from '../../components/ellipsis-toggle';
import { ViewContainer, ViewControls } from '../../components/layout';
import { MaxSigmaSlider } from '../../components/max-sigma-slider';
import { NumStepsSlider } from '../../components/num-steps-slider';
import { SigmaScheduleSelection } from '../../components/schedule-selection';
import {
  ResampleDiffusionNoiseButton,
  ResampleSdeButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import {
  COLORS,
  DEFAULT_MAX_SIGMA,
  DEFAULT_NUM_SDE_STEPS,
  DEFAULT_SIGMA_SCHEDULE
} from '../../constants';
import { useEngine } from '../../engine';
import { createMargSdeRenderer, type MargSdeRenderer } from '../../webgl/marginal/sde';
import type { MargPathActions, MargPathState } from '../index';

export interface MargSdeViewProps {
  compact?: boolean;
  useHeun?: boolean;
}

export function MargSdeView({
  compact = true,
  useHeun: initialUseHeun = true
}: MargSdeViewProps): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargSdeRenderer | null>(null);

  // Local UI state
  const [showSdeTrajectories, setShowSdeTrajectories] = useState(true);
  const [showSamples, setShowSamples] = useState(true);
  const [useHeun, setUseHeun] = useState(initialUseHeun);

  const [sigmaSchedule, setSigmaSchedule] = useState<SigmaScheduleName>(DEFAULT_SIGMA_SCHEDULE);
  const [sdeNumSteps, setSdeNumSteps] = useState(DEFAULT_NUM_SDE_STEPS);
  const [maxSigma, setMaxSigma] = useState(DEFAULT_MAX_SIGMA);
  const [showAdditionalControls, setShowAdditionalControls] = useState(false);

  const paramsRef = useRef({
    showSdeTrajectories,
    showSamples,
    useHeun,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma
  });

  // Sync local UI state into ref and trigger render
  useEffect(() => {
    paramsRef.current.showSdeTrajectories = showSdeTrajectories;
    paramsRef.current.showSamples = showSamples;
    paramsRef.current.useHeun = useHeun;
    paramsRef.current.sigmaSchedule = sigmaSchedule;
    paramsRef.current.sdeNumSteps = sdeNumSteps;
    paramsRef.current.maxSigma = maxSigma;

    // Trigger re-render if needed
    if (rendererRef.current) {
      rendererRef.current.setUseHeun(useHeun);
      engine.renderOnce();
    }
  }, [
    showSdeTrajectories,
    showSamples,
    useHeun,
    sigmaSchedule,
    sdeNumSteps,
    maxSigma,
    engine
  ]);

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      // Pass initial useHeun to constructor if needed, or set it immediately
      rendererRef.current ??= createMargSdeRenderer(webGl.gl, paramsRef.current.useHeun);
      const renderer = rendererRef.current;
      const params = paramsRef.current;

      renderer.setShowSdeTrajectories(params.showSdeTrajectories);
      renderer.setShowSamples(params.showSamples);
      renderer.setSigmaSchedule(params.sigmaSchedule);
      renderer.setSdeNumSteps(params.sdeNumSteps);
      renderer.setMaxSigma(params.maxSigma);
      renderer.setUseHeun(params.useHeun);

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  const handleResampleNoise = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resampleNoise();
      engine.renderOnce();
    }
  };

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={showSdeTrajectories}
        onChange={setShowSdeTrajectories}
      />
      <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
      <label className="viz-checkbox">
        <input
          type="checkbox"
          checked={useHeun}
          onChange={(e) => { setUseHeun(e.target.checked); }}
        />
        <span>Heun</span>
      </label>
    </>
  );

  const restControls = (
    <>
      <ResampleSdeButton onClick={handleResample} />
      <SigmaScheduleSelection value={sigmaSchedule} onChange={setSigmaSchedule} />
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
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />

      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {checkboxControls}
            {restControls}
          </div>
        ) : (
          <>
            <div className="view-controls-group">{checkboxControls}</div>
            <div className="view-controls-group">{restControls}</div>
          </>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
