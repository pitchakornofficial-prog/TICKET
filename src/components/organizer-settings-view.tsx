'use client';

import { useState, useEffect, useId, useMemo } from 'react';
import Image from 'next/image';
import {
  UsersIcon,
  LockIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  CrossCircleIcon,
  RefreshIcon,
  EyeIcon,
  EyeOffIcon,
  CheckIcon,
} from '@/components/icons';
import { HeaderInfoTooltip } from './header-info-tooltip';
import { triggerRefreshToast } from './toast-notification';
import {
  loadPayoutAccounts,
  savePayoutAccounts,
  loadSharedPayoutAccounts,
  createSharedPayoutAccount,
  updateSharedPayoutAccount,
  deleteSharedPayoutAccount,
  setPrimarySharedPayoutAccount,
  EVENT_PAYOUT_ACCOUNTS_CHANGED,
  type PayoutBankAccount,
} from '@/lib/organizer-payout-sync';

export type BankAccount = PayoutBankAccount;
interface _DeprecatedBankAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  isPrimary: boolean;
  qrCodeUrl?: string;
}

const THAI_BANKS = [
  'ธนาคารกสิกรไทย (KBANK)',
  'ธนาคารไทยพาณิชย์ (SCB)',
  'ธนาคารกรุงเทพ (BBL)',
  'ธนาคารกรุงไทย (KTB)',
  'ธนาคารกรุงศรีอยุธยา (BAY)',
  'ธนาคารทหารไทยธนชาต (TTB)',
  'ธนาคารออมสิน (GSB)',
];

