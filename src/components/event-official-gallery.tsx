'use client';

import { useState } from 'react';
import { CameraIcon } from './icons';
import { ImageLightboxModal } from './image-lightbox-modal';

interface GalleryItem {
  id: string;
  title: string;
  imageUrl: string;
}

interface EventOfficialGalleryProps {
  eventTitle: string;
  customItems?: GalleryItem[];
}

// Built-in high quality SVG data URLs for official gallery exhibits
const DEFAULT_STAGE_MAP_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#0f172a"/>
  <defs>
    <linearGradient id="stageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <!-- Main Stage -->
  <rect x="250" y="30" width="300" height="75" rx="8" fill="url(#stageGrad)" stroke="#60a5fa" stroke-width="2"/>
  <text x="400" y="75" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">MAIN STAGE (เวที 360 องศา)</text>
  <!-- Catwalk / Thrust -->
  <rect x="360" y="105" width="80" height="55" fill="url(#stageGrad)"/>
  <!-- Standing Zone A (VIP) -->
  <rect x="180" y="170" width="200" height="105" rx="6" fill="#be185d" fill-opacity="0.3" stroke="#f472b6" stroke-width="2"/>
  <text x="280" y="225" fill="#fbcfe8" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">ZONE A (STANDING VIP)</text>
  <text x="280" y="250" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">ประตูทางเข้า EAST 1</text>
  <!-- Standing Zone B (VIP) -->
  <rect x="420" y="170" width="200" height="105" rx="6" fill="#be185d" fill-opacity="0.3" stroke="#f472b6" stroke-width="2"/>
  <text x="520" y="225" fill="#fbcfe8" font-family="system-ui, sans-serif" font-size="16" font-weight="bold" text-anchor="middle">ZONE B (STANDING VIP)</text>
  <text x="520" y="250" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">ประตูทางเข้า WEST 1</text>
  <!-- Sound Control / FOH -->
  <rect x="350" y="295" width="100" height="30" rx="4" fill="#334155" stroke="#64748b" stroke-width="1.5"/>
  <text x="400" y="315" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">CONTROL FOH</text>
  <!-- Seating Tier 1 -->
  <path d="M 80,305 Q 400,380 720,305 L 750,355 Q 400,435 50,355 Z" fill="#2563eb" fill-opacity="0.35" stroke="#3b82f6" stroke-width="2"/>
  <text x="400" y="375" fill="#93c5fd" font-family="system-ui, sans-serif" font-size="15" font-weight="bold" text-anchor="middle">SEATING TIER 1 (โซนที่นั่งชั้นลอย)</text>
  <!-- Legend Bar -->
  <rect x="60" y="410" width="680" height="26" rx="4" fill="#1e293b"/>
  <text x="400" y="428" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="12" text-anchor="middle">แผนผังจำลองอย่างเป็นทางการเพื่อการนำทางและเลือกโซนที่นั่ง</text>
</svg>
`)}`;

const DEFAULT_SCHEDULE_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#0f172a"/>
  <!-- Header -->
  <rect x="50" y="20" width="700" height="45" rx="6" fill="#1e293b"/>
  <text x="400" y="49" fill="#38bdf8" font-family="system-ui, sans-serif" font-size="17" font-weight="bold" text-anchor="middle">ตารางกิจกรรมและขั้นตอนการเข้าชมงาน (EVENT TIMELINE)</text>
  <!-- Timeline Line -->
  <line x1="160" y1="100" x2="160" y2="400" stroke="#334155" stroke-width="3" stroke-dasharray="6,6"/>
  <!-- Step 1 -->
  <circle cx="160" cy="115" r="15" fill="#0284c7"/>
  <text x="160" y="120" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">1</text>
  <rect x="200" y="95" width="530" height="48" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1"/>
  <text x="220" y="118" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">13:00 น. — เปิดจุดบริการบัตรแข็งและรับสายรัดข้อมือ</text>
  <text x="220" y="134" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11">แสดง QR Code จากหน้าคำสั่งซื้อเพื่อสแกนรับริสต์แบนด์ ณ ลานกิจกรรมหน้าฮอลล์</text>
  <!-- Step 2 -->
  <circle cx="160" cy="190" r="15" fill="#0284c7"/>
  <text x="160" y="195" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">2</text>
  <rect x="200" y="170" width="530" height="48" rx="6" fill="#1e293b" stroke="#334155" stroke-width="1"/>
  <text x="220" y="193" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">14:00 น. — เปิดบูธจำหน่ายสินค้าที่ระลึก (Official Merchandise)</text>
  <text x="220" y="209" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11">สินค้าลิมิเต็ดอิดิชัน แท่งไฟ และเสื้อทัวร์คอนเสิร์ต รองรับการชำระผ่าน PromptPay</text>
  <!-- Step 3 -->
  <circle cx="160" cy="265" r="15" fill="#0284c7"/>
  <text x="160" y="270" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">3</text>
  <rect x="200" y="245" width="530" height="48" rx="6" fill="#1e293b" stroke="#38bdf8" stroke-width="1"/>
  <text x="220" y="268" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">17:00 น. — ประตูฮอลล์เปิด (Door Open) เข้าสู่พื้นที่ชมการแสดง</text>
  <text x="220" y="284" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="11">ตรวจคัดกรองสิ่งของต้องห้าม และตรวจบัตรโดยเจ้าหน้าที่ประจำแต่ละประตู</text>
  <!-- Step 4 -->
  <circle cx="160" cy="340" r="15" fill="#16a34a"/>
  <text x="160" y="345" fill="#ffffff" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" text-anchor="middle">4</text>
  <rect x="200" y="320" width="530" height="48" rx="6" fill="#1e293b" stroke="#22c55e" stroke-width="1.5"/>
  <text x="220" y="343" fill="#4ade80" font-family="system-ui, sans-serif" font-size="14" font-weight="bold">19:00 – 22:00 น. — การแสดงคอนเสิร์ตเริ่มตรงเวลา</text>
  <text x="220" y="359" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="11">ระเบิดความมันส์เต็มอิ่มตลอด 3 ชั่วโมงเต็ม ร่วมสร้างความทรงจำที่ไม่มีวันลืม</text>
