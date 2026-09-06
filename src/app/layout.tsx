import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BROVA — ระบบหลังบ้าน",
  description: "ระบบจัดการงานผลิตเสื้อ ตั้งแต่รับเรื่องจนปิดงาน",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
