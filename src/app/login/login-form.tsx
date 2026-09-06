"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Wordmark } from "@/components/logo";
import { Modal } from "@/components/modal";

/**
 * หน้าเข้าสู่ระบบ
 *
 * ถ้ายังไม่มีผู้ใช้ในระบบเลย จะเปลี่ยนเป็นหน้าตั้งบัญชีเจ้าของคนแรกให้เอง
 * ไม่ต้องไปสร้างผู้ใช้ที่หลังบ้านของ Supabase
 */
function Inner({ hasUser }: { hasUser: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"login" | "setup">(hasUser ? "login" : "setup");
  const [help, setHelp] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function signIn(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setMsg({
          ok: false,
          text:
            error.message === "Invalid login credentials"
              ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง ลองใหม่อีกครั้ง"
              : error.message === "Email not confirmed"
                ? "บัญชีนี้ยังไม่ได้ยืนยันอีเมล ให้เจ้าของสร้างบัญชีใหม่ให้จากหน้าจัดการผู้ใช้"
                : error.message,
        });
        return;
      }
      router.replace(params.get("next") || "/");
      router.refresh();
    });
  }

  function setup(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password !== confirm) {
      setMsg({ ok: false, text: "รหัสผ่านสองช่องไม่ตรงกัน" });
      return;
    }
    start(async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, full_name: fullName, role: "owner" }),
      });
      const out = await res.json().catch(() => ({ message: "ตอบกลับผิดรูปแบบ" }));
      if (!res.ok || !out.ok) {
        setMsg({ ok: false, text: out.message ?? "สร้างบัญชีไม่สำเร็จ" });
        return;
      }
      // สร้างเสร็จแล้วล็อกอินให้เลย ไม่ต้องพิมพ์ซ้ำ
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setMode("login");
        setMsg({ ok: true, text: "สร้างบัญชีแล้ว เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่เพิ่งตั้งได้เลย" });
        return;
      }
      router.replace("/");
      router.refresh();
    });
  }

  const isSetup = mode === "setup";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-block">
            <Wordmark />
          </div>
        </div>

        <form onSubmit={isSetup ? setup : signIn} className="card p-6">
          <h1 className="mb-1 text-[18px] font-medium tracking-display">
            {isSetup ? "ตั้งบัญชีเจ้าของ" : "เข้าสู่ระบบ"}
          </h1>
          <p className="mb-5 text-[12px] leading-relaxed text-ink/50">
            {isSetup
              ? "ยังไม่มีใครในระบบ บัญชีแรกที่สร้างจะได้สิทธิ์เจ้าของ และเป็นคนเดียวที่อนุมัติเรื่องต่าง ๆ ได้"
              : "ระบบหลังบ้านของ BROVA ใช้ได้เฉพาะคนในทีม"}
          </p>

          {isSetup && (
            <label className="mb-3 block">
              <span className="label">ชื่อที่จะแสดงในระบบ</span>
              <input className="field" value={fullName} required
                     onChange={(e) => setFullName(e.target.value)}
                     placeholder="เช่น สมชาย เจ้าของร้าน" />
            </label>
          )}

          <label className="mb-3 block">
            <span className="label">อีเมล</span>
            <input type="email" className="field" value={email} required
                   autoComplete="username"
                   onChange={(e) => setEmail(e.target.value)} />
          </label>

          <label className="block">
            <span className="label">รหัสผ่าน</span>
            <input type="password" className="field" value={password} required
                   autoComplete={isSetup ? "new-password" : "current-password"}
                   onChange={(e) => setPassword(e.target.value)} />
          </label>

          {isSetup && (
            <>
              <label className="mt-3 block">
                <span className="label">พิมพ์รหัสผ่านอีกครั้ง</span>
                <input type="password" className="field" value={confirm} required
                       autoComplete="new-password"
                       onChange={(e) => setConfirm(e.target.value)} />
              </label>
              <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
                ตั้งอย่างน้อย 8 ตัวอักษร จำให้ได้หรือจดเก็บไว้ในที่ปลอดภัย
                ถ้าลืมต้องไปตั้งใหม่ที่หลังบ้านของ Supabase
              </p>
            </>
          )}

          {msg && (
            <p
              className={`mt-3 border px-3 py-2 text-[12px] leading-relaxed ${
                msg.ok
                  ? "border-signal-ok/30 bg-signal-okbg text-signal-ok"
                  : "border-signal-bad/30 bg-signal-badbg text-signal-bad"
              }`}
            >
              {msg.text}
            </p>
          )}

          <button type="submit" disabled={pending} className="btn-solid mt-5 w-full">
            {pending
              ? isSetup ? "กำลังสร้างบัญชี…" : "กำลังเข้าสู่ระบบ…"
              : isSetup ? "สร้างบัญชีและเข้าใช้งาน" : "เข้าสู่ระบบ"}
          </button>

          {hasUser && (
            <button type="button" onClick={() => setHelp(true)}
                    className="mt-3 w-full text-[12px] text-ink/45 underline underline-offset-4 hover:text-ink">
              เข้าไม่ได้ ทำยังไงดี
            </button>
          )}
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink/35">
          ลูกค้าไม่ต้องเข้าสู่ระบบ ใช้ลิงก์ติดตามงานที่ทีมส่งให้ได้เลย
        </p>
      </div>

      <Modal open={help} onClose={() => setHelp(false)} title="เข้าสู่ระบบไม่ได้">
        <div className="space-y-4">
          <div>
            <p className="mb-1 font-medium">ลืมรหัสผ่าน</p>
            <p className="leading-relaxed text-ink/70">
              บอกเจ้าของให้เข้าหน้าจัดการผู้ใช้ แล้วกดตั้งรหัสผ่านใหม่ให้
              ระบบจะให้รหัสใหม่ทันที ไม่ต้องรออีเมล
            </p>
          </div>
          <div>
            <p className="mb-1 font-medium">ขึ้นว่าอีเมลหรือรหัสผ่านไม่ถูกต้อง</p>
            <p className="leading-relaxed text-ink/70">
              ตรวจว่าพิมพ์อีเมลครบและไม่มีเว้นวรรคท้าย
              ถ้ายังไม่ได้ อาจเป็นเพราะบัญชียังไม่ถูกสร้าง ให้ถามเจ้าของว่าเพิ่มให้แล้วหรือยัง
            </p>
          </div>
          <div>
            <p className="mb-1 font-medium">เข้าได้แล้วแต่เห็นเมนูไม่ครบ</p>
            <p className="leading-relaxed text-ink/70">
              เป็นเรื่องปกติ ระบบแสดงเมนูตามบทบาทที่ได้รับ
              ถ้าต้องใช้เมนูที่มองไม่เห็น ให้เจ้าของปรับบทบาทให้ที่หน้าจัดการผู้ใช้
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function LoginForm({ hasUser }: { hasUser: boolean }) {
  return (
    <Suspense>
      <Inner hasUser={hasUser} />
    </Suspense>
  );
}
