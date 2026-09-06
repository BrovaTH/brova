import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * ตัวเชื่อมฐานข้อมูลฝั่งเซิร์ฟเวอร์
 *
 * ใช้กุญแจสาธารณะเท่านั้น  ห้ามเอา service_role มาไว้ในแอปเด็ดขาด
 * เพราะกุญแจนั้นข้าม RLS ได้ทั้งหมด  ถ้าหลุดคือเห็นข้อมูลลูกค้าทุกราย
 */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return store.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            store.set({ name, value, ...options });
          } catch {
            // เรียกจาก Server Component ตั้งคุกกี้ไม่ได้ ปล่อยให้ middleware จัดการต่อ
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            store.set({ name, value: "", ...options });
          } catch {
            /* เหมือนด้านบน */
          }
        },
      },
    },
  );
}

/** ผู้ใช้ที่ล็อกอินอยู่ พร้อมข้อมูลบทบาท */
export async function currentProfile() {
  const sb = supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth?.user) return null;
  const { data } = await sb
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();
  return data ?? null;
}

export async function isOwner() {
  const p = await currentProfile();
  return p?.role === "owner" && p?.active === true;
}
