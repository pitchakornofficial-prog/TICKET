'use client';

import { useState } from 'react';
import { InfoIcon } from './icons';

export interface HeaderInfoTooltipProps {
  text: string;
}

export function HeaderInfoTooltip({ text }: HeaderInfoTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span className={`header-info-tooltip-wrap ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="header-info-tooltip-btn"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        aria-label={`คำอธิบาย: ${text}`}
        title={text}
      >
        <InfoIcon width={13} height={13} />
      </button>
      <span className="header-info-tooltip-popover" role="tooltip">
        {text}
      </span>
    </span>
  );
}
