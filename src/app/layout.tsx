import type { Metadata } from 'next';
import '@fontsource/kanit/thai-200.css';
import '@fontsource/kanit/thai-300.css';
import '@fontsource/kanit/thai-400.css';
import '@fontsource/kanit/thai-500.css';
import '@fontsource/kanit/thai-600.css';
import '@fontsource/kanit/thai-700.css';
import '@fontsource/kanit/latin-200.css';
import '@fontsource/kanit/latin-300.css';
import '@fontsource/kanit/latin-400.css';
import '@fontsource/kanit/latin-500.css';
import '@fontsource/kanit/latin-600.css';
import '@fontsource/kanit/latin-700.css';
import './globals.css';
import { SiteShell } from '@/components/site-shell';
import { getSiteOrigin } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
  title: 'TICKET — บัตรคอนเสิร์ต',
  description: 'TICKET พื้นที่สำหรับคอนเสิร์ตและความทรงจำหน้าเวที กำลังเตรียมเปิดให้บริการ',
  openGraph: {
    siteName: 'TICKET',
    locale: 'th_TH',
    type: 'website',
    title: 'TICKET — บัตรคอนเสิร์ต',
    description: 'TICKET พื้นที่สำหรับคอนเสิร์ตและความทรงจำหน้าเวที กำลังเตรียมเปิดให้บริการ',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><SiteShell>{children}</SiteShell></body></html>;
}
