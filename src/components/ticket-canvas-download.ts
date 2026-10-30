import type { TicketDetail } from '@/server/tickets';
import { formatBaht } from '@/lib/locale';

/**
 * Renders a high-resolution 1200 x 500 px ticket stub on HTML5 Canvas.
 * Supports custom organizer ticket template background or default concert theme.
 */
export async function generateTicketCanvas(ticket: TicketDetail): Promise<HTMLCanvasElement> {
  const width = 1200;
  const height = 500;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not supported');

  // 1. Draw Background Image (Custom Template or Poster or Default Gradient)
  const bgUrl = ticket.ticketTemplateUrl || ticket.eventPosterUrl;
  let bgLoaded = false;
  if (bgUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = bgUrl;
      });
      ctx.drawImage(img, 0, 0, width, height);
      bgLoaded = true;
    } catch {
      bgLoaded = false;
    }
  }

  if (!bgLoaded) {
    // Elegant Dark Concert Theme
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.5, '#1e1b4b');
    grad.addColorStop(1, '#090d16');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Decorative subtle accent curves
    ctx.save();
    ctx.beginPath();
    ctx.arc(200, 250, 260, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(700, 200, 320, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(99, 102, 241, 0.07)';
    ctx.fill();
    ctx.restore();
  } else {
    // Subtle gradient overlay for custom background to guarantee readability
    const overlay = ctx.createLinearGradient(0, 0, width, 0);
    overlay.addColorStop(0, 'rgba(15, 23, 42, 0.88)');
    overlay.addColorStop(0.68, 'rgba(15, 23, 42, 0.82)');
    overlay.addColorStop(0.72, 'rgba(15, 23, 42, 0.94)');
    overlay.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Ticket Outline & Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, width - 2, height - 2);

  // 3. Stub Divider with Notch at X = 860px
  const stubX = 860;
  const notchRadius = 24;

  ctx.save();
  ctx.fillStyle = '#0b0f19'; // Cutout matching page background
  ctx.beginPath();
  ctx.arc(stubX, 0, notchRadius, 0, Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(stubX, height, notchRadius, Math.PI, 0);
  ctx.fill();

  // Dashed separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(stubX, notchRadius + 4);
  ctx.lineTo(stubX, height - notchRadius - 4);
  ctx.stroke();
  ctx.restore();

  // 4. MAIN STUB (Left Side: X = 50 to 820)
  // Status Badge: "พร้อมใช้งาน"
  ctx.save();
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.roundRect(50, 40, 110, 32, 16);
  ctx.fill();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('พร้อมใช้งาน', 105, 56);
  ctx.restore();

  // Brand tag
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('CONCERT PASS · DIGITAL TICKET', 175, 61);

  // Event Title
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  const displayTitle = ticket.eventTitle.length > 28 ? `${ticket.eventTitle.slice(0, 26)}...` : ticket.eventTitle;
  ctx.fillText(displayTitle, 50, 125);

  // Zone / Ticket Type Header
  ctx.font = 'bold 28px sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`${ticket.ticketTypeName} · ${formatBaht(ticket.ticketPrice)}`, 50, 175);

  // Session Date & Time
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('วันและเวลาแสดง (DATE & TIME)', 50, 235);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#f1f5f9';
  const showDate = new Date(ticket.sessionStartTime).toLocaleString('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  ctx.fillText(showDate, 50, 265);

  // Location
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('สถานที่จัดงาน (VENUE)', 460, 235);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#f1f5f9';
  const displayLocation = ticket.location.length > 24 ? `${ticket.location.slice(0, 22)}...` : ticket.location;
  ctx.fillText(displayLocation, 460, 265);

  // Buyer Info
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('ผู้สั่งซื้อ (BUYER)', 50, 335);
  ctx.font = 'bold 19px sans-serif';
  ctx.fillStyle = '#f1f5f9';
  ctx.fillText(ticket.buyerName, 50, 365);

  // Order ID
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.fillText('หมายเลขคำสั่งซื้อ (ORDER ID)', 460, 335);
  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(ticket.orderId, 460, 365);

  // Footer Disclaimer
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.fillText('* กรุณาแสดง QR Code ต่อเจ้าหน้าที่เพื่อสแกนเข้างาน · บัตรนี้สามารถสแกนได้ 1 ครั้ง', 50, 445);

  // 5. SCAN STUB (Right Side: X = 880 to 1180)
  const qrFrameX = 930;
  const qrFrameY = 55;
  const qrFrameSize = 210;

  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.roundRect(qrFrameX, qrFrameY, qrFrameSize, qrFrameSize, 14);
  ctx.fill();
  ctx.restore();

  // Draw QR Image
  if (ticket.qrCodeUrl) {
    try {
      const qrImg = new Image();
      await new Promise<void>((resolve, reject) => {
        qrImg.onload = () => resolve();
        qrImg.onerror = () => reject();
        qrImg.src = ticket.qrCodeUrl;
      });
      ctx.drawImage(qrImg, qrFrameX + 15, qrFrameY + 15, qrFrameSize - 30, qrFrameSize - 30);
    } catch {
      ctx.fillStyle = '#0f172a';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(ticket.ticketCode, qrFrameX + qrFrameSize / 2, qrFrameY + qrFrameSize / 2);
    }
  }

  // Ticket Code Badge below QR
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('รหัสบัตรสำหรับเข้างาน (TICKET CODE)', stubX + 170, 315);

  ctx.font = 'bold 24px monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(ticket.ticketCode, stubX + 170, 350);

  // Admission instruction
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fillText('สแกนเข้าชมงาน', stubX + 170, 410);
  ctx.font = 'bold 14px sans-serif';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('SCAN FOR ENTRY', stubX + 170, 432);

  return canvas;
}

export async function downloadTicketAsPng(ticket: TicketDetail): Promise<void> {
  const canvas = await generateTicketCanvas(ticket);
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `ticket-${ticket.ticketCode}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadAllTicketsAsPng(tickets: TicketDetail[]): Promise<void> {
  for (let i = 0; i < tickets.length; i++) {
    await downloadTicketAsPng(tickets[i]);
    if (i < tickets.length - 1) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
}
