'use client';

import type React from 'react';
import { forwardRef, useId } from 'react';
import { AlertIcon } from '@/components/alert-icon';
import { ChevronDownIcon } from '@/components/icons';

export type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: SelectSize;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    size = 'md',
    fullWidth = true,
    className = '',
    id,
    disabled,
    required,
    children,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const selectId = id || generatedId;
  const hintId = hint ? `${selectId}-hint` : undefined;
  const errorId = error ? `${selectId}-error` : undefined;

  const widthClass = fullWidth ? 'ui-select-full' : '';
  const errorClass = error ? 'ui-select-has-error' : '';
  const sizeClass = `ui-select-${size}`;

  return (
    <div className={`ui-select-group ${widthClass} ${className}`}>
      {label && (
        <label htmlFor={selectId} className="ui-select-label">
          {label}
          {required && <span className="ui-select-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className="ui-select-wrapper">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          required={required}
          className={`ui-select ${sizeClass} ${errorClass}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...props}
        >
          {children}
        </select>
        <span className="ui-select-arrow" aria-hidden="true">
          <ChevronDownIcon width={16} height={16} />
        </span>
      </div>

      {hint && !error && (
        <p id={hintId} className="ui-select-hint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="ui-select-error" role="alert">
          <span className="ui-select-error-icon" aria-hidden="true">
            <AlertIcon />
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