export function OrganizerSettingsView() {
  const qrInputId = useId();

  // Profile & Emergency Contacts State (D-79)
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [primaryPhone, setPrimaryPhone] = useState('');
  const [backupContactName, setBackupContactName] = useState('');
  const [backupPhone, setBackupPhone] = useState('');
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Password & Password Strength Meter State (D-79)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revokeOtherSessions, setRevokeOtherSessions] = useState(true);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Password strength evaluation
  const passwordCriteria = useMemo(() => {
    return {
      minLength: newPassword.length >= 8,
      hasUpperLower: /[a-z]/.test(newPassword) && /[A-Z]/.test(newPassword),
      hasNumber: /[0-9]/.test(newPassword),
      hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword),
    };
  }, [newPassword]);

  const strengthScore = useMemo(() => {
    let score = 0;
    if (passwordCriteria.minLength) score += 1;
    if (passwordCriteria.hasUpperLower) score += 1;
    if (passwordCriteria.hasNumber) score += 1;
    if (passwordCriteria.hasSpecial) score += 1;
    return score;
  }, [passwordCriteria]);

  const strengthLabel = useMemo(() => {
    if (newPassword.length === 0) return { text: '', colorClass: '' };
    if (strengthScore <= 1) return { text: 'ความปลอดภัยต่ำ', colorClass: 'strength-weak' };
    if (strengthScore <= 3) return { text: 'ความปลอดภัยปานกลาง', colorClass: 'strength-medium' };
    return { text: 'ความปลอดภัยสูงมาก', colorClass: 'strength-strong' };
  }, [newPassword, strengthScore]);

  // Bank Accounts State (Synced with Finance via loadPayoutAccounts D-206)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => loadPayoutAccounts());

  useEffect(() => {
    let isCancelled = false;
    const handleSync = () => {
      setBankAccounts(loadPayoutAccounts());
    };
    window.addEventListener(EVENT_PAYOUT_ACCOUNTS_CHANGED, handleSync);
    window.addEventListener('storage', handleSync);

    // Initial load from real database
    loadSharedPayoutAccounts()
      .then((accs) => {
        if (!isCancelled && accs.length > 0) {
          setBankAccounts(accs);
        }
      })
      .catch(() => {});

    // Initial load of organizer profile from database
    fetch('/api/organizer/profile', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled || !data?.profile) return;
        if (data.profile.organizerName) setOrganizerName(data.profile.organizerName);
        if (data.profile.organizerEmail) setOrganizerEmail(data.profile.organizerEmail);
        if (data.profile.primaryPhone) setPrimaryPhone(data.profile.primaryPhone);
        if (data.profile.backupContactName) setBackupContactName(data.profile.backupContactName);
        if (data.profile.backupPhone) setBackupPhone(data.profile.backupPhone);
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
      window.removeEventListener(EVENT_PAYOUT_ACCOUNTS_CHANGED, handleSync);
      window.removeEventListener('storage', handleSync);
    };
  }, []);

  // Modal State for Add / Edit (D-79)
  const [showModal, setShowModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [bankName, setBankName] = useState(THAI_BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [bankSuccess, setBankSuccess] = useState('');
  const [bankError, setBankError] = useState('');
  const [copiedAccountId, setCopiedAccountId] = useState<string | null>(null);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      const [accs, profRes] = await Promise.all([
        loadSharedPayoutAccounts().catch(() => [] as BankAccount[]),
        fetch('/api/organizer/profile', { cache: 'no-store' }).catch(() => null),
      ]);
      if (accs.length > 0) setBankAccounts(accs);
      if (profRes?.ok) {
        const data = await profRes.json().catch(() => null);
        if (data?.profile) {
          setOrganizerName(data.profile.organizerName || '');
          setOrganizerEmail(data.profile.organizerEmail || '');
          setPrimaryPhone(data.profile.primaryPhone || '');
          setBackupContactName(data.profile.backupContactName || '');
          setBackupPhone(data.profile.backupPhone || '');
        }
      }
      triggerRefreshToast('ตั้งค่าผู้จัดงาน');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileError('');
    try {
      const res = await fetch('/api/organizer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizerName,
          primaryPhone,
          backupContactName,
          backupPhone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
        return;
      }
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch {
      setProfileError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);
    if (!currentPassword) {
      setPasswordError('กรุณากรอกรหัสผ่านปัจจุบัน');
      return;
    }
    if (!passwordCriteria.minLength) {
      setPasswordError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rawMsg = typeof data?.message === 'string' ? data.message : '';
        if (rawMsg.toLowerCase().includes('invalid password')) {
          setPasswordError('รหัสผ่านปัจจุบันไม่ถูกต้อง');
        } else {
          setPasswordError(rawMsg || 'ไม่สามารถเปลี่ยนรหัสผ่านได้ กรุณาลองใหม่');
        }
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 4000);
    } catch {
      setPasswordError('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSetPrimaryAccount = async (id: string) => {
    setBankError('');
    setBankSuccess('');
    try {
      const updated = await setPrimarySharedPayoutAccount(id);
      setBankAccounts((prev) => {
        const next = prev.map((acc) => ({
          ...acc,
          isPrimary: acc.id === updated.id,
        }));
        savePayoutAccounts(next);
        return next;
      });
      setBankSuccess('ตั้งเป็นบัญชีหลักและซิงก์ไปยังหน้าการเงินแอดมินเรียบร้อยแล้ว');
      setTimeout(() => setBankSuccess(''), 4000);
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : 'ไม่สามารถตั้งเป็นบัญชีหลักได้');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    setBankError('');
    setBankSuccess('');
    if (bankAccounts.length <= 1) {
      setBankError('ต้องมีบัญชีรับเงินอย่างน้อย 1 บัญชีในระบบสำหรับรับเงินยอดขาย');
      return;
    }
    const confirmed = window.confirm('คุณแน่ใจหรือไม่ที่จะลบบัญชีรับเงินนี้?');
    if (!confirmed) return;

    try {
      await deleteSharedPayoutAccount(id);
      const latest = await loadSharedPayoutAccounts();
      setBankAccounts(latest);
      savePayoutAccounts(latest);
      setBankSuccess('ลบบัญชีรับเงินเรียบร้อยแล้ว');
      setTimeout(() => setBankSuccess(''), 3500);
    } catch (err: unknown) {
      setBankError(err instanceof Error ? err.message : 'ไม่สามารถลบบัญชีรับเงินได้');
    }
  };

  const handleOpenAddModal = () => {
    setEditingAccountId(null);
    setAccName('');
    setAccNumber('');
    setBankName(THAI_BANKS[0]);
    setCustomBankName('');
    setQrFile(null);
    setQrPreviewUrl(null);
    setUploadError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (acc: BankAccount) => {
    setEditingAccountId(acc.id);
    setAccName(acc.accountName);
    setAccNumber(acc.accountNumber);
    if (THAI_BANKS.includes(acc.bankName)) {
      setBankName(acc.bankName);
      setCustomBankName('');
    } else {
      setBankName('other');
      setCustomBankName(acc.bankName);
    }
    setQrFile(null);
    setQrPreviewUrl(acc.qrCodeUrl || null);
    setUploadError('');
    setShowModal(true);
  };

  const handleQrFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      setUploadError('กรุณาเลือกไฟล์ภาพประเภท PNG, JPG, JPEG หรือ WebP เท่านั้น');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setUploadError('ขนาดไฟล์ภาพต้องไม่เกิน 5 MB');
      return;
    }

    setUploadingQr(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('visibility', 'public');
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setUploadError(data.message || 'อัปโหลดรูปภาพ QR Code ไม่สำเร็จ');
        return;
      }
      setQrFile(file);
      setQrPreviewUrl(data.url);
    } catch {
      setUploadError('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่ออัปโหลด QR Code');
    } finally {
      setUploadingQr(false);
    }
  };

  const handleSaveAccountModal = async (e: React.FormEvent) => {
    e.preventDefault();
    setBankError('');
    setBankSuccess('');
    if (uploadingQr) {
      setUploadError('กรุณารอให้อัปโหลดรูป QR Code เสร็จสิ้นก่อนบันทึก');
      return;
    }
    if (!editingAccountId && bankAccounts.length >= 3) {
      setUploadError('สามารถเพิ่มบัญชีรับเงินได้สูงสุด 3 บัญชีเท่านั้น');
      return;
    }

    const finalBankName = bankName === 'other' ? customBankName.trim() : bankName;
    if (!finalBankName) {
      setUploadError('กรุณาระบุชื่อธนาคาร');
      return;
    }

    setSavingAccount(true);
    try {
      if (editingAccountId) {
        await updateSharedPayoutAccount({
          id: editingAccountId,
          accountName: accName,
          accountNumber: accNumber,
          bankName: finalBankName,
          qrCodeUrl: qrPreviewUrl || undefined,
        });
      } else {
        await createSharedPayoutAccount({
          accountName: accName,
          accountNumber: accNumber,
          bankName: finalBankName,
          isPrimary: bankAccounts.length === 0,
          qrCodeUrl: qrPreviewUrl || undefined,
        });
      }

      const latest = await loadSharedPayoutAccounts();
      setBankAccounts(latest);
      savePayoutAccounts(latest);
      setShowModal(false);
      setBankSuccess('บันทึกบัญชีธนาคารและซิงก์ไปยังหน้าการเงินแอดมินเรียบร้อยแล้ว');
      setTimeout(() => setBankSuccess(''), 4000);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'ไม่สามารถบันทึกบัญชีรับเงินได้');
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <div className="settings-page-container">
      {/* Standardized Header Toolbar (D-119) */}
      <header className="settings-page-header">
        <div className="settings-header-text">
          <div className="organizer-header-title-row">
            <h1 className="settings-page-title">
              การตั้งค่าโปรไฟล์และบัญชีผู้จัดงาน
              <HeaderInfoTooltip text="จัดการข้อมูลผู้จัดงาน ข้อมูลติดต่อฉุกเฉิน ความปลอดภัยรหัสผ่าน และบัญชีธนาคารสำหรับรับเงิน" />
            </h1>
            <button
              type="button"
              className="organizer-inline-refresh-btn"
              onClick={handleRefreshAll}
              disabled={refreshing}
              title="รีเฟรชข้อมูลตั้งค่า"
              aria-label="รีเฟรชข้อมูลตั้งค่า"
            >
              <RefreshIcon className={`inline-refresh-icon ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="settings-page-desc">
            จัดการข้อมูลผู้จัดงาน ข้อมูลติดต่อฉุกเฉิน ความปลอดภัยรหัสผ่าน และบัญชีธนาคารสำหรับรับเงิน
          </p>
        </div>
        <nav aria-label="ทางลัดหมวดการตั้งค่า" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
          <a href="#section-profile" className="settings-outline-btn-sm" style={{ textDecoration: 'none' }}>
            โปรไฟล์และการติดต่อ
          </a>
          <a href="#section-security" className="settings-outline-btn-sm" style={{ textDecoration: 'none' }}>
            ความปลอดภัยรหัสผ่าน
          </a>
          <a href="#section-payout" className="settings-outline-btn-sm" style={{ textDecoration: 'none' }}>
            บัญชีธนาคารรับเงิน ({bankAccounts.length}/3)
          </a>
        </nav>
      </header>

      

      {/* 2. Main Content Stack (Max-width 1200px) */}
      <div className="settings-content-stack">
        {/* Card 1: Organizer Profile & Emergency Contacts (D-79) */}
        <section id="section-profile" className="settings-card" aria-labelledby="card-profile-title">
          <div className="settings-card-header">
            <div className="settings-card-header-icon">
              <UsersIcon />
            </div>
            <div className="settings-card-header-text">
              <h2 id="card-profile-title" className="settings-card-title">
                ข้อมูลผู้จัดงานและการติดต่อ (Organizer Profile & Contacts)
              </h2>
              <p className="settings-card-desc">
                จัดการชื่อผู้จัดหรือชื่อบริษัท และเบอร์โทรศัพท์สำหรับติดต่อประสานงานกรณีฉุกเฉิน
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="settings-form">
            {profileSuccess && (
              <div className="settings-alert-success" role="alert">
                <CheckCircleIcon style={{ width: '18px', height: '18px' }} />
                <span>บันทึกข้อมูลผู้จัดงานและการติดต่อเรียบร้อยแล้ว</span>
              </div>
            )}

            {profileError && (
              <div className="settings-alert-error" role="alert">
                <span>{profileError}</span>
              </div>
            )}

            <div className="settings-field-group">
              <label htmlFor="organizer-name" className="settings-label">
                ชื่อผู้จัดงาน / ชื่อบริษัท <span className="text-required">*</span>
              </label>
              <input
                id="organizer-name"
                type="text"
                className="settings-input"
                value={organizerName}
                onChange={e => setOrganizerName(e.target.value)}
                required
              />
            </div>

            <div className="settings-field-group">
              <label htmlFor="organizer-email" className="settings-label">
                อีเมลติดต่อหลัก <span className="text-required">*</span>
              </label>
              <input
                id="organizer-email"
                type="email"
                className="settings-input"
                value={organizerEmail}
                onChange={e => setOrganizerEmail(e.target.value)}
                required
              />
              <span className="settings-field-hint">ใช้รับการแจ้งเตือนรอบการโอนเงินและรายงานระบบ</span>
            </div>

            {/* Emergency Contacts Section (D-79) */}
            <div className="settings-sub-section">
              <h3 className="settings-sub-title">ช่องทางการติดต่อและเบอร์โทรศัพท์ (Contacts)</h3>

              <div className="settings-field-group">
                <label htmlFor="primary-phone" className="settings-label">
                  เบอร์โทรศัพท์หลัก <span className="text-required">*</span>
                </label>
                <input
                  id="primary-phone"
                  type="tel"
                  className="settings-input"
                  placeholder="เช่น 081-234-5678"
                  value={primaryPhone}
                  onChange={e => setPrimaryPhone(e.target.value)}
                  required
                />
              </div>

              <div className="settings-contacts-row">
                <div className="settings-field-group flex-1">
                  <label htmlFor="backup-contact-name" className="settings-label">
                    ชื่อผู้ติดต่อสำรอง
                  </label>
                  <input
                    id="backup-contact-name"
                    type="text"
                    className="settings-input"
                    placeholder="เช่น ผู้จัดการฝ่ายเวที / ฝ่ายการเงิน"
                    value={backupContactName}
                    onChange={e => setBackupContactName(e.target.value)}
                  />
                </div>

                <div className="settings-field-group flex-1">
                  <label htmlFor="backup-phone" className="settings-label">
                    เบอร์โทรศัพท์สำรอง
                  </label>
                  <input
                    id="backup-phone"
                    type="tel"
                    className="settings-input"
                    placeholder="เช่น 089-876-5432"
                    value={backupPhone}
                    onChange={e => setBackupPhone(e.target.value)}
                  />
                </div>
              </div>
              <span className="settings-field-hint">
                เบอร์โทรติดต่อสำรองจะใช้ในกรณีที่เจ้าของเว็บไม่สามารถติดต่อเบอร์หลักได้ระหว่างดำเนินงาน
              </span>
            </div>

            <div className="settings-form-actions">
              <button
                type="submit"
                className="settings-outline-btn-primary"
                disabled={savingProfile}
              >
                {savingProfile ? 'กำลังบันทึก...' : 'บันทึกข้อมูลโปรไฟล์'}
              </button>
            </div>
          </form>
        </section>

        {/* Card 2: Security & Password with Strength Meter (D-79) */}
        <section id="section-security" className="settings-card" aria-labelledby="card-security-title">
          <div className="settings-card-header">
            <div className="settings-card-header-icon">
              <LockIcon />
            </div>
            <div className="settings-card-header-text">
              <h2 id="card-security-title" className="settings-card-title">ความปลอดภัยและรหัสผ่าน (Security)</h2>
              <p className="settings-card-desc">เปลี่ยนรหัสผ่านสำหรับเข้าสู่ระบบหลังบ้านพร้อมระบบตรวจวัดความปลอดภัย</p>
            </div>
          </div>

          <form onSubmit={handleUpdatePassword} className="settings-form">
            {passwordSuccess && (
              <div className="settings-alert-success" role="alert">
                <CheckCircleIcon style={{ width: '18px', height: '18px' }} />
                <span>อัปเดตรหัสผ่านใหม่เรียบร้อยแล้ว</span>
              </div>
            )}

            {passwordError && (
              <div className="settings-alert-error" role="alert">
                <span>{passwordError}</span>
              </div>
            )}

            <div className="settings-field-group">
              <label htmlFor="current-password" className="settings-label">
                รหัสผ่านปัจจุบัน <span className="text-required">*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  className="settings-input"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                  aria-label={showCurrentPassword ? 'ซ่อนรหัสผ่านปัจจุบัน' : 'แสดงรหัสผ่านปัจจุบัน'}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    padding: '4px',
                  }}
                >
                  {showCurrentPassword ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                </button>
              </div>
            </div>

            <div className="settings-field-group">
              <label htmlFor="new-password" className="settings-label">
                รหัสผ่านใหม่ <span className="text-required">*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="settings-input"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="กรอกรหัสผ่านใหม่"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? 'ซ่อนรหัสผ่านใหม่' : 'แสดงรหัสผ่านใหม่'}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    padding: '4px',
                  }}
                >
                  {showNewPassword ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                </button>
              </div>

              {/* Password Strength Meter (D-79) */}
              {newPassword.length > 0 && (
                <div className="password-strength-container" aria-live="polite">
                  <div className="strength-header">
                    <span className="strength-header-title">ระดับความปลอดภัย:</span>
                    <span className={`strength-header-val ${strengthLabel.colorClass}`}>
                      {strengthLabel.text}
                    </span>
                  </div>

                  <div className="strength-meter-bar">
                    <div
                      className={`strength-fill fill-${strengthScore}`}
                      style={{ width: `${(strengthScore / 4) * 100}%` }}
                    />
                  </div>

                  <ul className="strength-checklist">
                    <li className={passwordCriteria.minLength ? 'valid' : 'invalid'}>
                      {passwordCriteria.minLength ? (
                        <CheckCircleIcon className="check-icon-valid" />
                      ) : (
                        <CrossCircleIcon className="check-icon-invalid" />
                      )}
                      <span>ความยาวอย่างน้อย 8 ตัวอักษร</span>
                    </li>
                    <li className={passwordCriteria.hasUpperLower ? 'valid' : 'invalid'}>
                      {passwordCriteria.hasUpperLower ? (
                        <CheckCircleIcon className="check-icon-valid" />
                      ) : (
                        <CrossCircleIcon className="check-icon-invalid" />
                      )}
                      <span>มีทั้งตัวพิมพ์เล็กและพิมพ์ใหญ่ (a-z, A-Z)</span>
                    </li>
                    <li className={passwordCriteria.hasNumber ? 'valid' : 'invalid'}>
                      {passwordCriteria.hasNumber ? (
                        <CheckCircleIcon className="check-icon-valid" />
                      ) : (
                        <CrossCircleIcon className="check-icon-invalid" />
                      )}
                      <span>มีตัวเลขอย่างน้อย 1 ตัว (0-9)</span>
                    </li>
                    <li className={passwordCriteria.hasSpecial ? 'valid' : 'invalid'}>
                      {passwordCriteria.hasSpecial ? (
                        <CheckCircleIcon className="check-icon-valid" />
                      ) : (
                        <CrossCircleIcon className="check-icon-invalid" />
                      )}
                      <span>มีอักขระพิเศษอย่างน้อย 1 ตัว (!@#$%^&*)</span>
                    </li>
                  </ul>
                </div>
              )}
            </div>

            <div className="settings-field-group">
              <label htmlFor="confirm-password" className="settings-label">
                ยืนยันรหัสผ่านใหม่ <span className="text-required">*</span>
              </label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="settings-input"
                  style={{ width: '100%', paddingRight: '2.5rem' }}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  aria-label={showConfirmPassword ? 'ซ่อนยืนยันรหัสผ่านใหม่' : 'แสดงยืนยันรหัสผ่านใหม่'}
                  style={{
                    position: 'absolute',
                    right: '0.65rem',
                    background: 'transparent',
                    border: 'none',
                    color: '#64748b',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    padding: '4px',
                  }}
                >
                  {showConfirmPassword ? <EyeOffIcon width={18} height={18} /> : <EyeIcon width={18} height={18} />}
                </button>
              </div>
            </div>

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.86rem', color: '#334155', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={revokeOtherSessions}
                onChange={(e) => setRevokeOtherSessions(e.target.checked)}
              />
              <span>ออกจากระบบในอุปกรณ์อื่นทั้งหมดหลังเปลี่ยนรหัสผ่าน</span>
            </label>

            <div className="settings-form-actions">
              <button type="submit" className="settings-outline-btn-primary" disabled={savingPassword}>
                {savingPassword ? 'กำลังอัปเดตรหัสผ่าน...' : 'อัปเดตรหัสผ่าน'}
              </button>
            </div>
          </form>
        </section>

        {/* Card 3: Payout Bank Accounts with Edit & Delete & Dashed Dropzone (D-79) */}
        <section id="section-payout" className="settings-card" aria-labelledby="card-payout-title">
          <div className="settings-card-header-row">
            <div className="settings-card-header">
              <div className="settings-card-header-icon">
                <BanknotesIcon />
              </div>
              <div className="settings-card-header-text">
                <h2 id="card-payout-title" className="settings-card-title">
                  บัญชีธนาคารสำหรับรับเงิน (Payout Accounts)
                </h2>
                <p className="settings-card-desc">
                  จัดการบัญชีธนาคารสำหรับรับเงินยอดขายบัตรจากเจ้าของเว็บ (สูงสุด 3 บัญชี พร้อมระบบกำหนดบัญชีหลัก แก้ไข และลบ)
                </p>
              </div>
            </div>

            {bankAccounts.length < 3 && (
              <button
                type="button"
                className="settings-outline-btn-sm"
                onClick={handleOpenAddModal}
              >
                + เพิ่มบัญชีรับเงิน ({bankAccounts.length}/3)
              </button>
            )}
          </div>

          {bankSuccess && (
            <div className="settings-alert-success" role="status" style={{ marginBottom: '1rem' }}>
              <CheckCircleIcon style={{ width: '18px', height: '18px' }} />
              <span>{bankSuccess}</span>
            </div>
          )}

          {bankError && (
            <div className="settings-alert-error" role="alert" style={{ marginBottom: '1rem' }}>
              <span>{bankError}</span>
            </div>
          )}

          <div className="payout-accounts-grid">
            {bankAccounts.map((account) => (
              <div
                key={account.id}
                className={`payout-account-card ${account.isPrimary ? 'primary-account' : ''}`}
              >
                <div className="payout-card-top">
                  <div className="payout-bank-tag">
                    <span className="payout-bank-name">{account.bankName}</span>
                  </div>
                  {account.isPrimary ? (
                    <span className="primary-badge" title="เงินยอดขายจะถูกโอนเข้าบัญชีนี้เป็นอันดับแรก">
                      <ShieldCheckIcon style={{ width: '13px', height: '13px' }} />
                      <span>บัญชีหลัก (Default)</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="make-primary-btn"
                      onClick={() => handleSetPrimaryAccount(account.id)}
                    >
                      ตั้งเป็นบัญชีหลัก
                    </button>
                  )}
                </div>

                <div className="payout-card-body">
                  <div className="payout-number-row">
                    <span className="payout-number-label">เลขที่บัญชี:</span>
                    <span className="payout-number-val">{account.accountNumber}</span>
                    <button
                      type="button"
                      className="settings-outline-btn-sm"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => {
                        if (navigator?.clipboard) {
                          void navigator.clipboard.writeText(account.accountNumber);
                          setCopiedAccountId(account.id);
                          setTimeout(() => setCopiedAccountId(null), 2000);
                        }
                      }}
                    >
                      {copiedAccountId === account.id ? (
                        <>
                          <CheckIcon width={12} height={12} />
                          <span>คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <span>คัดลอกเลขบัญชี</span>
                      )}
                    </button>
                  </div>
                  <div className="payout-name-row">
                    <span className="payout-name-label">ชื่อบัญชี:</span>
                    <span className="payout-name-val">{account.accountName}</span>
                  </div>
                  {account.isPrimary && (
                    <div style={{ fontSize: '0.78rem', color: '#166534', marginTop: '0.35rem' }}>
                      ซิงก์เป็นบัญชีรับเงินปลายทางในหน้าการเงินแอดมินแล้ว
                    </div>
                  )}

                  {account.qrCodeUrl && (
                    <div className="payout-qr-preview">
                      <span className="payout-qr-label">คิวอาร์โค้ดบัญชี:</span>
                      <Image
                        src={account.qrCodeUrl}
                        alt={`QR Code รับเงิน ${account.accountName}`}
                        width={90}
                        height={90}
                        unoptimized
                        className="payout-qr-img"
                      />
                    </div>
                  )}
                </div>

                {/* Edit & Delete Action Buttons (D-79) */}
                <div className="payout-card-actions">
                  <button
                    type="button"
                    className="payout-edit-btn"
                    onClick={() => handleOpenEditModal(account)}
                  >
                    แก้ไขข้อมูล
                  </button>

                  <button
                    type="button"
                    className="payout-delete-btn"
                    onClick={() => handleDeleteAccount(account.id)}
                    title="ลบบัญชีนี้"
                  >
                    ลบบัญชี
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 4. Modal for Add / Edit Payout Bank Account with Dashed Dropzone (D-79) */}
      {showModal && (
        <div className="settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-acc-title">
          <div className="settings-modal-card">
            <div className="settings-modal-header">
              <h3 id="modal-acc-title">
                {editingAccountId ? 'แก้ไขบัญชีธนาคารสำหรับรับเงิน' : 'เพิ่มบัญชีธนาคารสำหรับรับเงิน'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowModal(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <CrossCircleIcon style={{ width: '20px', height: '20px' }} />
              </button>
            </div>

            <form onSubmit={handleSaveAccountModal} className="settings-form full-width">
              <div className="settings-field-group">
                <label htmlFor="modal-bank-select" className="settings-label">
                  ธนาคาร <span className="text-required">*</span>
                </label>
                <select
                  id="modal-bank-select"
                  className="settings-select"
                  value={bankName}
                  onChange={e => setBankName(e.target.value)}
                  required
                >
                  {THAI_BANKS.map(bank => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  ))}
                  <option value="other">อื่น ๆ (ระบุชื่อธนาคารเอง)</option>
                </select>
              </div>

              {bankName === 'other' && (
                <div className="settings-field-group">
                  <label htmlFor="modal-custom-bank" className="settings-label">
                    ระบุชื่อธนาคาร / สถาบันการเงิน <span className="text-required">*</span>
                  </label>
                  <input
                    id="modal-custom-bank"
                    type="text"
                    className="settings-input"
                    placeholder="เช่น ธนาคารยูโอบี (UOB) / สหกรณ์ออมทรัพย์"
                    value={customBankName}
                    onChange={e => setCustomBankName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="settings-field-group">
                <label htmlFor="modal-acc-number" className="settings-label">
                  เลขที่บัญชี <span className="text-required">*</span>
                </label>
                <input
                  id="modal-acc-number"
                  type="text"
                  className="settings-input"
                  placeholder="เช่น 123-4-56789-0"
                  value={accNumber}
                  onChange={e => setAccNumber(e.target.value)}
                  required
                />
              </div>

              <div className="settings-field-group">
                <label htmlFor="modal-acc-name" className="settings-label">
                  ชื่อบัญชี (ตรงตามสมุดบัญชี) <span className="text-required">*</span>
                </label>
                <input
                  id="modal-acc-name"
                  type="text"
                  className="settings-input"
                  placeholder="เช่น บริษัท สมชาย โปรดักชั่น จำกัด"
                  value={accName}
                  onChange={e => setAccName(e.target.value)}
                  required
                />
              </div>

              {/* Dashed Dropzone for QR Code Upload (D-79) */}
              <div className="settings-field-group">
                <label htmlFor={qrInputId} className="settings-label">
                  ภาพคิวอาร์โค้ดบัญชี (ไม่บังคับ)
                </label>

                <div className="dashed-upload-dropzone">
                  <input
                    id={qrInputId}
                    type="file"
                    accept="image/png, image/jpeg, image/jpg"
                    className="dashed-dropzone-input"
                    onChange={handleQrFileChange}
                  />

                  {uploadingQr ? (
                    <div className="dropzone-placeholder">
                      <span style={{ fontSize: '0.88rem', color: '#475569' }}>กำลังอัปโหลดภาพ QR Code...</span>
                    </div>
                  ) : qrPreviewUrl ? (
                    <div className="dropzone-preview-box">
                      <Image
                        src={qrPreviewUrl}
                        alt="ภาพตัวอย่าง QR Code"
                        width={120}
                        height={120}
                        unoptimized
                        className="dropzone-preview-img"
                      />
                      <div className="dropzone-preview-info">
                        <span className="dropzone-file-name">
                          {qrFile ? qrFile.name : 'ภาพ QR Code เดิมที่บันทึกไว้'}
                        </span>
                        <button
                          type="button"
                          className="dropzone-remove-btn"
                          onClick={() => {
                            setQrFile(null);
                            setQrPreviewUrl(null);
                          }}
                        >
                          ลบภาพนี้
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-placeholder">
                      <div className="dropzone-icon-circle">
                        <svg
                          viewBox="0 0 24 24"
                          width="24"
                          height="24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      </div>
                      <span className="dropzone-text-main">
                        คลิกเพื่อเลือกไฟล์ หรือลากภาพมาวางที่นี่
                      </span>
                      <span className="dropzone-text-sub">
                        รองรับไฟล์ PNG, JPG, JPEG ขนาดไม่เกิน 5 MB
                      </span>
                    </div>
                  )}
                </div>

                {uploadError && (
                  <span className="settings-upload-error">{uploadError}</span>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="settings-outline-btn-secondary"
                  onClick={() => setShowModal(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="settings-outline-btn-primary" disabled={savingAccount}>
                  {savingAccount ? 'กำลังบันทึก...' : (editingAccountId ? 'บันทึกการแก้ไข' : 'บันทึกบัญชีรับเงิน')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
