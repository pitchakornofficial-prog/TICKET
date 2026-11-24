'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import jsQR from 'jsqr';
import {
  QrCodeIcon,
  CameraIcon,
  CameraOffIcon,
  CheckCircleIcon,
  CrossCircleIcon,
  ClockIcon,
  RefreshIcon,
  SearchIcon,
  ShieldCheckIcon,
} from '@/components/icons';
import { TicketIcon } from '@/components/ticket-icon';
import type { TicketInspectionResult, SampleTicketOption } from '@/server/ticket-inspector';

function playScanBeep(success: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.value = success ? 880 : 280;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
    osc.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    // Ignore audio policy errors
  }
}

export function TicketInspectorView() {
  const [activeTab, setActiveTab] = useState<'camera' | 'upload' | 'manual'>('camera');
  const [manualCode, setManualCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TicketInspectionResult | null>(null);
  const [samples, setSamples] = useState<SampleTicketOption[]>([]);
  const [_loadingSamples, setLoadingSamples] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  // Camera scanner states
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const decodeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Fetch sample tickets for quick 1-click test
  const fetchSamples = useCallback(async () => {
    try {
      setLoadingSamples(true);
      const res = await fetch('/api/back-office/tickets/inspect?action=recent-samples');
      if (res.ok) {
        const data = await res.json();
        setSamples(data.samples || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingSamples(false);
    }
  }, []);

  useEffect(() => {
    void fetchSamples();
  }, [fetchSamples]);

  // Main Inspect Handler
  const handleInspect = useCallback(async (codeToInspect: string) => {
    const clean = codeToInspect.trim();
    if (!clean) return;

    setLoading(true);
    try {
      const res = await fetch('/api/back-office/tickets/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrPayloadOrCode: clean }),
      });

      const data: TicketInspectionResult = await res.json();
      setResult(data);
      playScanBeep(data.found && data.ticket?.status === 'valid');
    } catch {
      setResult({
        found: false,
        rawInput: clean,
        message: 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง',
      });
      playScanBeep(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Camera Scanning Loop
  useEffect(() => {
    if (activeTab !== 'camera' || !cameraActive) {
      setCameraStatus('idle');
      setCameraError(null);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => {
      detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
    };
    const nativeBarcodeDetectorCtor =
      typeof window !== 'undefined'
        ? (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
        : undefined;
    let barcodeDetector: InstanceType<BarcodeDetectorCtor> | null = null;
    if (nativeBarcodeDetectorCtor) {
      try {
        barcodeDetector = new nativeBarcodeDetectorCtor({ formats: ['qr_code'] });
      } catch {
        barcodeDetector = null;
      }
    }

    const decodeFrame = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && !loading && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        let decoded: string | null = null;

        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            const raw = barcodes.find(b => typeof b.rawValue === 'string' && b.rawValue.trim())?.rawValue?.trim();
            if (raw) decoded = raw;
          } catch {
            barcodeDetector = null;
          }
        }

        if (!decoded) {
          const canvas = decodeCanvasRef.current || document.createElement('canvas');
          decodeCanvasRef.current = canvas;
          const maxWidth = 640;
          const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
          const targetW = Math.max(1, Math.round(video.videoWidth * scale));
          const targetH = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== targetW) canvas.width = targetW;
          if (canvas.height !== targetH) canvas.height = targetH;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, targetW, targetH);
            const imageData = ctx.getImageData(0, 0, targetW, targetH);
            const qr = jsQR(imageData.data, targetW, targetH, { inversionAttempts: 'dontInvert' });
            if (qr?.data?.trim()) {
              decoded = qr.data.trim();
            }
          }
        }

        if (decoded && !cancelled) {
          const nowMs = Date.now();
          const last = lastScannedRef.current;
          if (!last || last.code !== decoded || nowMs - last.at > 3000) {
            lastScannedRef.current = { code: decoded, at: nowMs };
            void handleInspect(decoded);
          }
        }
      }

      if (!cancelled) {
        scanTimer = setTimeout(() => {
          void decodeFrame();
        }, 160);
      }
    };

    const startCamera = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraStatus('error');
        setCameraError('เบราว์เซอร์ไม่รองรับการเปิดกล้อง สามารถใช้การอัปโหลดรูปภาพหรือกรอกรหัสบัตรแทนได้');
        return;
      }

      setCameraStatus('starting');
      setCameraError(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: cameraFacing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        if (cancelled) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
          setCameraStatus('active');
          void decodeFrame();
        }
      } catch (err) {
        if (cancelled) return;
        setCameraStatus('error');
        setCameraError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'ไม่อนุญาตให้เข้าถึงกล้อง กรุณาเปิดสิทธิ์การใช้งานกล้องในเบราว์เซอร์'
            : 'ไม่สามารถเปิดกล้องได้ สามารถใช้แท็บอัปโหลดรูปภาพหรือกรอกรหัสแทนได้',
        );
      }
    };

    void startCamera();

    return () => {
      cancelled = true;
      if (scanTimer) clearTimeout(scanTimer);
      if (stream) {
        for (const track of stream.getTracks()) track.stop();
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [activeTab, cameraActive, cameraFacing, handleInspect, loading]);

  // Image Upload Decode Handler
  const handleUploadImageFile = async (file: File) => {
    if (!file) return;

    setLoading(true);
    setResult(null);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string;
        if (!dataUrl) {
          setResult({ found: false, rawInput: file.name, message: 'ไม่สามารถอ่านไฟล์รูปภาพได้' });
          setLoading(false);
          return;
        }

        const img = new window.Image();
        img.onload = async () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            setResult({ found: false, rawInput: file.name, message: 'ไม่สามารถประมวลผลรูปภาพได้' });
            setLoading(false);
            return;
          }

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          let decoded: string | null = null;

          // Try jsQR
          const qr = jsQR(imageData.data, canvas.width, canvas.height, {
            inversionAttempts: 'attemptBoth',
          });
          if (qr?.data?.trim()) {
            decoded = qr.data.trim();
          }

          if (decoded) {
            void handleInspect(decoded);
          } else {
            setResult({
              found: false,
              rawInput: file.name,
              message: 'ไม่พบ QR Code ในรูปภาพที่อัปโหลด กรุณาตรวจสอบว่ารูปภาพมีความชัดเจนและมี QR Code อยู่ในภาพ',
            });
            playScanBeep(false);
            setLoading(false);
          }
        };

        img.onerror = () => {
          setResult({ found: false, rawInput: file.name, message: 'รูปภาพเสียหายหรือไม่รองรับ' });
          setLoading(false);
        };

        img.src = dataUrl;
      };

      reader.readAsDataURL(file);
    } catch {
      setResult({ found: false, rawInput: file.name, message: 'เกิดข้อผิดพลาดในการประมวลผลไฟล์' });
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    setCopyFeedback(label);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  const resetForNextScan = () => {
    setResult(null);
    setManualCode('');
    lastScannedRef.current = null;
  };

  return (
    <div className="ticket-inspector-container" style={{ padding: '1.25rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ display: 'inline-flex', padding: '0.35rem', background: '#eff6ff', borderRadius: '8px', color: '#2563eb' }}>
              <QrCodeIcon style={{ width: '22px', height: '22px' }} />
            </span>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: '#0f172a' }}>
              ตรวจสอบและทดสอบคิวอาร์โค้ดจากบัตร (Ticket QR Inspector & Tester)
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: '0.8125rem', color: '#64748b' }}>
            สแกนคิวอาร์โค้ดหรือระบุรหัสบัตรเพื่อตรวจสอบความถูกต้อง สถานะการใช้งาน โควตา ข้อมูลผู้ซื้อ และประวัติการเข้างาน (โหมดตรวจสอบ/ทดสอบ ปลอดภัย ไม่ตัดสิทธิ์บัตร)
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.3rem 0.65rem', borderRadius: '9999px', background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0', fontWeight: 500 }}>
            <ShieldCheckIcon style={{ width: '14px', height: '14px' }} />
            <span>โหมดตรวจสอบปลอดภัย (Safe Inspection Mode)</span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left Scanner / Input Column & Right Result Column */}
      <div style={{ display: 'grid', gridTemplateColumns: result ? 'minmax(320px, 420px) 1fr' : '1fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Scanner Control Box */}
        <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          {/* Input Method Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', background: '#f1f5f9', padding: '0.25rem', borderRadius: '8px', marginBottom: '1rem' }}>
            <button
              type="button"
              onClick={() => setActiveTab('camera')}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                fontSize: '0.8125rem',
                fontWeight: activeTab === 'camera' ? 600 : 400,
                color: activeTab === 'camera' ? '#0f172a' : '#64748b',
                background: activeTab === 'camera' ? '#ffffff' : 'transparent',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                boxShadow: activeTab === 'camera' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <CameraIcon style={{ width: '16px', height: '16px' }} />
              <span>กล้องสแกนสด</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                fontSize: '0.8125rem',
                fontWeight: activeTab === 'upload' ? 600 : 400,
                color: activeTab === 'upload' ? '#0f172a' : '#64748b',
                background: activeTab === 'upload' ? '#ffffff' : 'transparent',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                boxShadow: activeTab === 'upload' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <QrCodeIcon style={{ width: '16px', height: '16px' }} />
              <span>อัปโหลดภาพ QR</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('manual')}
              style={{
                flex: 1,
                padding: '0.45rem 0.5rem',
                fontSize: '0.8125rem',
                fontWeight: activeTab === 'manual' ? 600 : 400,
                color: activeTab === 'manual' ? '#0f172a' : '#64748b',
                background: activeTab === 'manual' ? '#ffffff' : 'transparent',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.35rem',
                boxShadow: activeTab === 'manual' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              <SearchIcon style={{ width: '16px', height: '16px' }} />
              <span>กรอกรหัสค้นหา</span>
            </button>
          </div>

          {/* Tab 1: Live Camera Scanner */}
          {activeTab === 'camera' && (
            <div>
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4 / 3',
                  background: '#090d16',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <video
                  ref={videoRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: cameraStatus === 'active' ? 'block' : 'none',
                  }}
                  muted
                  playsInline
                />

                {/* Reticle / Target Box */}
                {cameraStatus === 'active' && (
                  <div
                    style={{
                      position: 'absolute',
                      width: '65%',
                      height: '65%',
                      border: '2px solid rgba(255, 255, 255, 0.8)',
                      borderRadius: '12px',
                      boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.45)',
                      pointerEvents: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div style={{ width: '100%', height: '2px', background: 'rgba(59, 130, 246, 0.8)' }} />
                  </div>
                )}

                {/* Camera Starting / Error Overlay */}
                {cameraStatus === 'starting' && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                    <RefreshIcon className="spin-icon" style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem' }} />
                    <span style={{ fontSize: '0.8125rem' }}>กำลังเชื่อมต่อกล้อง...</span>
                  </div>
                )}

                {cameraStatus === 'error' && (
                  <div style={{ textAlign: 'center', color: '#fca5a5', padding: '1rem', maxWidth: '85%' }}>
                    <CameraOffIcon style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem', color: '#ef4444' }} />
                    <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.4 }}>{cameraError}</p>
                  </div>
                )}

                {cameraStatus === 'idle' && !cameraActive && (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>
                    <CameraOffIcon style={{ width: '28px', height: '28px', margin: '0 auto 0.5rem' }} />
                    <span style={{ fontSize: '0.8125rem' }}>ปิดกล้องอยู่</span>
                  </div>
                )}
              </div>

              {/* Camera Actions Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', height: '34px' }}
                  onClick={() => setCameraActive(!cameraActive)}
                >
                  {cameraActive ? (
                    <>
                      <CameraOffIcon className="btn-icon" />
                      <span>ปิดกล้อง</span>
                    </>
                  ) : (
                    <>
                      <CameraIcon className="btn-icon" />
                      <span>เปิดกล้อง</span>
                    </>
                  )}
                </button>

                {cameraActive && (
                  <button
                    type="button"
                    className="secondary-button"
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', height: '34px' }}
                    onClick={() => setCameraFacing(prev => (prev === 'environment' ? 'user' : 'environment'))}
                  >
                    <RefreshIcon className="btn-icon" />
                    <span>สลับกล้อง ({cameraFacing === 'environment' ? 'หลัง' : 'หน้า'})</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Upload Image File */}
          {activeTab === 'upload' && (
            <div>
              <button
                type="button"
                style={{
                  width: '100%',
                  border: '2px dashed #cbd5e1',
                  borderRadius: '10px',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  background: '#f8fafc',
                  cursor: 'pointer',
                  marginBottom: '0.75rem',
                  display: 'block',
                }}
                onClick={() => fileInputRef.current?.click()}
                aria-label="เลือกไฟล์รูปภาพ QR Code เพื่อสแกน"
              >
                <QrCodeIcon style={{ width: '36px', height: '36px', color: '#64748b', margin: '0 auto 0.5rem' }} />
                <strong style={{ display: 'block', fontSize: '0.875rem', color: '#334155', marginBottom: '0.25rem' }}>
                  คลิกเพื่อเลือกรูปภาพ หรือลากไฟล์มาวางที่นี่
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  รองรับไฟล์ภาพ .png, .jpg, .jpeg, .webp (ภาพถ่ายหน้าจอบัตรหรือไฟล์ QR Code)
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadImageFile(file);
                  }}
                />
              </button>
            </div>
          )}

          {/* Tab 3: Manual Input & Samples */}
          {activeTab === 'manual' && (
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleInspect(manualCode);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}
              >
                <div className="form-field" style={{ margin: 0 }}>
                  <label htmlFor="inspector-manual-code" style={{ fontSize: '0.8125rem', color: '#334155' }}>
                    รหัส QR Payload / รหัสบัตร / รหัสคำสั่งซื้อ:
                  </label>
                  <input
                    id="inspector-manual-code"
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    className="text-input"
                    placeholder="เช่น TKT-QR-..., TK-..., หรือ ORD-..."
                    style={{ fontSize: '0.875rem', height: '38px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="submit"
                    className="primary-button"
                    style={{ flex: 1, height: '38px', fontSize: '0.8125rem' }}
                    disabled={loading || !manualCode.trim()}
                  >
                    {loading ? (
                      <>
                        <RefreshIcon className="spin-icon btn-icon" />
                        <span>กำลังตรวจสอบ...</span>
                      </>
                    ) : (
                      <>
                        <SearchIcon className="btn-icon" />
                        <span>ตรวจสอบข้อมูลบัตร</span>
                      </>
                    )}
                  </button>

                  {manualCode && (
                    <button
                      type="button"
                      className="secondary-button"
                      style={{ height: '38px', padding: '0 0.75rem', fontSize: '0.8125rem' }}
                      onClick={() => setManualCode('')}
                    >
                      <span>ล้าง</span>
                    </button>
                  )}
                </div>
              </form>

              {/* Sample Tickets Quick Selector */}
              {samples.length > 0 && (
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '0.5rem' }}>
                    ดึงบัตรตัวอย่างในระบบมาทดสอบทันที:
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {samples.map((s) => (
                      <button
                        key={s.ticketCode}
                        type="button"
                        onClick={() => {
                          setManualCode(s.ticketCode);
                          void handleInspect(s.ticketCode);
                        }}
                        style={{
                          textAlign: 'left',
                          padding: '0.45rem 0.6rem',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.75rem',
                        }}
                      >
                        <div>
                          <strong style={{ color: '#1e293b', display: 'block' }}>{s.ticketCode}</strong>
                          <span style={{ color: '#64748b' }}>{s.eventTitle} ({s.ticketTypeName})</span>
                        </div>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background: s.admissionStatus === 'inside' ? '#fef3c7' : '#dcfce7',
                            color: s.admissionStatus === 'inside' ? '#92400e' : '#166534',
                          }}
                        >
                          {s.admissionStatus === 'inside' ? 'เข้างานแล้ว' : 'พร้อมใช้'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions at bottom of scanner box */}
          {result && (
            <div style={{ marginTop: '1rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem' }}>
              <button
                type="button"
                className="secondary-button"
                style={{ width: '100%', height: '36px', fontSize: '0.8125rem', justifyContent: 'center' }}
                onClick={resetForNextScan}
              >
                <RefreshIcon className="btn-icon" />
                <span>สแกนใบถัดไป</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Inspection Result Card */}
        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* 1. Main Status Banner */}
            <div
              style={{
                borderRadius: '12px',
                padding: '1.25rem',
                border: '1px solid',
                backgroundColor: !result.found
                  ? '#fef2f2'
                  : result.ticket?.status !== 'valid'
                  ? '#fef2f2'
                  : result.ticket.admissionStatus === 'inside'
                  ? '#fffbeb'
                  : '#f0fdf4',
                borderColor: !result.found
                  ? '#fecaca'
                  : result.ticket?.status !== 'valid'
                  ? '#fecaca'
                  : result.ticket.admissionStatus === 'inside'
                  ? '#fde68a'
                  : '#bbf7d0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {!result.found || result.ticket?.status !== 'valid' ? (
                    <CrossCircleIcon style={{ width: '32px', height: '32px', color: '#dc2626' }} />
                  ) : result.ticket.admissionStatus === 'inside' ? (
                    <ClockIcon style={{ width: '32px', height: '32px', color: '#d97706' }} />
                  ) : (
                    <CheckCircleIcon style={{ width: '32px', height: '32px', color: '#16a34a' }} />
                  )}

                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#0f172a' }}>
                      {!result.found
                        ? 'ไม่พบข้อมูลบัตรในระบบ (Invalid Ticket)'
                        : result.ticket?.status === 'refunded'
                        ? 'บัตรถูกขอคืนเงินแล้ว (Refunded - โมฆะ)'
                        : result.ticket?.status === 'cancelled'
                        ? 'บัตรถูกยกเลิกแล้ว (Cancelled - โมฆะ)'
                        : result.ticket?.admissionStatus === 'inside'
                        ? 'บัตรนี้ถูกสแกนเข้างานไปแล้ว (Already Admitted)'
                        : 'บัตรถูกต้อง สมบูรณ์ พร้อมใช้งาน (Valid Ticket)'}
                    </h3>
                    <p style={{ margin: '0.15rem 0 0', fontSize: '0.8125rem', color: '#475569' }}>
                      {!result.found
                        ? 'รหัสหรือ QR Code ที่สแกนไม่ตรงกับฐานข้อมูลคอนเสิร์ต อาจเป็นบัตรไม่ถูกต้องหรือบัตรปลอม'
                        : result.ticket?.status !== 'valid'
                        ? 'บัตรใบนี้อยู่ในสถานะโมฆะ ไม่สามารถใช้ผ่านประตูเข้างานได้'
                        : result.ticket?.admissionStatus === 'inside'
                        ? 'มีบันทึกการเข้างานแล้ว หากต้องการให้ออกงานหรือสแกนซ้ำ กรุณาตรวจสอบประวัติ'
                        : 'บัตรแท้ของแท้จากระบบ ผู้ถือบัตรสามารถผ่านประตูเข้าชมการแสดงได้'}
                    </p>
                  </div>
                </div>

                {result.found && result.ticket && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: result.ticket.status === 'valid' ? '#dcfce7' : '#fee2e2',
                        color: result.ticket.status === 'valid' ? '#15803d' : '#b91c1c',
                      }}
                    >
                      สถานะ: {result.ticket.status}
                    </span>
                    <span
                      style={{
                        padding: '0.35rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background: result.ticket.admissionStatus === 'inside' ? '#fef3c7' : '#e0f2fe',
                        color: result.ticket.admissionStatus === 'inside' ? '#92400e' : '#0369a1',
                      }}
                    >
                      การเข้างาน: {result.ticket.admissionStatus === 'inside' ? 'อยู่ในงาน (Inside)' : 'อยู่นอกงาน (Outside)'}
                    </span>
                  </div>
                )}
              </div>

              {!result.found && (
                <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: '#ffffff', borderRadius: '6px', fontSize: '0.75rem', color: '#64748b' }}>
                  <strong>รหัสดิบที่ถอดรหัสได้ (Raw Decoded):</strong> {result.rawInput}
                </div>
              )}
            </div>

            {/* 2. Detailed Ticket Information Cards */}
            {result.found && result.ticket && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {/* Event & Session Card */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    {result.ticket.event.posterUrl ? (
                      <Image
                        src={result.ticket.event.posterUrl}
                        alt="Event poster"
                        width={60}
                        height={80}
                        unoptimized
                        style={{ borderRadius: '6px', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '60px', height: '80px', background: '#f1f5f9', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                        <TicketIcon style={{ width: '24px', height: '24px' }} />
                      </div>
                    )}

                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', fontSize: '0.95rem', color: '#0f172a', marginBottom: '0.2rem' }}>
                        {result.ticket.event.title}
                      </strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginBottom: '0.2rem' }}>
                        สถานที่: {result.ticket.event.location}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: '#64748b' }}>
                        ผู้จัดงาน: {result.ticket.event.organizerName}
                      </span>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.75rem' }}>
                    <strong style={{ display: 'block', fontSize: '0.8125rem', color: '#334155', marginBottom: '0.35rem' }}>
                      รอบการแสดง:
                    </strong>
                    <div style={{ fontSize: '0.75rem', color: '#475569', lineHeight: 1.6 }}>
                      <div>วันเวลาแสดง: {result.ticket.session.startTime} ถึง {result.ticket.session.endTime}</div>
                      {result.ticket.session.admissionStartTime && (
                        <div>เวลาประตูเปิด: {result.ticket.session.admissionStartTime} ถึง {result.ticket.session.admissionEndTime}</div>
                      )}
                      <div style={{ marginTop: '0.25rem' }}>
                        <span
                          style={{
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            background: result.ticket.session.isAdmissionOpen ? '#dcfce7' : '#f1f5f9',
                            color: result.ticket.session.isAdmissionOpen ? '#166534' : '#64748b',
                          }}
                        >
                          {result.ticket.session.isAdmissionOpen ? 'กำลังอยู่ในช่วงเวลาประตูเปิดเข้างาน' : 'ยังไม่ถึงเวลาหรือประตูเข้างานปิดแล้ว'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Zone & Ticket Type Card */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <strong style={{ display: 'block', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                    ข้อมูลบัตรและโซนที่นั่ง
                  </strong>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>รหัสบัตร (Ticket Code):</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <strong style={{ color: '#0f172a' }}>{result.ticket.ticketCode}</strong>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(result.ticket?.ticketCode || '', 'คัดลอกรหัสบัตรแล้ว')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.75rem', color: '#2563eb' }}
                        >
                          คัดลอก
                        </button>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>โซน / ประเภทบัตร:</span>
                      <strong style={{ color: '#0f172a' }}>{result.ticket.zone.name}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>ราคาหน้าบัตร:</span>
                      <strong style={{ color: '#0f172a' }}>{result.ticket.price.toLocaleString('th-TH')} บาท</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>ประเภทการออกบัตร:</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: result.ticket.order.isDirectTicket ? '#fdf4ff' : '#f0fdf4',
                          color: result.ticket.order.isDirectTicket ? '#86198f' : '#166534',
                          border: `1px solid ${result.ticket.order.isDirectTicket ? '#f0abfc' : '#bbf7d0'}`,
                        }}
                      >
                        {result.ticket.order.isDirectTicket ? 'บัตรออกตรงพิเศษ (Direct Ticket)' : 'การสั่งซื้อปกติ (Checkout Order)'}
                      </span>
                    </div>

                    {result.ticket.order.directTicketInfo?.referenceNote && (
                      <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#f8fafc', padding: '0.4rem', borderRadius: '4px' }}>
                        หมายเหตุการออกบัตร: {result.ticket.order.directTicketInfo.referenceNote}
                      </div>
                    )}
                  </div>
                </div>

                {/* Order & Buyer Card */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <strong style={{ display: 'block', fontSize: '0.875rem', color: '#0f172a', marginBottom: '0.5rem' }}>
                    ข้อมูลคำสั่งซื้อและผู้ถือบัตร
                  </strong>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.8125rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>รหัสคำสั่งซื้อ:</span>
                      <strong style={{ color: '#0f172a' }}>{result.ticket.order.id}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>ชื่อผู้ซื้อ/ผู้ถือบัตร:</span>
                      <strong style={{ color: '#0f172a' }}>{result.ticket.order.buyerName}</strong>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>อีเมล:</span>
                      <span style={{ color: '#0f172a' }}>{result.ticket.order.buyerEmail}</span>
                    </div>

                    {result.ticket.order.buyerPhone && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>เบอร์โทรศัพท์:</span>
                        <span style={{ color: '#0f172a' }}>{result.ticket.order.buyerPhone}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#64748b' }}>ช่องทางการชำระเงิน:</span>
                      <span style={{ color: '#0f172a' }}>{result.ticket.order.paymentMethod}</span>
                    </div>

                    {result.ticket.order.paidAt && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748b' }}>วันที่ชำระเงิน:</span>
                        <span style={{ color: '#0f172a' }}>{result.ticket.order.paidAt}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admission Logs History */}
                <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem', color: '#0f172a' }}>
                      ประวัติการสแกนบัตรใบนี้ ({result.ticket.admissionLogs.length} รายการ)
                    </strong>
                  </div>

                  {result.ticket.admissionLogs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {result.ticket.admissionLogs.map((log) => (
                        <div
                          key={log.id}
                          style={{
                            padding: '0.45rem 0.6rem',
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: log.action === 'entry' ? '#166534' : '#0369a1' }}>
                              {log.action === 'entry' ? 'เข้างาน (Entry)' : 'ออกจากงาน (Exit)'}
                            </span>
                            <span style={{ color: '#64748b', marginLeft: '0.5rem' }}>โดย {log.scannerName}</span>
                          </div>
                          <span style={{ color: '#94a3b8' }}>{log.createdAt}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.75rem' }}>
                      ยังไม่มีประวัติการสแกนผ่านประตูเข้างานสำหรับบัตรใบนี้
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Copy Feedback Toast */}
            {copyFeedback && (
              <div
                style={{
                  position: 'fixed',
                  bottom: '1.5rem',
                  right: '1.5rem',
                  background: '#0f172a',
                  color: '#ffffff',
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.8125rem',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  zIndex: 9999,
                }}
              >
                {copyFeedback}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
