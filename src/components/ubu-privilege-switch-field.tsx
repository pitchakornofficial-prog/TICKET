'use client';

export interface UbuPrivilegeSwitchFieldProps {
  id: string;
  priceInputId: string;
  checked: boolean;
  onToggle: (nextChecked: boolean) => void;
  studentPrice: number | null | undefined;
  onPriceChange: (nextPrice: number | null) => void;
  label?: string;
  helperText?: string;
  quotaSummary?: string;
  compact?: boolean;
  testId?: string;
  priceTestId?: string;
}

export function UbuPrivilegeSwitchField({
  id,
  priceInputId,
  checked,
  onToggle,
  studentPrice,
  onPriceChange,
  label = 'เปิดราคาพิเศษนักศึกษา ม.อุบล (@ubu.ac.th)',
  helperText,
  quotaSummary,
  compact = false,
  testId,
  priceTestId,
}: UbuPrivilegeSwitchFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            id={id}
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            data-testid={testId}
            onClick={() => onToggle(!checked)}
            style={{
              position: 'relative',
              width: '36px',
              height: '20px',
              borderRadius: '9999px',
              border: 'none',
              padding: 0,
              background: checked ? '#0f172a' : '#cbd5e1',
              cursor: 'pointer',
              flexShrink: 0,
              transition: 'background-color 0.18s ease',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: '2px',
                left: checked ? '18px' : '2px',
                width: '16px',
                height: '16px',
                borderRadius: '9999px',
                background: '#ffffff',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.2)',
                transition: 'left 0.18s ease',
              }}
            />
          </button>
          <label
            htmlFor={id}
            style={{
              fontSize: compact ? '0.75rem' : '0.8rem',
              fontWeight: 400,
              color: checked ? '#0f172a' : '#64748b',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            {label}
          </label>
        </div>

        {!compact && (
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              border: `1px solid ${checked ? '#0f172a' : '#e2e8f0'}`,
              background: checked ? '#f8fafc' : '#ffffff',
              color: checked ? '#0f172a' : '#94a3b8',
              fontWeight: 400,
            }}
          >
            {checked ? 'เปิดสิทธิ์ ม.อุบล' : 'ปิด'}
          </span>
        )}
      </div>

      {checked && (
        <div
          className="ubu-switch-connector"
          data-testid="ubu-switch-connector"
          style={{
            position: 'relative',
            marginLeft: '17px',
            paddingLeft: '16px',
            paddingTop: '4px',
            borderLeft: '1.5px solid #cbd5e1',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', position: 'relative' }}>
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-16px',
                top: compact ? '15px' : '18px',
                width: '12px',
                height: '1.5px',
                background: '#cbd5e1',
              }}
            />
            <label
              htmlFor={priceInputId}
              style={{
                fontSize: compact ? '0.74rem' : '0.78rem',
                fontWeight: 400,
                color: '#0f172a',
                whiteSpace: 'nowrap',
              }}
            >
              ราคานักศึกษา (บาท)
            </label>
            <input
              id={priceInputId}
              data-testid={priceTestId}
              type="number"
              min={0}
              value={studentPrice ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                onPriceChange(raw === '' ? null : Math.max(0, Number(raw)));
              }}
              placeholder="99"
              className="form-input-text"
              style={{
                width: compact ? '96px' : '124px',
                height: compact ? '32px' : '38px',
                padding: '0 0.6rem',
                fontSize: compact ? '0.78rem' : '0.85rem',
                fontWeight: 400,
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
              }}
            />
            {helperText && (
              <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
                {helperText}
              </span>
            )}
          </div>

          {quotaSummary && (
            <div
              style={{
                fontSize: '0.74rem',
                color: '#475569',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '4px 8px',
                borderRadius: '6px',
              }}
            >
              {quotaSummary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
