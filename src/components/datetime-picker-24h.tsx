'use client';

import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

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

const OUTER_HOURS = HOURS.slice(0, 12);
const INNER_HOURS = HOURS.slice(12, 24);
const DIAL_MINUTES = MINUTES.filter((_, i) => i % 5 === 0);

const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
];

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

function parseYmd(ymd: string): { year: number; month: number; day: number } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m - 1, day: d };
}

function toYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatThaiDisplayDate(ymd: string): string {
  const parsed = parseYmd(ymd);
  if (!parsed) return '';
  return `${parsed.day} ${THAI_SHORT_MONTHS[parsed.month]} ${parsed.year + 543}`;
}

function dialCoords(index: number, total: number, radius: number, center = 100): { x: number; y: number } {
  const angleRad = ((index / total) * 360 - 90) * (Math.PI / 180);
  return {
    x: center + radius * Math.cos(angleRad),
    y: center + radius * Math.sin(angleRad),
  };
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [clockMode, setClockMode] = useState<'hour' | 'minute'>('hour');

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

  const todayYmd = useMemo(() => {
    const now = new Date();
    return toYmd(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const [viewYear, setViewYear] = useState<number>(() => {
    return parseYmd(datePart)?.year ?? new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    return parseYmd(datePart)?.month ?? new Date().getMonth();
  });

  useEffect(() => {
    if (!isOpen) return;
    const parsed = parseYmd(datePart);
    if (parsed) {
      setViewYear(parsed.year);
      setViewMonth(parsed.month);
    }
  }, [isOpen, datePart]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const calendarCells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ key: string; day: number | null; ymd: string | null }> = [];
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ key: `pad-${viewYear}-${viewMonth}-${i}`, day: null, ymd: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ymd = toYmd(viewYear, viewMonth, d);
      cells.push({ key: ymd, day: d, ymd });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const isDateDisabled = (ymd: string): boolean => {
    if (minDate && ymd < minDate) return true;
    if (maxDate && ymd > maxDate) return true;
    return false;
  };

  const resolveActiveDate = (): string => {
    if (datePart) return datePart;
    if (!isDateDisabled(todayYmd)) return todayYmd;
    return minDate || todayYmd;
  };

  const handleSelectDate = (ymd: string) => {
    if (disabled || isDateDisabled(ymd)) return;
    onChange(`${ymd}T${hourPart}:${minutePart}`);
  };

  const handleClearDate = () => {
    onChange('');
    setIsOpen(false);
  };

  const handleSelectToday = () => {
    if (isDateDisabled(todayYmd)) return;
    onChange(`${todayYmd}T${hourPart}:${minutePart}`);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const handleSelectHour = (h: string) => {
    const activeDate = resolveActiveDate();
    onChange(`${activeDate}T${h}:${minutePart}`);
    setClockMode('minute');
  };

  const handleSelectMinute = (m: string) => {
    const activeDate = resolveActiveDate();
    onChange(`${activeDate}T${hourPart}:${m}`);
  };

  const handleStepMinute = (delta: number) => {
    const current = Number(minutePart) || 0;
    const next = (current + delta + 60) % 60;
    handleSelectMinute(MINUTES[next]);
  };

  const handleMinuteDialClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (clockMode !== 'minute' || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360;
    const minIndex = Math.round(deg / 6) % 60;
    handleSelectMinute(MINUTES[minIndex]);
  };

  const hourNum = Number(hourPart) || 0;
  const minuteNum = Number(minutePart) || 0;
  const handTarget =
    clockMode === 'hour'
      ? dialCoords(hourNum % 12, 12, hourNum >= 12 ? 46 : 76)
      : dialCoords(minuteNum, 60, 76);

  return (
    <div
      ref={containerRef}
      className={`datetime-picker-24h-wrap ${className}`}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        ...style,
      }}
    >
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setClockMode('hour');
          setIsOpen((prev) => !prev);
        }}
        aria-label={ariaLabel || 'เลือกวันที่และเวลา'}
        aria-expanded={isOpen}
        data-testid="datetime-unified-trigger"
        className="datetime-unified-trigger"
        style={{
          width: '100%',
          height: '38px',
          padding: '0 0.75rem',
          fontSize: '0.875rem',
          fontWeight: 400,
          fontFamily: 'inherit',
          borderRadius: '8px',
          border: `1px solid ${isOpen ? '#0f172a' : '#cbd5e1'}`,
          background: disabled ? '#f8fafc' : '#ffffff',
          color: datePart ? '#0f172a' : '#94a3b8',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s ease',
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {datePart ? `${formatThaiDisplayDate(datePart)}  ·  ${hourPart}:${minutePart} น.` : 'เลือกวันที่และเวลา'}
        </span>
        <CalendarIcon style={{ width: '15px', height: '15px', color: '#64748b', flexShrink: 0 }} />
      </button>

      {isOpen && !disabled && (
        <div
          role="dialog"
          aria-label="เลือกวันที่และเวลา"
          data-testid="datetime-unified-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 80,
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)',
            padding: '12px',
            width: 'max-content',
            maxWidth: 'calc(100vw - 2rem)',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '14px',
              alignItems: 'flex-start',
            }}
          >
            {/* Left: Calendar */}
            <div style={{ width: '248px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  aria-label="เดือนก่อนหน้า"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#334155',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeftIcon style={{ width: '14px', height: '14px' }} />
                </button>

                <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#0f172a' }}>
                  {THAI_MONTHS[viewMonth]} {viewYear + 543}
                </span>

                <button
                  type="button"
                  onClick={handleNextMonth}
                  aria-label="เดือนถัดไป"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    color: '#334155',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <ChevronRightIcon style={{ width: '14px', height: '14px' }} />
                </button>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '2px',
                  marginBottom: '4px',
                  textAlign: 'center',
                }}
              >
                {WEEKDAYS.map((w) => (
                  <div key={w} style={{ fontSize: '0.72rem', color: '#64748b', padding: '3px 0', fontWeight: 400 }}>
                    {w}
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  gap: '2px',
                }}
              >
                {calendarCells.map((cell) => {
                  if (!cell.day || !cell.ymd) {
                    return <div key={cell.key} style={{ height: '30px' }} />;
                  }
                  const ymd = cell.ymd;
                  const isSelected = datePart === ymd;
                  const isToday = todayYmd === ymd;
                  const dayDisabled = isDateDisabled(ymd);

                  return (
                    <button
                      key={ymd}
                      type="button"
                      disabled={dayDisabled}
                      onClick={() => handleSelectDate(ymd)}
                      style={{
                        height: '30px',
                        borderRadius: '6px',
                        border: isToday && !isSelected ? '1px solid #cbd5e1' : '1px solid transparent',
                        background: isSelected ? '#0f172a' : 'transparent',
                        color: dayDisabled ? '#cbd5e1' : isSelected ? '#ffffff' : '#0f172a',
                        fontSize: '0.78rem',
                        fontWeight: 400,
                        fontFamily: 'inherit',
                        cursor: dayDisabled ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right: Circular 24h Clock Dial */}
            <div style={{ width: '216px', paddingLeft: '12px', borderLeft: '1px solid #f1f5f9' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  marginBottom: '8px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setClockMode('hour')}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '6px',
                    border: `1px solid ${clockMode === 'hour' ? '#0f172a' : '#e2e8f0'}`,
                    background: clockMode === 'hour' ? '#f8fafc' : '#ffffff',
                    color: clockMode === 'hour' ? '#0f172a' : '#64748b',
                    fontSize: '1rem',
                    fontWeight: 400,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {hourPart}
                </button>
                <span style={{ fontSize: '1rem', color: '#64748b' }}>:</span>
                <button
                  type="button"
                  onClick={() => setClockMode('minute')}
                  style={{
                    padding: '3px 9px',
                    borderRadius: '6px',
                    border: `1px solid ${clockMode === 'minute' ? '#0f172a' : '#e2e8f0'}`,
                    background: clockMode === 'minute' ? '#f8fafc' : '#ffffff',
                    color: clockMode === 'minute' ? '#0f172a' : '#64748b',
                    fontSize: '1rem',
                    fontWeight: 400,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {minutePart}
                </button>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>น.</span>
              </div>

              <div
                ref={dialRef}
                onClick={handleMinuteDialClick}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && clockMode === 'minute') handleStepMinute(1);
                  if (e.key === 'ArrowDown' && clockMode === 'minute') handleStepMinute(-1);
                }}
                role="application"
                aria-label="หน้าปัดนาฬิกาเลือกเวลา"
                style={{
                  position: 'relative',
                  width: '200px',
                  height: '200px',
                  margin: '0 auto',
                  borderRadius: '9999px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  userSelect: 'none',
                }}
              >
                <svg
                  width="200"
                  height="200"
                  viewBox="0 0 200 200"
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
                  aria-hidden="true"
                >
                  <line
                    x1="100"
                    y1="100"
                    x2={handTarget.x}
                    y2={handTarget.y}
                    stroke="#0f172a"
                    strokeWidth="1.5"
                  />
                  <circle cx="100" cy="100" r="3" fill="#0f172a" />
                </svg>

                {clockMode === 'hour' ? (
                  <>
                    {OUTER_HOURS.map((h, idx) => {
                      const pos = dialCoords(idx, 12, 76);
                      const active = hourPart === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectHour(h);
                          }}
                          style={{
                            position: 'absolute',
                            left: `${pos.x - 13}px`,
                            top: `${pos.y - 13}px`,
                            width: '26px',
                            height: '26px',
                            borderRadius: '9999px',
                            border: 'none',
                            background: active ? '#0f172a' : 'transparent',
                            color: active ? '#ffffff' : '#0f172a',
                            fontSize: '0.74rem',
                            fontWeight: 400,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {h}
                        </button>
                      );
                    })}
                    {INNER_HOURS.map((h, idx) => {
                      const pos = dialCoords(idx, 12, 46);
                      const active = hourPart === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectHour(h);
                          }}
                          style={{
                            position: 'absolute',
                            left: `${pos.x - 12}px`,
                            top: `${pos.y - 12}px`,
                            width: '24px',
                            height: '24px',
                            borderRadius: '9999px',
                            border: 'none',
                            background: active ? '#0f172a' : 'transparent',
                            color: active ? '#ffffff' : '#64748b',
                            fontSize: '0.7rem',
                            fontWeight: 400,
                            fontFamily: 'inherit',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {h}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  DIAL_MINUTES.map((m, idx) => {
                    const pos = dialCoords(idx, 12, 76);
                    const active = minutePart === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectMinute(m);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${pos.x - 13}px`,
                          top: `${pos.y - 13}px`,
                          width: '26px',
                          height: '26px',
                          borderRadius: '9999px',
                          border: 'none',
                          background: active ? '#0f172a' : 'transparent',
                          color: active ? '#ffffff' : '#0f172a',
                          fontSize: '0.74rem',
                          fontWeight: 400,
                          fontFamily: 'inherit',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {m}
                      </button>
                    );
                  })
                )}
              </div>

              {clockMode === 'minute' && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => handleStepMinute(-1)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '0.72rem',
                      fontWeight: 400,
                      cursor: 'pointer',
                    }}
                  >
                    -1 น.
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepMinute(1)}
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '0.72rem',
                      fontWeight: 400,
                      cursor: 'pointer',
                    }}
                  >
                    +1 น.
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Unified Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px solid #f1f5f9',
            }}
          >
            <div style={{ display: 'inline-flex', gap: '6px' }}>
              <button
                type="button"
                onClick={handleClearDate}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  color: '#64748b',
                  fontSize: '0.75rem',
                  fontWeight: 400,
                  cursor: 'pointer',
                }}
              >
                ล้างค่า
              </button>
              <button
                type="button"
                onClick={handleSelectToday}
                disabled={isDateDisabled(todayYmd)}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.75rem',
                  fontWeight: 400,
                  cursor: isDateDisabled(todayYmd) ? 'not-allowed' : 'pointer',
                }}
              >
                วันนี้
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                padding: '4px 12px',
                borderRadius: '6px',
                border: '1px solid #0f172a',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '0.75rem',
                fontWeight: 400,
                cursor: 'pointer',
              }}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
