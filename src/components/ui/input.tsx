'use client';

import type React from 'react';
import { forwardRef, useId } from 'react';
import { AlertIcon } from '@/components/alert-icon';

export type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string;
  size?: InputSize;
  prefixIcon?: React.ReactNode;
  suffixIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    size = 'md',
    prefixIcon,
    suffixIcon,
    fullWidth = true,
    className = '',
    id,
    disabled,
    required,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;

  const widthClass = fullWidth ? 'ui-input-full' : '';
  const errorClass = error ? 'ui-input-has-error' : '';
  const prefixClass = prefixIcon ? 'ui-input-has-prefix' : '';
  const suffixClass = suffixIcon ? 'ui-input-has-suffix' : '';
  const sizeClass = `ui-input-${size}`;

  return (
    <div className={`ui-input-group ${widthClass} ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ui-input-label">
          {label}
          {required && <span className="ui-input-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className="ui-input-wrapper">
        {prefixIcon && <span className="ui-input-prefix">{prefixIcon}</span>}

        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          required={required}
          className={`ui-input ${sizeClass} ${errorClass} ${prefixClass} ${suffixClass}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...props}
        />

        {suffixIcon && <span className="ui-input-suffix">{suffixIcon}</span>}
      </div>

      {hint && !error && (
        <p id={hintId} className="ui-input-hint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="ui-input-error" role="alert">
          <span className="ui-input-error-icon" aria-hidden="true">
            <AlertIcon />
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