</svg>
`)}`;

const DEFAULT_PRODUCTION_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
  <rect width="800" height="450" fill="#090d16"/>
  <!-- Beams of light -->
  <polygon points="400,50 100,450 220,450" fill="#6366f1" fill-opacity="0.35"/>
  <polygon points="400,50 250,450 380,450" fill="#06b6d4" fill-opacity="0.3"/>
  <polygon points="400,50 420,450 550,450" fill="#ec4899" fill-opacity="0.3"/>
  <polygon points="400,50 580,450 700,450" fill="#3b82f6" fill-opacity="0.35"/>
  <!-- Truss and Stage Lights -->
  <line x1="120" y1="50" x2="680" y2="50" stroke="#475569" stroke-width="6"/>
  <circle cx="200" cy="50" r="10" fill="#38bdf8"/>
  <circle cx="300" cy="50" r="10" fill="#f43f5e"/>
  <circle cx="400" cy="50" r="12" fill="#a855f7"/>
  <circle cx="500" cy="50" r="10" fill="#38bdf8"/>
  <circle cx="600" cy="50" r="10" fill="#f43f5e"/>
  <!-- Center Stage Graphic -->
  <ellipse cx="400" cy="350" rx="260" ry="70" fill="#1e1b4b" stroke="#818cf8" stroke-width="2"/>
  <text x="400" y="345" fill="#ffffff" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" text-anchor="middle">WORLD-CLASS PRODUCTION</text>
  <text x="400" y="372" fill="#a5b4fc" font-family="system-ui, sans-serif" font-size="13" text-anchor="middle">เวทีระบบไฮดรอลิก 360 องศา พร้อมระบบเลเซอร์และเสียงเซอร์ราวด์รอบทิศทาง</text>
</svg>
`)}`;

export function EventOfficialGallery({
  eventTitle,
  customItems,
}: EventOfficialGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const galleryItems: GalleryItem[] = customItems && customItems.length > 0
    ? customItems
    : [
        {
          id: 'stage-layout',
          title: 'ผังเวทีและโซนที่นั่งอย่างเป็นทางการ',
          imageUrl: DEFAULT_STAGE_MAP_SVG,
        },
        {
          id: 'event-schedule',
          title: 'กำหนดการและกิจกรรมรอบพื้นที่จัดงาน',
          imageUrl: DEFAULT_SCHEDULE_SVG,
        },
        {
          id: 'world-class-production',
          title: 'ระบบแสงสีเสียงและบรรยากาศโปรดักชัน',
          imageUrl: DEFAULT_PRODUCTION_SVG,
        },
      ];

  const handlePrev = () => {
    if (activeIndex === null) return;
    setActiveIndex((activeIndex - 1 + galleryItems.length) % galleryItems.length);
  };

  const handleNext = () => {
    if (activeIndex === null) return;
    setActiveIndex((activeIndex + 1) % galleryItems.length);
  };

  const currentItem = activeIndex !== null ? galleryItems[activeIndex] : null;

  return (
    <section className="event-category-card" aria-labelledby="cat-gallery-title">
      <div className="category-header-wrap">
        <h2 id="cat-gallery-title" className="category-heading">
          <CameraIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
          ภาพเพิ่มเติมจากผู้จัด (Event Gallery)
          <span className="sr-only">สำหรับ {eventTitle}</span>
        </h2>
      </div>

      <div className="category-body-content">
        <div className="pure-gallery-grid-16x9">
          {galleryItems.map((item, idx) => (
            <button
              key={item.id}
              type="button"
              className="gallery-thumb-pure-btn"
              onClick={() => setActiveIndex(idx)}
              aria-label={`คลิกเพื่อดูภาพ ${item.title} ขนาดใหญ่`}
            >
              {/* biome-ignore lint/performance/noImgElement: official 16:9 pure image gallery */}
              <img
                src={item.imageUrl}
                alt={item.title}
                className="gallery-thumb-pure-img"
                loading="lazy"
              />
              <span className="poster-zoom-hint" aria-hidden="true">
                คลิกเพื่อดูภาพขนาดใหญ่
              </span>
            </button>
          ))}
        </div>
      </div>

      {currentItem && (
        <ImageLightboxModal
          isOpen={Boolean(currentItem)}
          imageUrl={currentItem.imageUrl}
          imageAlt={currentItem.title}
          onPrev={handlePrev}
          onNext={handleNext}
          onClose={() => setActiveIndex(null)}
        />
      )}
    </section>
  );
}
