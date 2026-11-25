'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
  timestamp?: string;
  formattedDate?: string;
  timeAgo: string;
  isRead: boolean;
  isSaved?: boolean;
  referenceId?: string;
}

const categoryLabels: Record<AdminNotification['category'], string> = {
  finance: 'การเงิน',
  concert: 'คอนเสิร์ต',
  staff: 'ทีมงาน',
  system: 'ระบบ',
};

export function AdminNotificationsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'saved'>('all');
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [activeModalNotif, setActiveModalNotif] = useState<AdminNotification | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (tab: 'all' | 'unread' | 'saved') => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/back-office/notifications?tab=${tab}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(Number(data.unreadCount || 0));
        setSavedCount(Number(data.savedCount || 0));
        setTotalCount(Number(data.totalCount || 0));
      }
    } catch {
      // Keep existing state on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch for count
  useEffect(() => {
    fetchNotifications(activeTab);
  }, [fetchNotifications, activeTab]);

  // Re-fetch when opening dropdown
  useEffect(() => {
    if (isOpen) {
      fetchNotifications(activeTab);
    }
  }, [isOpen, activeTab, fetchNotifications]);

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

  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/back-office/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-all-read' }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {
      // ignore
    }
  };

  const handleToggleRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    if (!target) return;
    const nextRead = !target.isRead;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: nextRead } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev + (nextRead ? -1 : 1)));
    if (activeModalNotif && activeModalNotif.id === id) {
      setActiveModalNotif((prev) => (prev ? { ...prev, isRead: nextRead } : null));
    }

    try {
      await fetch('/api/back-office/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-read', id, isRead: nextRead }),
      });
    } catch {
      // Revert if failed
      fetchNotifications(activeTab);
    }
  };

  const handleToggleSave = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    if (!target) return;
    const nextSaved = !target.isSaved;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isSaved: nextSaved } : n)),
    );
    setSavedCount((prev) => Math.max(0, prev + (nextSaved ? 1 : -1)));
    if (activeModalNotif && activeModalNotif.id === id) {
      setActiveModalNotif((prev) => (prev ? { ...prev, isSaved: nextSaved } : null));
    }

    try {
      await fetch('/api/back-office/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle-save', id, isSaved: nextSaved }),
      });
    } catch {
      fetchNotifications(activeTab);
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const target = notifications.find((n) => n.id === id);
    if (!target) return;

    // Optimistic delete
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    if (!target.isRead) {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    if (target.isSaved) {
      setSavedCount((prev) => Math.max(0, prev - 1));
    }
    setTotalCount((prev) => Math.max(0, prev - 1));

    if (activeModalNotif && activeModalNotif.id === id) {
      setActiveModalNotif(null);
    }

    try {
      await fetch(`/api/back-office/notifications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
    } catch {
      fetchNotifications(activeTab);
    }
  };

  const handleOpenDetail = (notif: AdminNotification) => {
    // Automatically mark as read when opening full detail
    if (!notif.isRead) {
      handleToggleRead(notif.id);
    }
    setActiveModalNotif({ ...notif, isRead: true });
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

            {/* Filter Tabs (D-203: All, Unread, Saved) */}
            <div className="notifications-filter-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'all'}
                className={`notifications-tab-btn ${activeTab === 'all' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                ทั้งหมด ({totalCount})
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
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'saved'}
                className={`notifications-tab-btn ${activeTab === 'saved' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('saved')}
                title="รายการที่บันทึกไว้ (เก็บไว้)"
              >
                ที่บันทึกไว้ ({savedCount})
              </button>
            </div>
          </div>

          {/* Notifications Card List */}
          <div className="notifications-dropdown-list">
            {isLoading && notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                กำลังโหลดการแจ้งเตือน...
              </div>
            ) : notifications.length === 0 ? (
              <div className="notifications-empty-state">
                <div className="notifications-empty-icon">
                  <BellIcon width={32} height={32} />
                </div>
                <p className="notifications-empty-title">ไม่มีการแจ้งเตือนในขณะนี้</p>
                <p className="notifications-empty-subtitle">
                  {activeTab === 'unread'
                    ? 'คุณได้อ่านการแจ้งเตือนครบทุกรายการแล้ว'
                    : activeTab === 'saved'
                      ? 'ยังไม่มีรายการแจ้งเตือนที่บันทึกไว้'
                      : 'เมื่อมีข้อมูลใหม่ ระบบจะแจ้งเตือนให้ทราบที่นี่'}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
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
                      {!notif.isRead && <span className="notification-unread-dot" title="ยังไม่อ่าน" />}
                      {notif.isSaved && (
                        <span className="notification-saved-indicator" title="บันทึกไว้ในรายการ">
                          <BookmarkIcon width={12} height={12} />
                        </span>
                      )}
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
                      {!notif.isRead && (
                        <button
                          type="button"
                          className="notification-action-btn action-mark-read"
                          onClick={(e) => handleToggleRead(notif.id, e)}
                          title="ทำเครื่องหมายว่าอ่านแล้ว"
                          aria-label="ทำเครื่องหมายว่าอ่านแล้ว"
                        >
                          <CheckIcon width={14} height={14} />
                          <span>อ่านแล้ว</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={`notification-action-btn ${notif.isSaved ? 'is-saved' : ''}`}
                        onClick={(e) => handleToggleSave(notif.id, e)}
                        title={notif.isSaved ? 'ยกเลิกการบันทึก (เก็บไว้)' : 'บันทึกไว้ดูภายหลัง (เก็บไว้)'}
                        aria-label={notif.isSaved ? 'ยกเลิกการบันทึก' : 'บันทึกไว้ดูภายหลัง'}
                      >
                        <BookmarkIcon width={14} height={14} />
                        <span>{notif.isSaved ? 'บันทึกแล้ว' : 'เก็บไว้'}</span>
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
                แสดง {notifications.length} จาก {totalCount} รายการ
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
                  {activeModalNotif.timeAgo} ({activeModalNotif.formattedDate || activeModalNotif.timestamp || ''})
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

            {/* Modal Footer Actions (D-203: Real Bookmark & Read Toggle) */}
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
                  className={`notification-modal-btn btn-keep btn-save ${activeModalNotif.isSaved ? 'is-saved' : ''}`}
                  onClick={() => handleToggleSave(activeModalNotif.id)}
                  title={activeModalNotif.isSaved ? 'ยกเลิกการบันทึก' : 'บันทึกไว้ในรายการ (เก็บไว้)'}
                >
                  <BookmarkIcon width={15} height={15} />
                  <span>
                    {activeModalNotif.isSaved
                      ? 'บันทึกแล้ว (เก็บไว้ในรายการ)'
                      : 'บันทึกไว้ (เก็บไว้ในรายการ)'}
                  </span>
                </button>

                <button
                  type="button"
                  className="notification-modal-btn btn-toggle-read"
                  onClick={() => handleToggleRead(activeModalNotif.id)}
                  title={activeModalNotif.isRead ? 'ทำเครื่องหมายว่ายังไม่อ่าน' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                >
                  <CheckIcon width={15} height={15} />
                  <span>
                    {activeModalNotif.isRead ? 'ทำเครื่องหมายว่ายังไม่อ่าน' : 'ทำเครื่องหมายว่าอ่านแล้ว'}
                  </span>
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
