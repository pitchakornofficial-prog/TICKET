'use client';

import { useState, useRef, useEffect } from 'react';
import {
  BellIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  BookmarkIcon,
  BanknotesIcon,
  CalendarIcon,
  UsersIcon,
  InfoIcon,
} from './icons';

export interface AdminNotification {
  id: string;
  title: string;
  summary: string;
  content: string;
  category: 'finance' | 'concert' | 'staff' | 'system';
  timestamp: string;
  timeAgo: string;
  isRead: boolean;
  referenceId?: string;
}

const INITIAL_NOTIFICATIONS: AdminNotification[] = [
  {
    id: 'notif-ubu-freshy-session-approved',
    title: 'อนุมัติเปิดจำหน่ายคอนเสิร์ต UBU Freshy Music Fest 2026 เรียบร้อยแล้ว',
    summary: 'เจ้าของระบบอนุมัติรอบการแสดง UBU Freshy Music Fest 2026 พร้อมเปิดจำหน่ายบัตร',
    content:
      'คำขอเปิดจำหน่ายคอนเสิร์ต UBU Freshy Music Fest 2026 รอบการแสดงที่ 1 ได้รับการตรวจสอบและอนุมัติจากผู้ดูแลระบบเรียบร้อยแล้ว สถานะปัจจุบัน: เปิดจำหน่ายบัตรตามกำหนดการ',
    category: 'concert',
    timestamp: '2026-11-04 10:00 น.',
    timeAgo: 'เมื่อวานนี้',
    isRead: false,
    referenceId: 'event-ubu-freshy-2026',
  },
];

const categoryLabels: Record<AdminNotification['category'], string> = {
  finance: 'การเงิน',
  concert: 'คอนเสิร์ต',
  staff: 'ทีมงาน',
  system: 'ระบบ',
};

