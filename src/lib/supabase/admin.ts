import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * ตัวเชื่อมระดับผู้ดูแลระบบ
 *
 * ใช้กุญแจ service_role ซึ่งข้ามกฎความปลอดภัยระดับแถวได้ทั้งหมด
 * จึงต้องใช้เฉพาะฝั่งเซิร์ฟเวอร์ และเฉพาะสามงานนี้เท่านั้น
 *   สร้างและตั้งรหัสผ่านผู้ใช้
 *   รับข้อมูลที่ไลน์ยิงเข้ามา ซึ่งไม่มีผู้ใช้ล็อกอินอยู่
 *   งานสรุปประจำวันที่เครื่องเรียกเอง
 *
 * ตัวแปรนี้ห้ามมีคำว่า NEXT_PUBLIC นำหน้าเด็ดขาด
 * ถ้ามี เบราว์เซอร์จะเห็นด้วย แล้วใครก็อ่านและแก้ข้อมูลลูกค้าได้ทั้งหมด
 */
export function adminClient(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const ADMIN_MISSING =
  "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์ " +
  "ให้ไปเพิ่มที่ Vercel > Settings > Environment Variables แล้ว deploy ใหม่";
