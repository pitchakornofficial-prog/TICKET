'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import {
  ShieldCheckIcon,
  CameraOffIcon,
  AlertTriangleIcon,
  CrossCircleIcon,
  SparklesIcon,
  InfoIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from './icons';

interface ProhibitedItem {
  id: string;
  icon: typeof CameraOffIcon;
  title: string;
  desc: string;
}

const PROHIBITED_ITEMS: ProhibitedItem[] = [
  {
    id: 'cameras',
    icon: CameraOffIcon,
    title: 'กล้องและอุปกรณ์บันทึกภาพ',
    desc: 'ไม่อนุญาตให้นำกล้อง DSLR, กล้อง Mirrorless, เลนส์ซูมระยะไกล, ขาตั้งกล้อง, ไม้เซลฟี่ และโดรนเข้าพื้นที่จัดงาน',
  },
  {
    id: 'weapons',
    icon: AlertTriangleIcon,
    title: 'อาวุธและของมีคมทุกชนิด',
    desc: 'ห้ามนำอาวุธปืน, มีดพก, กรรไกร, คัตเตอร์, วัตถุปลายแหลม และสิ่งเทียมอาวุธทุกประเภทเข้าสู่สถานที่จัดงานโดยเด็ดขาด',
  },
  {
    id: 'food',
    icon: CrossCircleIcon,
    title: 'อาหารและเครื่องดื่มภายนอก',
    desc: 'ไม่อนุญาตให้นำอาหารกล่อง, ขนม, ขวดแก้ว, กระป๋องโลหะ หรือเครื่องดื่มแอลกอฮอล์จากภายนอกเข้างาน (มีจุดบริการจำหน่ายภายในงาน)',
  },
  {
    id: 'banners',
    icon: SparklesIcon,
    title: 'ป้ายไฟขนาดใหญ่และเลเซอร์',
    desc: 'ห้ามนำป้ายไฟหรือป้ายผ้าขนาดเกิน A4 (21x29.7 ซม.), ปากกาเลเซอร์พอยเตอร์, โทรโข่ง หรืออุปกรณ์ส่งเสียงรบกวนการแสดง',
  },
  {
    id: 'drugs',
    icon: ShieldCheckIcon,
    title: 'สารเสพติดและวัตถุไวไฟ',
    desc: 'ห้ามนำสารเสพติดทุกประเภท, บุหรี่ไฟฟ้า, น้ำยาบุหรี่ไฟฟ้า, ดอกไม้ไฟ, พลุ, ประทัด และสารเคมีไวไฟเข้าพื้นที่โดยเด็ดขาด',
  },
  {
    id: 'luggage',
    icon: InfoIcon,
    title: 'กระเป๋าขนาดใหญ่และสัมภาระ',
    desc: 'ไม่อนุญาตให้นำกระเป๋าเดินทางขนาดเกิน 40x30 ซม., เก้าอี้พับ, บันไดพับ, ร่มก้านยาวปลายแหลม และสัตว์เลี้ยงทุกชนิดเข้างาน',
  },
];

export function EventProhibitedItemsCarousel() {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    if (!trackRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = trackRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  }, []);

  useEffect(() => {
    checkScroll();
    const track = trackRef.current;
    if (!track) return;
    track.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      track.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (direction: 'left' | 'right') => {
    if (!trackRef.current) return;
    const scrollAmount = 340;
    trackRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  return (
    <section className="event-category-card" aria-labelledby="cat-prohibited-title">
      <div className="category-header-wrap">
        <div className="category-header-split">
          <h2 id="cat-prohibited-title" className="category-heading">
            <ShieldCheckIcon style={{ width: '22px', height: '22px', color: 'var(--blue)' }} />
            กฎระเบียบและสิ่งของต้องห้ามนำเข้างาน (Regulations & Prohibited Items)
          </h2>
          <div className="header-carousel-nav" role="toolbar" aria-label="เลื่อนดูสิ่งของต้องห้าม">
            <button
              type="button"
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className="carousel-nav-btn"
              aria-label="เลื่อนไปทางซ้าย"
            >
              <ChevronLeftIcon style={{ width: '18px', height: '18px' }} />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className="carousel-nav-btn"
              aria-label="เลื่อนไปทางขวา"
            >
              <ChevronRightIcon style={{ width: '18px', height: '18px' }} />
            </button>
          </div>
        </div>
      </div>

      <div className="category-body-content">
        <p className="section-note" style={{ margin: '0 0 1.5rem', color: 'var(--muted)' }}>
          เพื่อความปลอดภัยและความเป็นระเบียบเรียบร้อยของผู้ชมทุกท่าน ไม่อนุญาตให้นำสิ่งของดังต่อไปนี้เข้าสู่พื้นที่จัดการแสดง
        </p>

        <div
          ref={trackRef}
          className="prohibited-items-scroll-track"
        >
          {PROHIBITED_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.id} className="prohibited-item-card">
                <div className="prohibited-standalone-icon" aria-hidden="true">
                  <Icon style={{ width: '26px', height: '26px', color: '#dc2626' }} />
                </div>
                <div className="prohibited-info">
                  <strong className="prohibited-title">{item.title}</strong>
                  <p className="prohibited-desc">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
