'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatTime } from '@/lib/locale';
import type {
  InboundEmailCounts,
  InboundEmailRecord,
  InboundEmailReplyRecord,
  InboundEmailStatus,
} from '@/server/inbound-email';
import {
  AlertTriangleIcon,
  MailIcon,
  PaperAirplaneIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from './icons';
import { triggerToast, triggerRefreshToast } from './toast-notification';

type MailboxStatusTab = 'all' | InboundEmailStatus;

const STATUS_LABELS: Record<InboundEmailStatus, string> = {
  unread: 'ยังไม่อ่าน',
  read: 'อ่านแล้ว',
  replied: 'ตอบกลับแล้ว',
  archived: 'จัดเก็บแล้ว',
};

const RECIPIENT_OPTIONS = [
  { value: 'all', label: 'ปลายทางทั้งหมด' },
  { value: 'support@phatysd.me', label: 'support@phatysd.me (ลูกค้า)' },
  { value: 'organizer@phatysd.me', label: 'organizer@phatysd.me (ผู้จัดงาน)' },
  { value: 'organizer-support@phatysd.me', label: 'organizer-support@phatysd.me (ประสานงาน)' },
];

function displayDateTime(value?: string | null): string {
  if (!value) return 'ไม่มีข้อมูล';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ไม่มีข้อมูล';
  return `${formatDate(date)} ${formatTime(date)}`;
}

function getStatusPillClass(status: InboundEmailStatus): string {
  switch (status) {
    case 'unread':
      return 'row-detail-pill warning-pill';
    case 'replied':
      return 'row-detail-pill success-pill';
    case 'archived':
      return 'row-detail-pill neutral-pill';
    default:
      return 'row-detail-pill';
  }
}

export function OwnerInboundMailbox() {
  const [activeTab, setActiveTab] = useState<MailboxStatusTab>('all');
  const [recipientFilter, setRecipientFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [emails, setEmails] = useState<InboundEmailRecord[]>([]);
  const [counts, setCounts] = useState<InboundEmailCounts>({
    all: 0,
    unread: 0,
    read: 0,
    replied: 0,
    archived: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Detail & Reply modal states
  const [selectedEmail, setSelectedEmail] = useState<InboundEmailRecord | null>(null);
  const [replies, setReplies] = useState<InboundEmailReplyRecord[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [bodyViewMode, setBodyViewMode] = useState<'text' | 'html'>('text');

  // Reply composer
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  const fetchEmails = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeTab !== 'all') params.set('status', activeTab);
      if (recipientFilter !== 'all') params.set('recipient', recipientFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const qs = params.toString();
      const res = await fetch(`/api/owner/inbound-emails${qs ? `?${qs}` : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'ไม่สามารถโหลดกล่องจดหมายขาเข้าได้');
      }
      const data = await res.json();
      setEmails(data.emails || []);
      if (data.counts) setCounts(data.counts);
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการโหลดกล่องจดหมายขาเข้า',
      });
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, recipientFilter, searchQuery]);

  useEffect(() => {
    void fetchEmails();
  }, [fetchEmails]);

  const handleOpenEmail = async (item: InboundEmailRecord) => {
    setSelectedEmail(item);
    setReplies([]);
    setBodyViewMode(item.textBody ? 'text' : item.htmlBody ? 'html' : 'text');
    setReplySubject(
      item.subject.toLowerCase().startsWith('re:')
        ? item.subject
        : `Re: ${item.subject || 'ติดต่อทีมงาน TICKET'}`,
    );
    setReplyBody('');
    setIsLoadingDetail(true);

    try {
      const res = await fetch(`/api/owner/inbound-emails/${item.id}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.email) setSelectedEmail(data.email);
        if (Array.isArray(data.replies)) setReplies(data.replies);
      }

      if (item.status === 'unread') {
        const patchRes = await fetch(`/api/owner/inbound-emails/${item.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'read' }),
        });
        if (patchRes.ok) {
          const patchData = await patchRes.json();
          if (patchData.email) setSelectedEmail(patchData.email);
          void fetchEmails();
        }
      }
    } catch {
      triggerToast({ type: 'error', message: 'โหลดรายละเอียดอีเมลไม่สำเร็จ' });
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedEmail(null);
    setReplies([]);
    setReplySubject('');
    setReplyBody('');
  };

  const handleUpdateStatus = async (id: string, nextStatus: InboundEmailStatus) => {
    try {
      const res = await fetch(`/api/owner/inbound-emails/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'อัปเดตสถานะไม่สำเร็จ');
      }
      if (selectedEmail?.id === id && data.email) {
        setSelectedEmail(data.email);
      }
      triggerToast({ type: 'success', message: `เปลี่ยนสถานะเป็น "${STATUS_LABELS[nextStatus]}" แล้ว` });
      void fetchEmails();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'อัปเดตสถานะไม่สำเร็จ',
      });
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail) return;
    if (!replyBody.trim()) {
      triggerToast({ type: 'error', message: 'กรุณาระบุข้อความตอบกลับ' });
      return;
    }

    setIsSendingReply(true);
    try {
      const res = await fetch(`/api/owner/inbound-emails/${selectedEmail.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: replySubject.trim(),
          bodyText: replyBody.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || 'ส่งอีเมลตอบกลับไม่สำเร็จ');
      }

      if (data.reply) {
        setReplies((prev) => [...prev, data.reply]);
      }
      if (data.email) {
        setSelectedEmail(data.email);
      }
      setReplyBody('');
      triggerToast({
        type: 'success',
        message: `ส่งอีเมลตอบกลับไปยัง ${selectedEmail.replyToAddress || selectedEmail.fromAddress} สำเร็จ`,
      });
      void fetchEmails();
    } catch (err: unknown) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งอีเมลตอบกลับ',
      });
    } finally {
      setIsSendingReply(false);
    }
  };

  const visibleEmails = useMemo(() => emails, [emails]);

  return (
    <div
      className="owner-inbound-mailbox-hub"
      id="owner-inbound-mailbox"
      data-testid="owner-inbound-mailbox"
    >
      {/* Balanced Toolbar: Status Tabs (Left) + Search, Recipient Filter & Refresh (Right) */}
      <div className="hub-toolbar-row">
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="ตัวกรองสถานะอีเมลขาเข้า">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`hub-filter-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
            data-testid="inbox-tab-all"
          >
            <MailIcon className="tab-icon" />
            <span>ทั้งหมด</span>
            <span className="hub-tab-count-badge">{counts.all}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unread'}
            className={`hub-filter-tab ${activeTab === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveTab('unread')}
            data-testid="inbox-tab-unread"
          >
            <span>ยังไม่อ่าน</span>
            <span className={`hub-tab-count-badge ${counts.unread > 0 ? 'badge-alert' : ''}`}>
              {counts.unread}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'read'}
            className={`hub-filter-tab ${activeTab === 'read' ? 'active' : ''}`}
            onClick={() => setActiveTab('read')}
            data-testid="inbox-tab-read"
          >
            <span>อ่านแล้ว</span>
            <span className="hub-tab-count-badge">{counts.read}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'replied'}
            className={`hub-filter-tab ${activeTab === 'replied' ? 'active' : ''}`}
            onClick={() => setActiveTab('replied')}
            data-testid="inbox-tab-replied"
          >
            <span>ตอบกลับแล้ว</span>
            <span className="hub-tab-count-badge">{counts.replied}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'archived'}
            className={`hub-filter-tab ${activeTab === 'archived' ? 'active' : ''}`}
            onClick={() => setActiveTab('archived')}
            data-testid="inbox-tab-archived"
          >
            <span>จัดเก็บ</span>
            <span className="hub-tab-count-badge">{counts.archived}</span>
          </button>
        </div>

        <div className="hub-toolbar-tools-right">
          <div className="hub-search-box">
            <SearchIcon className="hub-search-icon" />
            <input
              type="text"
              placeholder="ค้นหาผู้ส่ง, หัวข้อ, ข้อความ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="hub-search-input"
              data-testid="inbox-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="hub-search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="ล้างคำค้นหา"
              >
                <XIcon />
              </button>
            )}
          </div>

          <select
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            className="hub-sort-select"
            aria-label="กรองตามอีเมลปลายทาง"
            data-testid="inbox-filter-recipient"
          >
            {RECIPIENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="hub-refresh-btn"
            onClick={async () => {
              await fetchEmails();
              triggerRefreshToast('กล่องจดหมาย');
            }}
            disabled={isLoading}
            aria-label="รีเฟรชกล่องจดหมาย"
            title="รีเฟรชกล่องจดหมาย"
            data-testid="inbox-refresh-btn"
          >
            <RefreshIcon className={`hub-refresh-icon ${isLoading ? 'spinning' : ''}`} />
          </button>
        </div>
      </div>

      {/* Inbound Email List */}
      {visibleEmails.length === 0 ? (
        <div className="hub-empty-state-card" data-testid="inbox-empty-state">
          <MailIcon className="empty-state-icon" />
          <p className="empty-title">ยังไม่มีอีเมลขาเข้าในหมวดหมู่นี้</p>
          <p className="empty-desc">
            ข้อความที่ส่งมายัง support@phatysd.me, organizer@phatysd.me หรือ organizer-support@phatysd.me ผ่าน Amazon SES จะปรากฏที่นี่
          </p>
        </div>
      ) : (
        <div className="customer-cards-stack">
          {visibleEmails.map((item) => {
            const hasSecurityWarning =
              (item.spamVerdict && item.spamVerdict !== 'PASS') ||
              (item.virusVerdict && item.virusVerdict !== 'PASS');
            return (
              <article
                key={item.id}
                className="concert-horizontal-row-card"
                data-testid={`inbound-email-card-${item.id}`}
              >
                <div className="row-card-center">
                  <div className="row-card-badge-row">
                    <span className={getStatusPillClass(item.status)}>
                      {STATUS_LABELS[item.status]}
                    </span>
                    <span className="row-detail-pill">ถึง: {item.toAddress}</span>
                    {item.attachmentsMeta.length > 0 && (
                      <span className="row-detail-pill">
                        ไฟล์แนบ {item.attachmentsMeta.length} ไฟล์
                      </span>
                    )}
                    {hasSecurityWarning && (
                      <span className="row-detail-pill danger-pill">
                        <AlertTriangleIcon width={14} height={14} /> ตรวจสอบสแปม/ไวรัส
                      </span>
                    )}
                    <span className="row-meta-dot" aria-hidden="true">·</span>
                    <span className="row-meta-item">{displayDateTime(item.receivedAt)}</span>
                  </div>

                  <div className="row-title-line">
                    <h3 className="row-event-title">
                      {item.subject || '(ไม่มีหัวข้อ)'}
                    </h3>
                  </div>

                  <div className="row-description-line">
                    จาก: {item.fromName ? `${item.fromName} (${item.fromAddress})` : item.fromAddress}
                    {item.textBody ? ` — ${item.textBody.slice(0, 140)}` : ''}
                  </div>
                </div>

                <div className="row-card-right">
                  <button
                    type="button"
                    className="primary-button row-action-btn"
                    onClick={() => void handleOpenEmail(item)}
                    data-testid={`open-inbound-email-${item.id}`}
                  >
                    <span>เปิดอ่าน / ตอบกลับ</span>
                  </button>
                  {item.status !== 'archived' ? (
                    <button
                      type="button"
                      className="secondary-button row-action-btn"
                      onClick={() => void handleUpdateStatus(item.id, 'archived')}
                      data-testid={`archive-inbound-email-${item.id}`}
                    >
                      <span>จัดเก็บ</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button row-action-btn"
                      onClick={() => void handleUpdateStatus(item.id, 'read')}
                      data-testid={`unarchive-inbound-email-${item.id}`}
                    >
                      <span>ย้ายกลับกล่องเข้า</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Detail & Reply Modal */}
      {selectedEmail && (
        <div
          className="review-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inbound-email-modal-title"
          data-testid="inbound-email-detail-modal"
        >
          <div className="admin-full-dialog-modal">
            <div className="dialog-modal-header">
              <div className="modal-header-titles">
                <span className="modal-category-tag">
                  กล่องจดหมายขาเข้า · {selectedEmail.toAddress}
                </span>
                <h3 id="inbound-email-modal-title" className="modal-concert-title">
                  {selectedEmail.subject || '(ไม่มีหัวข้อ)'}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close-icon-btn"
                onClick={handleCloseModal}
                aria-label="ปิดหน้าต่างอีเมล"
              >
                <XIcon />
              </button>
            </div>

            <div className="dialog-modal-body">
              <div className="modal-summary-card">
                <div className="summary-field">
                  <span className="summary-label">จาก:</span>
                  <strong className="summary-val">
                    {selectedEmail.fromName
                      ? `${selectedEmail.fromName} <${selectedEmail.fromAddress}>`
                      : selectedEmail.fromAddress}
                  </strong>
                </div>
                <div className="summary-field">
                  <span className="summary-label">ถึง:</span>
                  <strong className="summary-val">{selectedEmail.toAddress}</strong>
                </div>
                {selectedEmail.replyToAddress && (
                  <div className="summary-field">
                    <span className="summary-label">Reply-To:</span>
                    <strong className="summary-val">{selectedEmail.replyToAddress}</strong>
                  </div>
                )}
                <div className="summary-field">
                  <span className="summary-label">รับเมื่อ:</span>
                  <span className="summary-val">{displayDateTime(selectedEmail.receivedAt)}</span>
                </div>
                <div className="summary-field">
                  <span className="summary-label">สถานะ:</span>
                  <span className={getStatusPillClass(selectedEmail.status)}>
                    {STATUS_LABELS[selectedEmail.status]}
                  </span>
                </div>
              </div>

              {/* Status quick actions */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {selectedEmail.status !== 'unread' && (
                  <button
                    type="button"
                    className="secondary-button modal-footer-btn"
                    onClick={() => void handleUpdateStatus(selectedEmail.id, 'unread')}
                  >
                    ทำเครื่องหมายว่ายังไม่อ่าน
                  </button>
                )}
                {selectedEmail.status !== 'archived' && (
                  <button
                    type="button"
                    className="secondary-button modal-footer-btn"
                    onClick={() => void handleUpdateStatus(selectedEmail.id, 'archived')}
                  >
                    จัดเก็บข้อความ
                  </button>
                )}
                {selectedEmail.htmlBody && (
                  <button
                    type="button"
                    className="secondary-button modal-footer-btn"
                    onClick={() => setBodyViewMode((m) => (m === 'text' ? 'html' : 'text'))}
                  >
                    {bodyViewMode === 'text' ? 'ดูรูปแบบ HTML' : 'ดูรูปแบบข้อความธรรมดา'}
                  </button>
                )}
              </div>

              {/* Message Body */}
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '1rem',
                  background: '#f8fafc',
                  marginBottom: '1rem',
                }}
              >
                {bodyViewMode === 'html' && selectedEmail.htmlBody ? (
                  <iframe
                    title="เนื้อหาอีเมล HTML"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    srcDoc={selectedEmail.htmlBody}
                    style={{
                      width: '100%',
                      minHeight: '260px',
                      border: 'none',
                      background: '#ffffff',
                      borderRadius: '6px',
                    }}
                  />
                ) : (
                  <pre
                    style={{
                      margin: 0,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontFamily: 'inherit',
                      fontSize: '0.925rem',
                      lineHeight: 1.6,
                      color: '#0f172a',
                    }}
                  >
                    {selectedEmail.textBody || '(ไม่มีเนื้อหาข้อความธรรมดา)'}
                  </pre>
                )}
              </div>

              {/* Attachments metadata */}
              {selectedEmail.attachmentsMeta.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: 400, marginBottom: '0.5rem' }}>
                    ไฟล์แนบ ({selectedEmail.attachmentsMeta.length} รายการ)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#475569' }}>
                    {selectedEmail.attachmentsMeta.map((att) => (
                      <li key={`${att.filename}-${att.contentType}-${att.size}`}>
                        {att.filename} ({att.contentType}, {Math.max(1, Math.round(att.size / 1024))} KB)
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reply History */}
              {isLoadingDetail ? (
                <p style={{ fontSize: '0.85rem', color: '#64748b' }}>กำลังโหลดประวัติการตอบกลับ...</p>
              ) : (
                replies.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 400, marginBottom: '0.5rem' }}>
                      ประวัติการตอบกลับ ({replies.length})
                    </h4>
                    <div className="contact-audit-log-container">
                      {replies.map((rep) => (
                        <div key={rep.id} className="timeline-item-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.35rem', fontSize: '0.8rem', color: '#64748b' }}>
                            <span>
                              ตอบโดย {rep.sentByEmail || rep.fromAddress} → {rep.toAddress}
                            </span>
                            <span>{displayDateTime(rep.sentAt)}</span>
                          </div>
                          <div style={{ fontWeight: 400, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                            {rep.subject}
                          </div>
                          <p style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.875rem', color: '#1e293b' }}>
                            {rep.bodyText}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}

              {/* Reply Form */}
              <form onSubmit={(e) => void handleSendReply(e)} data-testid="inbound-email-reply-form">
                <h4 style={{ fontSize: '0.95rem', fontWeight: 400, marginBottom: '0.65rem' }}>
                  ตอบกลับอีเมลผ่าน Amazon SES
                </h4>
                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label htmlFor="inbound-reply-subject">หัวข้ออีเมลตอบกลับ</label>
                  <input
                    id="inbound-reply-subject"
                    type="text"
                    className="modal-text-input"
                    value={replySubject}
                    onChange={(e) => setReplySubject(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '0.9rem' }}>
                  <label htmlFor="inbound-reply-body">
                    ข้อความตอบกลับถึง {selectedEmail.replyToAddress || selectedEmail.fromAddress}
                  </label>
                  <textarea
                    id="inbound-reply-body"
                    rows={5}
                    className="text-input"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '0.65rem 0.75rem' }}
                    placeholder="พิมพ์ข้อความตอบกลับ..."
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    data-testid="inbound-reply-body-input"
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
                  <button
                    type="button"
                    className="secondary-button modal-footer-btn"
                    onClick={handleCloseModal}
                  >
                    ปิด
                  </button>
                  <button
                    type="submit"
                    className="primary-button modal-footer-btn"
                    disabled={isSendingReply}
                    data-testid="send-inbound-reply-btn"
                  >
                    <PaperAirplaneIcon width={16} height={16} />
                    <span>{isSendingReply ? 'กำลังส่ง...' : 'ส่งอีเมลตอบกลับ'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
