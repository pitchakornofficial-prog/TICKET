'use client';

import { useState, useEffect, useCallback } from 'react';
import { TicketIcon } from './ticket-icon';
import { CheckCircleIcon, CalendarIcon } from './icons';
import { formatDate } from '@/lib/locale';

interface NewsItem {
  id: string;
  title: string;
  content: string;
  status: 'draft' | 'published';
  coverUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  authorName: string;
}

export function OwnerNewsManager() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadNews = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/news');
      if (res.ok) {
        const data = await res.json();
        setNews(data.news || []);
      }
    } catch {
      setError('ไม่สามารถโหลดข้อมูลข่าวสารได้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!title.trim() || !content.trim()) {
      setError('กรุณากรอกหัวข้อและเนื้อหาข่าวให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'บันทึกข่าวไม่สำเร็จ');
      } else {
        setMessage(status === 'published' ? 'เผยแพร่ข่าวสารเรียบร้อยแล้ว' : 'บันทึกฉบับร่างเรียบร้อยแล้ว');
        setTitle('');
        setContent('');
        loadNews();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePublish(id: string) {
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/owner/news/${id}/publish`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'เผยแพร่ข่าวไม่สำเร็จ');
      } else {
        setMessage('เผยแพร่ข่าวสารเรียบร้อยแล้ว');
        loadNews();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('ยืนยันที่จะลบข่าวสารนี้หรือไม่?')) return;
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/owner/news/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'ลบข่าวไม่สำเร็จ');
      } else {
        setMessage('ลบข่าวสารเรียบร้อยแล้ว');
        loadNews();
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการลบ');
    }
  }

  return (
    <section className="form-card owner-news-card" aria-labelledby="owner-news-heading">
      <h2 id="owner-news-heading">จัดการข่าวสารและประกาศ</h2>
      <p className="card-caption">
        สร้างข่าวสารใหม่ เผยแพร่ให้ลูกค้าอ่าน หรือบันทึกฉบับร่างเพื่อเตรียมการล่วงหน้า
      </p>

      {message && (
        <div className="status-banner success" role="status">
          <CheckCircleIcon />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="status-banner error" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Create news form */}
      <form onSubmit={handleCreate} className="owner-news-form">
        <div className="form-group">
          <label htmlFor="news-title">หัวข้อข่าว</label>
          <input
            id="news-title"
            name="title"
            type="text"
            className="text-input"
            placeholder="เช่น แจ้งกำหนดการเปิดจำหน่ายบัตรคอนเสิร์ต..."
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            disabled={submitting}
          />
        </div>

        <div className="form-group">
          <label htmlFor="news-content">เนื้อหาข่าว</label>
          <textarea
            id="news-content"
            name="content"
            rows={5}
            className="text-input"
            placeholder="รายละเอียดข่าวสารและประกาศ..."
            value={content}
            onChange={e => setContent(e.target.value)}
            required
            disabled={submitting}
          />
        </div>

        <div className="news-form-actions">
          <div className="status-selector">
            <label className="radio-label">
              <input
                type="radio"
                name="status"
                value="published"
                checked={status === 'published'}
                onChange={() => setStatus('published')}
                disabled={submitting}
              />
              <span>เผยแพร่ทันที</span>
            </label>
            <label className="radio-label">
              <input
                type="radio"
                name="status"
                value="draft"
                checked={status === 'draft'}
                onChange={() => setStatus('draft')}
                disabled={submitting}
              />
              <span>บันทึกฉบับร่าง</span>
            </label>
          </div>

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'กำลังบันทึก...' : status === 'published' ? 'เผยแพร่ข่าว' : 'บันทึกฉบับร่าง'}
          </button>
        </div>
      </form>

      {/* News list */}
      <div className="owner-news-list-wrap">
        <h3>รายการข่าวสารทั้งหมด ({news.length})</h3>

        {loading ? (
          <p className="loading-text">กำลังโหลดรายการข่าว...</p>
        ) : news.length === 0 ? (
          <div className="empty-sub-card">
            <TicketIcon />
            <p>ยังไม่มีข่าวสารในระบบ</p>
          </div>
        ) : (
          <div className="owner-news-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>หัวข้อ</th>
                  <th>สถานะ</th>
                  <th>วันที่สร้าง / เผยแพร่</th>
                  <th>การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {news.map(item => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                    </td>
                    <td>
                      <span className={`status-badge ${item.status === 'published' ? 'open' : 'pending'}`}>
                        {item.status === 'published' ? 'เผยแพร่แล้ว' : 'ฉบับร่าง'}
                      </span>
                    </td>
                    <td>
                      <span className="date-info">
                        <CalendarIcon />
                        {item.publishedAt ? formatDate(new Date(item.publishedAt)) : formatDate(new Date(item.createdAt))}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        {item.status === 'draft' && (
                          <button
                            type="button"
                            className="secondary-button small"
                            onClick={() => handlePublish(item.id)}
                          >
                            เผยแพร่
                          </button>
                        )}
                        <button
                          type="button"
                          className="danger-button small"
                          onClick={() => handleDelete(item.id)}
                        >
                          ลบ
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
