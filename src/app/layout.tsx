import type { Metadata } from 'next';
import '@fontsource/kanit/thai-400.css';
import '@fontsource/kanit/thai-600.css';
import '@fontsource/kanit/latin-400.css';
import '@fontsource/kanit/latin-600.css';
import './globals.css';
import { SiteShell } from '@/components/site-shell';

export const metadata: Metadata = {
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'TICKET พื้นที่สำหรับคอนเสิร์ตและความทรงจำหน้าเวที กำลังเตรียมเปิดให้บริการ',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><SiteShell>{children}</SiteShell></body></html>;
}
