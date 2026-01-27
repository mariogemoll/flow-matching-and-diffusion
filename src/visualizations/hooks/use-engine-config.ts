// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import { useCallback, useEffect, useRef, useState } from 'react';

function shallowEqual<T extends object>(a: T, b: T): boolean {
  if (a === b) { return true; }
  const aKeys = Object.keys(a) as (keyof T)[];
  const bKeys = Object.keys(b) as (keyof T)[];
  if (aKeys.length !== bKeys.length) { return false; }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) { return false; }
    if (!Object.is(a[key], b[key])) { return false; }
  }
  return true;
}

export function useEngineConfigSync<T extends object>(
  initial: T,
  applyUpdate: (config: Partial<T>) => void
): {
  config: T;
  updateConfig: (config: Partial<T>) => void;
  syncFromFrame: (nextConfig: T) => void;
} {
  const [config, setConfig] = useState(initial);
  const configRef = useRef(config);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const updateConfig = useCallback((partial: Partial<T>) => {
    setConfig((current) => ({ ...current, ...partial }));
    applyUpdate(partial);
  }, [applyUpdate]);

  const syncFromFrame = useCallback((nextConfig: T) => {
    const currentConfig = configRef.current;
    if (!shallowEqual(currentConfig, nextConfig)) {
      setConfig({ ...nextConfig });
    }
  }, []);

  return { config, updateConfig, syncFromFrame };
}
