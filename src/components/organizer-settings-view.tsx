'use client';

import { useState, useId, useMemo } from 'react';
import Image from 'next/image';
import {
  UsersIcon,
  LockIcon,
  BanknotesIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  CrossCircleIcon,
} from '@/components/icons';

interface BankAccount {
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
  const [organizerName, setOrganizerName] = useState('สมชาย ผู้จัดงาน');
  const [organizerEmail, setOrganizerEmail] = useState('organizer@ticket.local');
  const [primaryPhone, setPrimaryPhone] = useState('081-234-5678');
  const [backupContactName, setBackupContactName] = useState('วิภาดา การเงิน');
  const [backupPhone, setBackupPhone] = useState('089-876-5432');
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password & Password Strength Meter State (D-79)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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

  // Bank Accounts State (Max 3 accounts as confirmed in D-78 & D-79)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
    {
      id: 'acc-1',
      accountName: 'บจก. สมชาย คอนเสิร์ต โปรดักชั่น',
      accountNumber: '123-4-56789-0',
      bankName: 'ธนาคารกสิกรไทย (KBANK)',
      isPrimary: true,
    },
  ]);

  // Modal State for Add / Edit (D-79)
  const [showModal, setShowModal] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [accName, setAccName] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [bankName, setBankName] = useState(THAI_BANKS[0]);
  const [customBankName, setCustomBankName] = useState('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreviewUrl, setQrPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');

  // Jump to section
  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Back to top
  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSuccess(true);
    setTimeout(() => setProfileSuccess(false), 3000);
  };

  const handleUpdatePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (!passwordCriteria.minLength) {
      setPasswordError('รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 8 ตัวอักษร');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }
    setPasswordSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setPasswordSuccess(false), 3000);
  };

  const handleSetPrimaryAccount = (id: string) => {
    setBankAccounts(prev =>
      prev.map(acc => ({
        ...acc,
        isPrimary: acc.id === id,
      }))
    );
  };

  const handleDeleteAccount = (id: string) => {
    if (bankAccounts.length <= 1) {
      alert('ต้องมีบัญชีรับเงินอย่างน้อย 1 บัญชีในระบบสำหรับรับเงินยอดขาย');
      return;
    }
    const confirmed = window.confirm('คุณแน่ใจหรือไม่ที่จะลบบัญชีรับเงินนี้?');
    if (!confirmed) return;

    setBankAccounts(prev => {
      const filtered = prev.filter(acc => acc.id !== id);
      if (!filtered.some(acc => acc.isPrimary) && filtered.length > 0) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
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

  const handleQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setUploadError('');
    if (!file) return;

    // Validate type: png, jpg, jpeg
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setUploadError('กรุณาเลือกไฟล์ภาพประเภท PNG, JPG หรือ JPEG เท่านั้น');
      return;
    }

    // Validate size: max 5MB
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('ขนาดไฟล์ภาพต้องไม่เกิน 5 MB');
      return;
    }

    setQrFile(file);
    setQrPreviewUrl(URL.createObjectURL(file));
  };

  const handleSaveAccountModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccountId && bankAccounts.length >= 3) {
      alert('สามารถเพิ่มบัญชีรับเงินได้สูงสุด 3 บัญชีเท่านั้น');
      return;
    }

    const finalBankName = bankName === 'other' ? customBankName.trim() : bankName;
    if (!finalBankName) {
      alert('กรุณาระบุชื่อธนาคาร');
      return;
    }

    if (editingAccountId) {
      // Edit existing account
      setBankAccounts(prev =>
        prev.map(acc => {
          if (acc.id === editingAccountId) {
            return {
              ...acc,
              accountName: accName,
              accountNumber: accNumber,
              bankName: finalBankName,
              qrCodeUrl: qrPreviewUrl || undefined,
            };
          }
          return acc;
        })
      );
    } else {
      // Add new account
      const newAcc: BankAccount = {
        id: `acc-${Date.now()}`,
        accountName: accName,
        accountNumber: accNumber,
        bankName: finalBankName,
        isPrimary: bankAccounts.length === 0,
        qrCodeUrl: qrPreviewUrl || undefined,
      };
      setBankAccounts(prev => [...prev, newAcc]);
    }

    setShowModal(false);
  };

  return (
    <div className="settings-page-container">
      {/* 1. Jump Toolbar (D-78) */}
      <nav className="settings-jump-toolbar" aria-label="แถบปุ่มลัดไปยังส่วนต่าง ๆ">
        <span className="jump-toolbar-label">ไปที่การ์ด:</span>
        <div className="jump-toolbar-pills">
          <button
            type="button"
            className="jump-pill-btn"
            onClick={() => handleScrollToSection('section-profile')}
          >
            <UsersIcon style={{ width: '15px', height: '15px' }} />
            <span>ข้อมูลผู้จัดงานและการติดต่อ</span>
          </button>
          <button
            type="button"
            className="jump-pill-btn"
            onClick={() => handleScrollToSection('section-security')}
          >
            <LockIcon style={{ width: '15px', height: '15px' }} />
            <span>ความปลอดภัยและรหัสผ่าน</span>
          </button>
          <button
            type="button"
            className="jump-pill-btn"
            onClick={() => handleScrollToSection('section-payout')}
          >
            <BanknotesIcon style={{ width: '15px', height: '15px' }} />
            <span>บัญชีธนาคารสำหรับรับเงิน ({bankAccounts.length}/3)</span>
          </button>
        </div>
      </nav>

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
              <button type="submit" className="primary-button">
                บันทึกข้อมูลโปรไฟล์
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
              <input
                id="current-password"
                type="password"
                className="settings-input"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="settings-field-group">
              <label htmlFor="new-password" className="settings-label">
                รหัสผ่านใหม่ <span className="text-required">*</span>
              </label>
              <input
                id="new-password"
                type="password"
                className="settings-input"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="กรอกรหัสผ่านใหม่"
                required
              />

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
              <input
                id="confirm-password"
                type="password"
                className="settings-input"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="settings-form-actions">
              <button type="submit" className="primary-button">
                อัปเดตรหัสผ่าน
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
                className="primary-button small"
                onClick={handleOpenAddModal}
              >
                + เพิ่มบัญชีรับเงิน ({bankAccounts.length}/3)
              </button>
            )}
          </div>

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
                  </div>
                  <div className="payout-name-row">
                    <span className="payout-name-label">ชื่อบัญชี:</span>
                    <span className="payout-name-val">{account.accountName}</span>
                  </div>

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

      {/* 3. Floating Back-to-Top Button (D-78) */}
      <button
        type="button"
        className="floating-back-to-top"
        onClick={handleScrollToTop}
        title="กลับสู่ด้านบนสุด"
        aria-label="กลับสู่ด้านบนสุด"
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      </button>

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
                ✕
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

                  {qrPreviewUrl ? (
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
                  className="secondary-button"
                  onClick={() => setShowModal(false)}
                >
                  ยกเลิก
                </button>
                <button type="submit" className="primary-button">
                  {editingAccountId ? 'บันทึกการแก้ไข' : 'บันทึกบัญชีรับเงิน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