export function AdminNotificationsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<AdminNotification[]>(INITIAL_NOTIFICATIONS);
  const [activeModalNotif, setActiveModalNotif] = useState<AdminNotification | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return !n.isRead;
    return true;
  });

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle escape key to close dropdown or modal
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (activeModalNotif) {
          setActiveModalNotif(null);
        } else if (isOpen) {
          setIsOpen(false);
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, activeModalNotif]);

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleToggleRead = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: !n.isRead } : n)),
    );
    if (activeModalNotif && activeModalNotif.id === id) {
      setActiveModalNotif((prev) => (prev ? { ...prev, isRead: !prev.isRead } : null));
    }
  };

  const handleDelete = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (activeModalNotif && activeModalNotif.id === id) {
      setActiveModalNotif(null);
    }
  };

  const handleOpenDetail = (notif: AdminNotification) => {
    // Automatically mark as read when opening full detail
    if (!notif.isRead) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)),
      );
      setActiveModalNotif({ ...notif, isRead: true });
    } else {
      setActiveModalNotif(notif);
    }
  };

  const getCategoryIcon = (category: AdminNotification['category']) => {
    switch (category) {
      case 'finance':
        return <BanknotesIcon width={16} height={16} />;
      case 'concert':
        return <CalendarIcon width={16} height={16} />;
      case 'staff':
        return <UsersIcon width={16} height={16} />;
      default:
        return <InfoIcon width={16} height={16} />;
    }
  };

  return (
    <div className="admin-notifications-wrap" ref={menuRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        className={`admin-notifications-bell-btn ${isOpen ? 'is-active' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={
          unreadCount > 0
            ? `การแจ้งเตือน (ยังไม่อ่าน ${unreadCount} รายการ)`
            : 'การแจ้งเตือน'
        }
        aria-expanded={isOpen}
        title="การแจ้งเตือน"
      >
        <BellIcon width={19} height={19} />
        {unreadCount > 0 && (
          <span
            className="bell-unread-dot"
            aria-hidden="true"
            title={`มีการแจ้งเตือนใหม่ ${unreadCount} รายการ`}
          />
        )}
      </button>

      {/* Dropdown Popup */}
      {isOpen && (
        <div
          className="admin-notifications-dropdown"
          role="dialog"
          aria-label="รายการการแจ้งเตือน"
        >
          {/* Dropdown Header */}
          <div className="notifications-dropdown-header">
            <div className="notifications-header-title-row">
              <div className="notifications-header-title-wrap">
                <span className="notifications-header-title">การแจ้งเตือน</span>
                {unreadCount > 0 && (
                  <span className="notifications-unread-pill">
                    ยังไม่อ่าน {unreadCount}
                  </span>
                )}
              </div>
              <div className="notifications-header-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="notifications-mark-all-btn"
                    onClick={handleMarkAllAsRead}
                  >
                    อ่านทั้งหมด
                  </button>
                )}
                <button
                  type="button"
                  className="notifications-close-icon-btn"
                  onClick={() => setIsOpen(false)}
                  aria-label="ปิดเมนูการแจ้งเตือน"
                  title="ปิด"
                >
                  <XMarkIcon width={16} height={16} />
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="notifications-filter-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                className={`notifications-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                ทั้งหมด ({notifications.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'unread'}
                className={`notifications-tab-btn ${activeTab === 'unread' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('unread')}
              >
                ยังไม่อ่าน ({unreadCount})
              </button>
            </div>
          </div>

          {/* Notifications Card List */}
          <div className="notifications-dropdown-list">
            {filteredNotifications.length === 0 ? (
              <div className="notifications-empty-state">
                <div className="notifications-empty-icon">
                  <BellIcon width={32} height={32} />
                </div>
                <p className="notifications-empty-title">ไม่มีการแจ้งเตือนในขณะนี้</p>
                <p className="notifications-empty-subtitle">
                  {activeTab === 'unread'
                    ? 'คุณได้อ่านการแจ้งเตือนครบทุกรายการแล้ว'
                    : 'เมื่อมีข้อมูลใหม่ ระบบจะแจ้งเตือนให้ทราบที่นี่'}
                </p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <article
                  key={notif.id}
                  className={`notification-summary-card ${!notif.isRead ? 'is-unread' : 'is-read'}`}
                >
                  <div className="notification-card-header">
                    <div className="notification-category-wrap">
                      <span className={`notification-category-badge category-${notif.category}`}>
                        {getCategoryIcon(notif.category)}
                        <span>{categoryLabels[notif.category]}</span>
                      </span>
                      {!notif.isRead && <span className="notification-unread-dot" />}
                    </div>
                    <span className="notification-timestamp">{notif.timeAgo}</span>
                  </div>

                  <button
                    type="button"
                    className="notification-card-content-btn"
                    onClick={() => handleOpenDetail(notif)}
                    aria-label={`เปิดอ่าน ${notif.title}`}
                  >
                    <h3 className="notification-card-title">{notif.title}</h3>
                    <p className="notification-card-summary">{notif.summary}</p>
                  </button>

                  {/* Actions Toolbar */}
                  <div className="notification-card-footer">
                    <button
                      type="button"
                      className="notification-view-full-btn"
                      onClick={() => handleOpenDetail(notif)}
                    >
                      อ่านฉบับเต็ม
                    </button>
                    <div className="notification-card-actions">
                      <button
                        type="button"
                        className={`notification-action-btn ${notif.isRead ? 'is-saved' : ''}`}
                        onClick={(e) => handleToggleRead(notif.id, e)}
                        title={notif.isRead ? 'ทำเครื่องหมายว่ายังไม่อ่าน' : 'เก็บไว้ / อ่านแล้ว'}
                        aria-label={notif.isRead ? 'ทำเครื่องหมายว่ายังไม่อ่าน' : 'เก็บไว้ / อ่านแล้ว'}
                      >
                        {notif.isRead ? (
                          <BookmarkIcon width={14} height={14} />
                        ) : (
                          <CheckIcon width={14} height={14} />
                        )}
                        <span>{notif.isRead ? 'เก็บไว้' : 'อ่านแล้ว'}</span>
                      </button>
                      <button
                        type="button"
                        className="notification-action-btn action-delete"
                        onClick={(e) => handleDelete(notif.id, e)}
                        title="ลบการแจ้งเตือนนี้"
                        aria-label="ลบการแจ้งเตือน"
                      >
                        <TrashIcon width={14} height={14} />
                        <span>ลบ</span>
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Dropdown Footer */}
          {notifications.length > 0 && (
            <div className="notifications-dropdown-footer">
              <span className="notifications-footer-count">
                แสดง {filteredNotifications.length} จาก {notifications.length} รายการ
              </span>
            </div>
          )}
        </div>
      )}

      {/* Full Detail Modal */}
      {activeModalNotif && (
        <div
          className="notification-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-notif-title"
        >
          <button
            type="button"
            className="notification-modal-backdrop-btn"
            onClick={() => setActiveModalNotif(null)}
            aria-label="ปิดหน้าต่าง"
            tabIndex={-1}
          />
          <div className="notification-modal-card">
            {/* Modal Header */}
            <div className="notification-modal-header">
              <div className="notification-modal-meta">
                <span
                  className={`notification-category-badge category-${activeModalNotif.category}`}
                >
                  {getCategoryIcon(activeModalNotif.category)}
                  <span>{categoryLabels[activeModalNotif.category]}</span>
                </span>
                {activeModalNotif.referenceId && (
                  <span className="notification-modal-ref">
                    อ้างอิง: {activeModalNotif.referenceId}
                  </span>
                )}
                <span className="notification-modal-time">
                  {activeModalNotif.timeAgo} ({activeModalNotif.timestamp} น.)
                </span>
              </div>
              <button
                type="button"
                className="notification-modal-close-btn"
                onClick={() => setActiveModalNotif(null)}
                aria-label="ปิดหน้าต่าง"
                title="ปิด"
              >
                <XMarkIcon width={18} height={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="notification-modal-body">
              <h2 id="modal-notif-title" className="notification-modal-title">
                {activeModalNotif.title}
              </h2>
              <div className="notification-modal-content-box">
                <p className="notification-modal-content-text">
                  {activeModalNotif.content}
                </p>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="notification-modal-footer">
              <button
                type="button"
                className="notification-modal-btn btn-delete"
                onClick={() => handleDelete(activeModalNotif.id)}
              >
                <TrashIcon width={15} height={15} />
                <span>ลบการแจ้งเตือน</span>
              </button>

              <div className="notification-modal-footer-right">
                <button
                  type="button"
                  className="notification-modal-btn btn-keep"
                  onClick={() => handleToggleRead(activeModalNotif.id)}
                >
                  {activeModalNotif.isRead ? (
                    <>
                      <BookmarkIcon width={15} height={15} />
                      <span>เก็บไว้ในรายการ</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon width={15} height={15} />
                      <span>ทำเครื่องหมายว่าอ่านแล้ว</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="notification-modal-btn btn-close"
                  onClick={() => setActiveModalNotif(null)}
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
