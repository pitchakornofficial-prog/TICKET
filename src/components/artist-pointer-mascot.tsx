'use client';

import { useState, useEffect } from 'react';

export interface ArtistPointerMascotProps {
  customUrls?: string[];
  singleUrl?: string;
  intervalMs?: number;
}

const DEFAULT_FRAMES: string[] = [
  '/artist-pointer-frame1.svg',
  '/artist-pointer-frame2.svg',
  '/artist-pointer-frame3.svg',
];

export function ArtistPointerMascot({
  customUrls,
  singleUrl,
  intervalMs = 650,
}: ArtistPointerMascotProps) {
  const frames =
    customUrls && customUrls.length > 0
      ? customUrls
      : singleUrl
        ? [singleUrl]
        : DEFAULT_FRAMES;

  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;

    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % frames.length);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [frames.length, intervalMs]);

  const activeSrc = frames[frameIndex] || DEFAULT_FRAMES[0];

  return (
    <div className="artist-pointer-mascot-container" aria-hidden="true">
      {/* biome-ignore lint/performance/noImgElement: animated multi-frame artist sticker */}
      <img
        src={activeSrc}
        alt="ศิลปินชี้ปุ่มซื้อบัตร"
        className="artist-pointer-sticker"
        width={320}
        height={360}
        data-testid="artist-pointer-mascot-img"
      />
    </div>
  );
}
