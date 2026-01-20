// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import React, { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export interface IconicDropdownOption<T> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface IconicDropdownProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: IconicDropdownOption<T>[];
  width?: string | number;
  triggerIcon?: ReactNode;
}

export function IconicDropdown<T extends string | number>({
  value,
  onChange,
  options,
  width,
  triggerIcon
}: IconicDropdownProps<T>): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const toggle = useCallback(() => { setIsOpen((prev) => !prev); }, []);

  const handleSelect = useCallback(
    (val: T) => {
      onChange(val);
      setIsOpen(false);
    },
    [onChange]
  );

  // Click outside listener
  useEffect(() => {
    if (!isOpen) { return; }

    const handleClickOutside = (e: MouseEvent): void => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return (): void => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const containerClass = `iconic-dropdown ${isOpen ? 'open' : ''}`;

  const iconToShow = triggerIcon ?? selectedOption?.icon;

  return (
    <div
      className={containerClass}
      style={{ width }}
      ref={containerRef}
    >
      <div className="iconic-dropdown-trigger" onClick={toggle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
          {selectedOption ? (
            <>
              {iconToShow !== undefined && iconToShow !== null ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {iconToShow}
                </div>
              ) : null}
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedOption.label}
              </span>
            </>
          ) : (
            <span>Select...</span>
          )}
        </div>
        <div className="iconic-dropdown-arrow" />
      </div>

      <div className="iconic-dropdown-options">
        {options.map((option) => (
          <div
            key={String(option.value)}
            className={`iconic-dropdown-option ${option.value === value ? 'selected' : ''}`}
            onClick={() => { handleSelect(option.value); }}
          >
            {option.icon !== undefined && option.icon !== null ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {option.icon}
              </div>
            ) : null}
            <span>{option.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
