"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ROLE_TH, type Role } from "@/lib/workflow";

/** สร้างรหัสผ่านสุ่มที่พิมพ์ตามได้ง่าย ไม่มีตัวที่สับสนอย่าง 0 O l 1 */
function makePassword(): string {
  const abc = "abcdefghjkmnpqrstuvwxyz";
  const ABC = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const num = "23456789";
  const all = abc + ABC + num;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let out = pick(ABC) + pick(abc) + pick(num);
  for (let i = 0; i < 7; i++) out += pick(all);
  return out;
}

function Msg({ m }: { m: { ok: boolean; text: string } | null }) {
  if (!m) return null;
  return (
    <p
      className={`mt-3 border px-3 py-2 text-[12px] leading-relaxed ${
        m.ok
          ? "border-signal-ok/30 bg-signal-okbg text-signal-ok"
          : "border-signal-bad/30 bg-signal-badbg text-signal-bad"
      }`}
    >
      {m.text}
    </p>
  );
}

// ============================================================================
export function UserForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [password, setPassword] = useState(makePassword);
  const [done, setDone] = useState<{ email: string; password: string } | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "").trim();
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: String(fd.get("full_name") ?? ""),
          role: String(fd.get("role") ?? "sales"),
        }),
      });
      const out = await res.json().catch(() => ({ message: "ตอบกลับผิดรูปแบบ" }));
      if (!res.ok || !out.ok) {
        setMsg({ ok: false, text: out.message ?? "สร้างผู้ใช้ไม่สำเร็จ" });
        return;
      }
      setDone({ email, password });
      router.refresh();
    });
  }

  if (done) {
    return (
      <div>
        <p className="mb-3 border border-signal-ok/30 bg-signal-okbg px-3 py-2 text-[13px] text-signal-ok">
          สร้างผู้ใช้แล้ว ส่งสองบรรทัดนี้ให้เจ้าตัว
        </p>
        <div className="border border-line bg-bone-200/50 p-4">
          <p className="text-[11px] uppercase tracking-wide2 text-ink/40">อีเมล</p>
          <p className="tnum mb-3 text-[15px]">{done.email}</p>
          <p className="text-[11px] uppercase tracking-wide2 text-ink/40">รหัสผ่านชั่วคราว</p>
          <p className="tnum text-[15px]">{done.password}</p>
        </div>
        <button
          type="button"
          className="btn-solid mt-4"
          onClick={() => {
            navigator.clipboard?.writeText(`อีเมล ${done.email}\nรหัสผ่าน ${done.password}`);
          }}
        >
          คัดลอกไปส่งให้เจ้าตัว
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-ink/45">
          รหัสนี้แสดงครั้งเดียว ปิดหน้านี้แล้วดูย้อนไม่ได้
          ถ้าลืมให้กดตั้งรหัสผ่านใหม่จากรายการผู้ใช้
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">ชื่อที่จะแสดงในระบบ</span>
          <input name="full_name" className="field" required placeholder="เช่น มานี ฝ่ายบัญชี" />
        </label>
        <label className="block">
          <span className="label">อีเมลที่ใช้เข้าระบบ</span>
          <input name="email" type="email" className="field" required placeholder="name@company.com" />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="label">บทบาท</span>
        <select name="role" className="field" defaultValue="sales">
          {(Object.keys(ROLE_TH) as Role[]).map((r) => (
            <option key={r} value={r}>{ROLE_TH[r]}</option>
          ))}
        </select>
      </label>

      <label className="mt-3 block">
        <span className="label">รหัสผ่านชั่วคราว</span>
        <div className="flex gap-2">
          <input className="field tnum" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="btn-ghost shrink-0"
                  onClick={() => setPassword(makePassword())}>
            สุ่มใหม่
          </button>
        </div>
      </label>

      <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
        ระบบสร้างรหัสให้อัตโนมัติแบบที่พิมพ์ตามง่าย ไม่มีตัวที่สับสนอย่างเลขศูนย์กับตัวโอ
        พิมพ์เองก็ได้ ยาวอย่างน้อยแปดตัว บัญชีใช้งานได้ทันทีไม่ต้องยืนยันอีเมล
      </p>

      <Msg m={msg} />

      <button type="submit" disabled={pending} className="btn-solid mt-4">
        {pending ? "กำลังสร้าง…" : "สร้างผู้ใช้"}
      </button>
    </form>
  );
}

// ============================================================================
export function PasswordForm({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [password, setPassword] = useState(makePassword);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password }),
      });
      const out = await res.json().catch(() => ({ message: "ตอบกลับผิดรูปแบบ" }));
      if (!res.ok || !out.ok) {
        setMsg({ ok: false, text: out.message ?? "ตั้งรหัสใหม่ไม่สำเร็จ" });
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit}>
      <p className="mb-3 leading-relaxed text-ink/70">
        ตั้งรหัสผ่านใหม่ให้ {name} แล้วส่งรหัสนี้ให้เจ้าตัวไปเปลี่ยนเองทีหลังได้
      </p>

      <label className="block">
        <span className="label">รหัสผ่านใหม่</span>
        <div className="flex gap-2">
          <input className="field tnum" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="btn-ghost shrink-0" onClick={() => setPassword(makePassword())}>
            สุ่มใหม่
          </button>
        </div>
      </label>

      {done && (
        <p className="mt-3 border border-signal-ok/30 bg-signal-okbg px-3 py-2 text-[12px] text-signal-ok">
          ตั้งรหัสผ่านใหม่แล้ว ส่งรหัสด้านบนให้เจ้าตัวได้เลย
        </p>
      )}
      <Msg m={msg} />

      <button type="submit" disabled={pending} className="btn-solid mt-4">
        {pending ? "กำลังตั้งรหัส…" : "ตั้งรหัสผ่านใหม่"}
      </button>
    </form>
  );
}
