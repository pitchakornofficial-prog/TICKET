'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import type { OrganizerFeeMode, CustomerFeeMode } from '@/server/fees';
import { CheckCircleIcon, InfoIcon, ShieldCheckIcon } from './icons';
import { AlertIcon } from './alert-icon';

interface EventSummary {
  id: string;
  title: string;
  location: string;
  status: string;
  organizerName: string;
  organizerEmail: string;
  feeSettings: {
    eventId: string;
    organizerFeeMode: OrganizerFeeMode;
    organizerFeeRate: number;
    customerFeeMode: CustomerFeeMode;
    customerFeeRate: number;
    reservePercentage: number;
    organizerFeeLocked: boolean;
    updatedAt?: string;
  };
}

export function OwnerFeeSettingsManager() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Form states for the selected event
  const [organizerFeeMode, setOrganizerFeeMode] = useState<OrganizerFeeMode>('percentage');
  const [organizerFeeRate, setOrganizerFeeRate] = useState<number>(0);
  const [customerFeeMode, setCustomerFeeMode] = useState<CustomerFeeMode>('per_ticket');
  const [customerFeeRate, setCustomerFeeRate] = useState<number>(0);
  const [reservePercentage, setReservePercentage] = useState<number>(0);
  const [organizerFeeLocked, setOrganizerFeeLocked] = useState<boolean>(false);

  const selectEvent = useCallback((ev: EventSummary) => {
    setSelectedEventId(ev.id);
    const fs = ev.feeSettings;
    setOrganizerFeeMode(fs.organizerFeeMode || 'percentage');
    setOrganizerFeeRate(fs.organizerFeeRate ?? 0);
    setCustomerFeeMode(fs.customerFeeMode || 'per_ticket');
    setCustomerFeeRate(fs.customerFeeRate ?? 0);
    setReservePercentage(fs.reservePercentage ?? 0);
    setOrganizerFeeLocked(Boolean(fs.organizerFeeLocked));
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/events/fee-settings', { cache: 'no-store' });
      if (!res.ok) throw new Error('โหลดข้อมูลงานไม่สำเร็จ');
      const data = await res.json();
      const list: EventSummary[] = data.events || [];
      setEvents(list);
      if (list.length > 0 && !selectedEventId) {
        selectEvent(list[0]);
      } else if (selectedEventId) {
        const found = list.find(e => e.id === selectedEventId);
        if (found) selectEvent(found);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดข้อมูล';
      setMessage({ type: 'error', text: msg });
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, selectEvent]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const selectedEvent = events.find(e => e.id === selectedEventId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEventId) return;

    setMessage(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/owner/events/${selectedEventId}/fee-settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizerFeeMode,
            organizerFeeRate: Number(organizerFeeRate),
            customerFeeMode,
            customerFeeRate: Number(customerFeeRate),
            reservePercentage: Number(reservePercentage),
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || 'บันทึกการตั้งค่าไม่สำเร็จ');
        }

        setMessage({ type: 'success', text: 'บันทึกค่าบริการและเงินสำรองสำเร็จ' });
        await loadEvents();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึก';
        setMessage({ type: 'error', text: msg });
      }
    });
  }

  const organizerModeLabels: Record<OrganizerFeeMode, string> = {
    percentage: 'เปอร์เซ็นต์ยอดขาย (%)',
    per_ticket: 'บาทต่อใบ (฿/ใบ)',
    flat_fee: 'เหมาจ่ายต่องาน (฿)',
  };

  const customerModeLabels: Record<CustomerFeeMode, string> = {
    per_ticket: 'บาทต่อใบ (฿/ใบ)',
    per_order: 'บาทต่อคำสั่งซื้อ (฿/คำสั่งซื้อ)',
    percentage: 'เปอร์เซ็นต์ค่าบัตร (%)',
  };

  return (
    <div className="account-card owner-fee-settings-card" style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
        <ShieldCheckIcon style={{ width: '24px', height: '24px', color: 'var(--blue)' }} />
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>ตั้งค่าบริการและเงินสำรองรายงาน</h2>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: '0 0 1.5rem' }}>
        กำหนดรูปแบบและอัตราค่าบริการผู้จัดงาน ลูกค้า และเปอร์เซ็นต์เงินสำรองรายงานแยกแต่ละงาน (AC-23, AC-24, AC-25, AC-29)
      </p>

      {message && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.8rem 1rem',
            borderRadius: '6px',
            marginBottom: '1.2rem',
            fontSize: '0.95rem',
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#166534' : '#991b1b',
            border: `1px solid ${message.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {message.type === 'success' ? (
            <CheckCircleIcon style={{ width: '18px', height: '18px', flexShrink: 0 }} />
          ) : (
            <AlertIcon />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--muted)' }}>กำลังโหลดรายการงาน...</p>
      ) : events.length === 0 ? (
        <div className="empty-sub-card">
          <InfoIcon />
          <p style={{ margin: 0 }}>ยังไม่มีคอนเสิร์ตในระบบสำหรับตั้งค่า</p>
        </div>
      ) : (
        <div>
          {/* Event Selector */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label htmlFor="event-select" style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
              เลือกคอนเสิร์ต
            </label>
            <select
              id="event-select"
              value={selectedEventId}
              onChange={e => {
                const ev = events.find(item => item.id === e.target.value);
                if (ev) {
                  setMessage(null);
                  selectEvent(ev);
                }
              }}
              style={{
                width: '100%',
                maxWidth: '32rem',
                padding: '0.6rem 0.8rem',
                borderRadius: '4px',
                border: '1px solid var(--line)',
                background: 'var(--white)',
                font: 'inherit',
              }}
            >
              {events.map(ev => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} (ผู้จัด: {ev.organizerName}) — สถานะ: {ev.status}
                </option>
              ))}
            </select>
          </div>

          {selectedEvent && (
            <form onSubmit={handleSave} style={{ background: '#fafafb', border: '1px solid var(--line)', borderRadius: '8px', padding: '1.5rem' }}>
              <div style={{ marginBottom: '1.2rem', paddingBottom: '0.8rem', borderBottom: '1px solid var(--line)' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--blue)', fontWeight: 600, textTransform: 'uppercase' }}>
                  งานที่เลือก
                </span>
                <h3 style={{ margin: '0.3rem 0 0.2rem', fontSize: '1.15rem' }}>{selectedEvent.title}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted)' }}>
                  สถานที่: {selectedEvent.location} | ผู้จัดงาน: {selectedEvent.organizerName} ({selectedEvent.organizerEmail})
                </p>
              </div>

              {/* Organizer Fee Settings (AC-23) */}
              <div style={{ marginBottom: '1.5rem', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '6px', padding: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>1. ค่าบริการฝั่งผู้จัดงาน (AC-23)</h4>
                  {organizerFeeLocked ? (
                    <span style={{ fontSize: '0.8rem', background: '#fee2e2', color: '#991b1b', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                      ล็อกแล้ว (มีคำสั่งซื้อหรือกันบัตรแล้ว)
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', background: '#e0e7ff', color: 'var(--blue)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                      แก้ไขได้ (ยังไม่มีคำสั่งซื้อ)
                    </span>
                  )}
                </div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  เลือกได้ 1 รูปแบบ: เปอร์เซ็นต์ยอดขาย, บาทต่อใบ, หรือเหมาจ่ายต่องาน (F_o คำนวณราย order หรือเหมาจ่ายต่องาน)
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label htmlFor="organizer-fee-mode" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                      รูปแบบค่าบริการ
                    </label>
                    <select
                      id="organizer-fee-mode"
                      value={organizerFeeMode}
                      disabled={organizerFeeLocked}
                      onChange={e => setOrganizerFeeMode(e.target.value as OrganizerFeeMode)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        background: organizerFeeLocked ? '#f3f4f6' : 'var(--white)',
                        font: 'inherit',
                      }}
                    >
                      <option value="percentage">เปอร์เซ็นต์ยอดขาย (%)</option>
                      <option value="per_ticket">บาทต่อใบ (฿/ใบ)</option>
                      <option value="flat_fee">เหมาจ่ายต่องาน (฿)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="organizer-fee-rate" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                      อัตราค่าบริการ {organizerFeeMode === 'percentage' ? '(%)' : '(฿)'}
                    </label>
                    <input
                      id="organizer-fee-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      disabled={organizerFeeLocked}
                      value={organizerFeeRate}
                      onChange={e => setOrganizerFeeRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        background: organizerFeeLocked ? '#f3f4f6' : 'var(--white)',
                        font: 'inherit',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Customer Fee Settings (AC-24) */}
              <div style={{ marginBottom: '1.5rem', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '6px', padding: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>2. ค่าบริการฝั่งลูกค้า (AC-24)</h4>
                  <span style={{ fontSize: '0.8rem', background: '#e0e7ff', color: 'var(--blue)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 500 }}>
                    แก้ไขได้
                  </span>
                </div>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  เลือกได้ 1 รูปแบบ: บาทต่อใบ, บาทต่อคำสั่งซื้อ, หรือเปอร์เซ็นต์ค่าบัตร
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  <div>
                    <label htmlFor="customer-fee-mode" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                      รูปแบบค่าบริการ
                    </label>
                    <select
                      id="customer-fee-mode"
                      value={customerFeeMode}
                      onChange={e => setCustomerFeeMode(e.target.value as CustomerFeeMode)}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        background: 'var(--white)',
                        font: 'inherit',
                      }}
                    >
                      <option value="per_ticket">บาทต่อใบ (฿/ใบ)</option>
                      <option value="per_order">บาทต่อคำสั่งซื้อ (฿/คำสั่งซื้อ)</option>
                      <option value="percentage">เปอร์เซ็นต์ค่าบัตร (%)</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="customer-fee-rate" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                      อัตราค่าบริการ {customerFeeMode === 'percentage' ? '(%)' : '(฿)'}
                    </label>
                    <input
                      id="customer-fee-rate"
                      type="number"
                      step="0.01"
                      min="0"
                      value={customerFeeRate}
                      onChange={e => setCustomerFeeRate(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.55rem 0.75rem',
                        borderRadius: '4px',
                        border: '1px solid var(--line)',
                        background: 'var(--white)',
                        font: 'inherit',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Reserve Percentage Settings (AC-29) */}
              <div style={{ marginBottom: '1.5rem', background: 'var(--white)', border: '1px solid var(--line)', borderRadius: '6px', padding: '1.2rem' }}>
                <h4 style={{ margin: '0 0 0.6rem', fontSize: '1rem', fontWeight: 600 }}>3. เปอร์เซ็นต์เงินสำรองรายงาน (AC-29)</h4>
                <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                  กันไว้จากรายได้สุทธิเพื่อรองรับการคืนเงินหลังหักค่าบริการผู้จัดงาน (0 ถึง 100%)
                </p>

                <div style={{ maxWidth: '240px' }}>
                  <label htmlFor="reserve-percentage" style={{ display: 'block', fontSize: '0.9rem', marginBottom: '0.3rem' }}>
                    เปอร์เซ็นต์เงินสำรอง (%)
                  </label>
                  <input
                    id="reserve-percentage"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={reservePercentage}
                    onChange={e => setReservePercentage(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      borderRadius: '4px',
                      border: '1px solid var(--line)',
                      background: 'var(--white)',
                      font: 'inherit',
                    }}
                  />
                </div>
              </div>

              {/* Effective Summary Box (AC-25) */}
              <div
                style={{
                  marginBottom: '1.5rem',
                  padding: '1.2rem',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <InfoIcon style={{ width: '18px', height: '18px', color: 'var(--blue)' }} />
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>สรุปค่าตั้งที่มีผลสำหรับงานนี้ (AC-25)</span>
                </div>
                <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.4rem', fontSize: '0.9rem', lineHeight: 1.6 }}>
                  <li>
                    <strong>ค่าบริการผู้จัดงาน:</strong> {organizerModeLabels[organizerFeeMode]} อัตรา{' '}
                    <span id="effective-organizer-rate">{organizerFeeRate.toFixed(2)}</span>{' '}
                    {organizerFeeMode === 'percentage' ? '%' : '฿'}
                  </li>
                  <li>
                    <strong>ค่าบริการลูกค้า:</strong> {customerModeLabels[customerFeeMode]} อัตรา{' '}
                    <span id="effective-customer-rate">{customerFeeRate.toFixed(2)}</span>{' '}
                    {customerFeeMode === 'percentage' ? '%' : '฿'}
                  </li>
                  <li>
                    <strong>เงินสำรองรายงาน:</strong>{' '}
                    <span id="effective-reserve-rate">{reservePercentage.toFixed(2)}</span>%
                  </li>
                </ul>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                  * แต่ละฝ่ายมีรูปแบบค่าบริการที่มีผลเพียง 1 รูปแบบ ไม่ซ้อนหลายรูปแบบสำหรับฝ่ายเดียวตาม AC-25
                </p>
              </div>

              <button
                type="submit"
                disabled={isPending}
                className="action-button"
                style={{
                  minHeight: '44px',
                  padding: '0.7rem 1.8rem',
                  background: 'var(--blue)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: 600,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
