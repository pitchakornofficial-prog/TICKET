'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  OrderRefundEligibilitySummary,
  RefundRequestSummary,
} from '@/server/refunds';
import { formatBaht, formatDate, formatTime } from '@/lib/locale';
import { CheckCircleIcon, ClockIcon, InfoIcon } from './icons';
import { AlertIcon } from './alert-icon';

interface GuestOrderRefundManagerProps {
  orderId: string;
  sessionToken: string;
  onRefundSubmitted?: () => void;
}

export function GuestOrderRefundManager({
  orderId,
  sessionToken,
  onRefundSubmitted,
}: GuestOrderRefundManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [eligibility, setEligibility] = useState<OrderRefundEligibilitySummary | null>(null);
  const [requests, setRequests] = useState<RefundRequestSummary[]>([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankAccountName, setBankAccountName] = useState('');

  const fetchEligibilityAndRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/orders/${orderId}/refund-eligibility`, {
        headers: {
          'x-guest-session': sessionToken,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.message || 'ไม่สามารถตรวจสอบสิทธิ์การขอคืนเงินได้');
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      setEligibility(data.eligibility);
      setRequests(data.requests || []);
      setIsLoading(false);
    } catch {
      setError('เกิดข้อผิดพลาดในการโหลดข้อมูลสิทธิ์การคืนเงิน');
      setIsLoading(false);
    }
  }, [orderId, sessionToken]);

  useEffect(() => {
    fetchEligibilityAndRequests();
  }, [fetchEligibilityAndRequests]);

  const handleTicketToggle = (ticketId: string) => {
    setSelectedTicketIds(prev =>
      prev.includes(ticketId) ? prev.filter(id => id !== ticketId) : [...prev, ticketId],
    );
  };

  const selectedTickets = (eligibility?.tickets || []).filter(t =>
    selectedTicketIds.includes(t.ticketId),
  );

  const selectedAmount = selectedTickets.reduce((sum, t) => sum + t.ticketPrice, 0);

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (selectedTicketIds.length === 0) {
      setError('กรุณาเลือกบัตรที่ต้องการขอคืนเงินอย่างน้อย 1 ใบ (AC-34)');
      return;
    }

    if (!reason.trim()) {
      setError('กรุณาระบุเหตุผลการขอคืนเงิน');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/public/orders/${orderId}/refund-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-guest-session': sessionToken,
        },
        body: JSON.stringify({
          ticketIds: selectedTicketIds,
          reason: reason.trim(),
          bankName: bankName.trim() || undefined,
          bankAccountNo: bankAccountNo.trim() || undefined,
          bankAccountName: bankAccountName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ไม่สามารถยื่นคำขอคืนเงินได้');
        setIsSubmitting(false);
        return;
      }

      setSuccessMessage(
        `ยื่นคำขอคืนเงินรหัส ${data.refundRequestId} เรียบร้อยแล้ว จำนวน ${data.ticketCount} ใบ รวม ${formatBaht(data.requestedAmount)} (สถานะ: รอเจ้าหน้าที่ตรวจสอบ)`,
      );
      setSelectedTicketIds([]);
      setReason('');
      setBankName('');
      setBankAccountNo('');
      setBankAccountName('');
      setIsSubmitting(false);

      // Refresh eligibility and requests
      await fetchEligibilityAndRequests();
      if (onRefundSubmitted) onRefundSubmitted();
    } catch {
      setError('เกิดข้อผิดพลาดในการส่งข้อมูลคำขอคืนเงิน');
      setIsSubmitting(false);
    }
  };

  const eligibleCount = (eligibility?.tickets || []).filter(t => t.eligible).length;

  return (
    <div
      style={{
        marginTop: '20px',
        borderTop: '1px solid #e2e8f0',
        paddingTop: '20px',
      }}
    >
      {/* Existing Refund Requests History */}
      {requests.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 10px 0' }}>
            ประวัติคำขอคืนเงินของคำสั่งซื้อนี้ ({requests.length} รายการ)
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {requests.map(req => {
              const isPending = req.status === 'pending';
              const isApproved = req.status === 'approved';
              const isCompleted = req.status === 'completed';
              const isRejected = req.status === 'rejected';

              return (
                <div
                  key={req.id}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    padding: '12px 16px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 'bold', color: '#0f172a', marginRight: '8px' }}>
                        {req.id}
                      </span>
                      <span style={{ fontSize: '12px', color: '#64748b' }}>
                        ยื่นเมื่อ {formatDate(new Date(req.submittedAt))} {formatTime(new Date(req.submittedAt))}
                      </span>
                    </div>

                    <div>
                      {isPending && (
                        <span
                          style={{
                            backgroundColor: '#fef3c7',
                            color: '#92400e',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <ClockIcon /> รอการตรวจสอบ (pending)
                        </span>
                      )}
                      {isApproved && (
                        <span
                          style={{
                            backgroundColor: '#dbeafe',
                            color: '#1e40af',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <ClockIcon /> อนุมัติแล้ว — รอโอนเงิน
                        </span>
                      )}
                      {isCompleted && (
                        <span
                          style={{
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <CheckCircleIcon /> คืนเงินสำเร็จแล้ว (completed)
                        </span>
                      )}
                      {isRejected && (
                        <span
                          style={{
                            backgroundColor: '#fee2e2',
                            color: '#991b1b',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <AlertIcon /> ปฏิเสธคำขอ
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}>
                    <strong>ยอดเงินที่ขอคืน:</strong> {formatBaht(req.requestedAmount)} (เฉพาะราคาบัตร {req.items.length} ใบ)
                  </div>

                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    <strong>บัตรที่ขอคืน:</strong> {req.items.map(it => it.ticketCode).join(', ')}
                  </div>

                  {req.reason && (
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                      <strong>เหตุผล:</strong> {req.reason}
                    </div>
                  )}

                  {isPending && (
                    <div style={{ fontSize: '12px', color: '#0369a1', marginTop: '6px' }}>
                      * คำขออยู่ในสถานะรอตรวจสอบ บัตรยังสามารถใช้สแกนเข้างานได้จนกว่าจะได้รับการอนุมัติ (AC-34)
                    </div>
                  )}

                  {isApproved && (
                    <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '6px' }}>
                      * คำขอได้รับการอนุมัติแล้ว เจ้าของระบบกำลังดำเนินการโอนเงินคืนเข้าบัญชีธนาคารของท่าน
                    </div>
                  )}

                  {isCompleted && (
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '6px' }}>
                      โอนเงินคืนสำเร็จแล้ว: {formatBaht(req.transferredAmount ?? req.requestedAmount)}
                      {req.transferredAt && ` เมื่อ ${formatDate(new Date(req.transferredAt))} ${formatTime(new Date(req.transferredAt))}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Refund Request Toggle Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => {
            setIsOpen(prev => !prev);
            setError(null);
            setSuccessMessage(null);
          }}
          data-testid="toggle-refund-section-btn"
          style={{
            backgroundColor: isOpen ? '#f1f5f9' : '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#1848ed',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {isOpen ? 'ซ่อนแบบฟอร์มขอคืนเงิน' : 'ยื่นคำขอคืนเงินบัตร (บางใบหรือทั้งหมด)'}
        </button>

        {eligibility && (
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            บัตรที่สามารถยื่นคืนได้ {eligibleCount} จาก {eligibility.tickets.length} ใบ
          </span>
        )}
      </div>

      {/* Refund Form Area */}
      {isOpen && (
        <div
          style={{
            marginTop: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            padding: '18px',
          }}
        >
          <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px 0' }}>
            แบบฟอร์มยื่นคำขอคืนเงิน (Partial / Whole Refund)
          </h4>

          {/* Special Refund Window Policy Notice (AC-38) */}
          {eligibility?.isWithinSpecialWindow && (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#166534',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              <CheckCircleIcon />
              <div>
                <div>
                  <strong>ช่วงเวลาขอคืนเงินพิเศษ (Special Refund Window — AC-38):</strong> ท่านสามารถยื่นขอคืนเงินตามราคาหน้าบัตรได้แม้พ้นกำหนดเวลาปกติ เนื่องจากการเลื่อนรอบการแสดง
                </div>
                {eligibility.specialRefundWindowEnd && (
                  <div style={{ marginTop: '4px', fontSize: '12px' }}>
                    เปิดรับคำขอจนถึง: {formatDate(new Date(eligibility.specialRefundWindowEnd))} เวลา {formatTime(new Date(eligibility.specialRefundWindowEnd))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Normal Cutoff Policy Notice (AC-32) */}
          {eligibility && !eligibility.isWithinSpecialWindow && (
            <div
              style={{
                backgroundColor: eligibility.isWithinNormalCutoff ? '#eff6ff' : '#fef2f2',
                border: `1px solid ${eligibility.isWithinNormalCutoff ? '#bfdbfe' : '#fecaca'}`,
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: eligibility.isWithinNormalCutoff ? '#1e40af' : '#991b1b',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
              }}
            >
              {eligibility.isWithinNormalCutoff ? <InfoIcon /> : <AlertIcon />}
              <div>
                <div>
                  <strong>เงื่อนไขการคืนเงินปกติ (AC-32):</strong> ต้องยื่นคำขอล่วงหน้าไม่น้อยกว่า 168 ชั่วโมง (7 วัน) ก่อนเริ่มการแสดง
                </div>
                <div style={{ marginTop: '4px', fontSize: '12px' }}>
                  กำหนดเวลาสิ้นสุด: {formatDate(new Date(eligibility.cutoffTime))} เวลา {formatTime(new Date(eligibility.cutoffTime))}
                </div>
                {!eligibility.isWithinNormalCutoff && (
                  <div style={{ marginTop: '4px', fontWeight: 'bold' }}>
                    ขณะนี้พ้นกำหนดเวลายื่นคำขอคืนเงินตามเงื่อนไขปกติแล้ว (PAST_REFUND_CUTOFF)
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#991b1b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertIcon />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div
              style={{
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '12px 14px',
                marginBottom: '16px',
                fontSize: '13px',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <CheckCircleIcon />
              <span>{successMessage}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '20px', color: '#64748b', fontSize: '14px' }}>
              กำลังตรวจสอบข้อมูลสิทธิ์บัตร...
            </div>
          ) : (
            <form onSubmit={handleSubmitRefund}>
              {/* Ticket Selection List */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ display: 'block', fontSize: '14px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                  เลือกบัตรที่ต้องการขอคืนเงิน <span style={{ color: '#ef4444' }}>*</span>
                </div>

                {eligibility && eligibility.tickets.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {eligibility.tickets.map(ticket => {
                      const isSelected = selectedTicketIds.includes(ticket.ticketId);

                      return (
                        <label
                          key={ticket.ticketId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 14px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? '#1848ed' : '#cbd5e1'}`,
                            backgroundColor: ticket.eligible ? (isSelected ? '#eff6ff' : '#ffffff') : '#f8fafc',
                            cursor: ticket.eligible ? 'pointer' : 'not-allowed',
                            opacity: ticket.eligible ? 1 : 0.65,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input
                              type="checkbox"
                              name="refund-ticket-checkbox"
                              checked={isSelected}
                              disabled={!ticket.eligible}
                              onChange={() => handleTicketToggle(ticket.ticketId)}
                              style={{ width: '16px', height: '16px', cursor: ticket.eligible ? 'pointer' : 'not-allowed' }}
                            />
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0f172a' }}>
                                {ticket.ticketCode} — {ticket.ticketTypeName}
                              </div>
                              {ticket.reason && (
                                <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '2px' }}>
                                  {ticket.reason}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#1848ed' }}>
                            {formatBaht(ticket.ticketPrice)}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: '#64748b', fontSize: '13px' }}>ไม่พบรายการบัตร</div>
                )}
              </div>

              {/* Calculated Refund Face Value Box (AC-33) */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '14px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '13px', color: '#475569' }}>
                    จำนวนบัตรที่เลือกขอคืน ({selectedTicketIds.length} ใบ)
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#0f172a' }}>
                    {formatBaht(selectedAmount)}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '12px',
                    color: '#0369a1',
                    borderTop: '1px dashed #cbd5e1',
                    paddingTop: '6px',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>ข้อกำหนดสำคัญ (AC-33, AC-34):</strong>
                  <div>• ยอดเงินคืนคำนวณจากราคาหน้าบัตร (Face Value) เท่านั้น ไม่รวมค่าธรรมเนียมการบริการลูกค้า</div>
                  <div>• การยื่นคำขอยังไม่ยกเลิกสิทธิ์ทันที (สถานะ pending) บัตรยังสามารถสแกนเข้างานได้จนกว่าจะได้รับการอนุมัติ</div>
                </div>
              </div>

              {/* Reason Field */}
              <div style={{ marginBottom: '16px' }}>
                <label
                  htmlFor="refund-reason-input"
                  style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}
                >
                  เหตุผลการขอคืนเงิน <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <textarea
                  id="refund-reason-input"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="ระบุเหตุผลที่ต้องการขอคืนเงิน เช่น ติดภารกิจด่วน ไม่สะดวกเดินทาง ฯลฯ"
                  required
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Bank Details */}
              <div style={{ marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#334155', marginBottom: '8px' }}>
                  ข้อมูลบัญชีสำหรับรับเงินโอนคืน
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  <div>
                    <label
                      htmlFor="bank-name-input"
                      style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}
                    >
                      ชื่อธนาคาร
                    </label>
                    <input
                      id="bank-name-input"
                      type="text"
                      value={bankName}
                      onChange={e => setBankName(e.target.value)}
                      placeholder="เช่น ธนาคารกสิกรไทย"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bank-account-no-input"
                      style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}
                    >
                      เลขที่บัญชี
                    </label>
                    <input
                      id="bank-account-no-input"
                      type="text"
                      value={bankAccountNo}
                      onChange={e => setBankAccountNo(e.target.value)}
                      placeholder="เช่น 123-4-56789-0"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="bank-account-name-input"
                      style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}
                    >
                      ชื่อเจ้าของบัญชี
                    </label>
                    <input
                      id="bank-account-name-input"
                      type="text"
                      value={bankAccountName}
                      onChange={e => setBankAccountName(e.target.value)}
                      placeholder="ตรงกับชื่อในสมุดบัญชี"
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              {(() => {
                const isWindowOpen = Boolean(eligibility?.isWithinNormalCutoff || eligibility?.isWithinSpecialWindow);
                return (
                  <button
                    type="submit"
                    disabled={isSubmitting || selectedTicketIds.length === 0 || !isWindowOpen}
                    data-testid="submit-refund-request-btn"
                    style={{
                      width: '100%',
                      backgroundColor:
                        selectedTicketIds.length === 0 || !isWindowOpen
                          ? '#94a3b8'
                          : '#1848ed',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '12px 20px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor:
                        selectedTicketIds.length === 0 || !isWindowOpen
                          ? 'not-allowed'
                          : 'pointer',
                      opacity: isSubmitting ? 0.7 : 1,
                    }}
                  >
                    {isSubmitting
                      ? 'กำลังส่งคำขอคืนเงิน...'
                      : `ส่งคำขอยื่นคืนเงิน (${selectedTicketIds.length} ใบ, รวม ${formatBaht(selectedAmount)})`}
                  </button>
                );
              })()}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
