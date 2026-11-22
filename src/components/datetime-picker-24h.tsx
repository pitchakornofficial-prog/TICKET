'use client';

import type React from 'react';
import { useMemo } from 'react';

export interface DateTimePicker24hProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  min?: string;
  max?: string;
  ariaLabel?: string;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function DateTimePicker24h({
  id,
  value,
  onChange,
  disabled = false,
  className = '',
  style,
  min,
  max,
  ariaLabel,
}: DateTimePicker24hProps) {
  const { datePart, hourPart, minutePart } = useMemo(() => {
    if (!value) {
      return { datePart: '', hourPart: '19', minutePart: '00' };
    }
    try {
      // Handles both ISO strings (2026-11-25T19:30:00.000Z) and datetime-local (2026-11-25T19:30)
      if (value.includes('T')) {
        const [d, t] = value.split('T');
        const [h = '19', m = '00'] = (t || '').split(':');
        return {
          datePart: d || '',
          hourPart: h.slice(0, 2).padStart(2, '0'),
          minutePart: m.slice(0, 2).padStart(2, '0'),
        };
      }
      return { datePart: value, hourPart: '19', minutePart: '00' };
    } catch {
      return { datePart: '', hourPart: '19', minutePart: '00' };
    }
  }, [value]);

  const minDate = min?.includes('T') ? min.split('T')[0] : min;
  const maxDate = max?.includes('T') ? max.split('T')[0] : max;

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = e.target.value;
    if (!newDate) {
      onChange('');
    } else {
      onChange(`${newDate}T${hourPart}:${minutePart}`);
    }
  };

  const handleHourChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newHour = e.target.value;
    if (datePart) {
      onChange(`${datePart}T${newHour}:${minutePart}`);
    }
  };

  const handleMinuteChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMinute = e.target.value;
    if (datePart) {
      onChange(`${datePart}T${hourPart}:${newMinute}`);
    }
  };

  return (
    <div
      className={`datetime-picker-24h-wrap ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.35rem',
        maxWidth: '100%',
        ...style,
      }}
    >
      <input
        id={id}
        type="date"
        className="form-input-text datetime-date-input"
        value={datePart}
        onChange={handleDateChange}
        disabled={disabled}
        min={minDate}
        max={maxDate}
        aria-label={ariaLabel || 'วันที่'}
        style={{
          flex: '1 1 auto',
          minWidth: '135px',
          padding: '0.45rem 0.65rem',
          fontSize: '0.9rem',
          borderRadius: '6px',
          border: '1px solid var(--line)',
          background: disabled ? '#f1f5f9' : '#ffffff',
          color: '#0f172a',
        }}
      />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.15rem',
          background: disabled ? '#f1f5f9' : '#ffffff',
          border: '1px solid var(--line)',
          borderRadius: '6px',
          padding: '0.2rem 0.4rem',
        }}
      >
        <select
          value={hourPart}
          onChange={handleHourChange}
          disabled={disabled || !datePart}
          aria-label="ชั่วโมง (24 ชม.)"
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: '0.9rem',
            fontWeight: 600,
            color: datePart ? '#0f172a' : '#94a3b8',
            cursor: datePart ? 'pointer' : 'not-allowed',
            padding: '0.25rem 0.15rem',
            outline: 'none',
          }}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h} น.
            </option>
          ))}
        </select>
        <span style={{ color: '#64748b', fontWeight: 700, fontSize: '0.9rem' }}>:</span>
        <select
          value={minutePart}
          onChange={handleMinuteChange}
          disabled={disabled || !datePart}
          aria-label="นาที"
          style={{
            border: 'none',
            background: 'transparent',
            fontSize: '0.9rem',
            fontWeight: 600,
            color: datePart ? '#0f172a' : '#94a3b8',
            cursor: datePart ? 'pointer' : 'not-allowed',
            padding: '0.25rem 0.15rem',
            outline: 'none',
          }}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
