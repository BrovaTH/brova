import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * หน้าที่เปิดได้โดยไม่ต้องล็อกอิน
 *
 * /api ต้องอยู่ในรายการนี้ด้วย เพราะเส้นทางฝั่ง API ตรวจสิทธิ์เองอยู่แล้ว
 *   /api/users        ตอนระบบยังไม่มีใครเลยต้องเรียกได้เพื่อตั้งบัญชีเจ้าของคนแรก
 *                     หลังจากนั้นตรวจว่าเป็นเจ้าของก่อนทุกครั้ง
 *   /api/line/webhook ไลน์เป็นคนยิงเข้ามา ตรวจด้วยลายเซ็นของไลน์
 *   /api/cron/daily   Vercel เป็นคนเรียก ตรวจด้วยรหัสลับใน CRON_SECRET
 * ถ้าไม่ใส่ไว้ ตัวกันหน้าจะเด้งไปหน้าล็อกอิน แล้วผู้เรียกจะได้ HTML แทน JSON
 */
const PUBLIC = ["/login", "/track", "/auth", "/api", "/_next", "/favicon", "/brova"];

function isPublic(path: string) {
  return PUBLIC.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          req.cookies.set({ name, value: "", ...options });
          res = NextResponse.next({ request: { headers: req.headers } });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );

  // ต่ออายุ session ทุกครั้งที่มีคนเปิดหน้า
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;

  if (!data?.user && !isPublic(path)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  if (data?.user && path === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
