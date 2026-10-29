'use client';

import type React from 'react';
import { forwardRef, useId } from 'react';
import { AlertIcon } from '@/components/alert-icon';

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    fullWidth = true,
    className = '',
    id,
    disabled,
    required,
    rows = 4,
    ...props
  },
  ref,
) {
  const generatedId = useId();
  const textareaId = id || generatedId;
  const hintId = hint ? `${textareaId}-hint` : undefined;
  const errorId = error ? `${textareaId}-error` : undefined;

  const widthClass = fullWidth ? 'ui-textarea-full' : '';
  const errorClass = error ? 'ui-textarea-has-error' : '';

  return (
    <div className={`ui-textarea-group ${widthClass} ${className}`}>
      {label && (
        <label htmlFor={textareaId} className="ui-textarea-label">
          {label}
          {required && <span className="ui-textarea-required" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className="ui-textarea-wrapper">
        <textarea
          ref={ref}
          id={textareaId}
          disabled={disabled}
          required={required}
          rows={rows}
          className={`ui-textarea ${errorClass}`}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
          {...props}
        />
      </div>

      {hint && !error && (
        <p id={hintId} className="ui-textarea-hint">
          {hint}
        </p>
      )}

      {error && (
        <p id={errorId} className="ui-textarea-error" role="alert">
          <span className="ui-textarea-error-icon" aria-hidden="true">
            <AlertIcon />
          </span>
          <span>{error}</span>
        </p>
      )}
    </div>
  );
});
