import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { supabaseServer } from "@/lib/supabase/server";
import { Wordmark } from "@/components/logo";
import { StepBar } from "@/components/step-art";
import { PUBLIC_STEPS, publicStep, isTrouble } from "@/lib/workflow";
import { thDate, thDateTime, num } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ติดตามงาน · BROVA",
  robots: { index: false, follow: false },
};

/**
 * หน้าที่ลูกค้าเห็น
 *
 * หน้านี้เปิดได้โดยไม่ต้องเข้าสู่ระบบ จึงต้องระวังเป็นพิเศษ
 * ข้อมูลทั้งหมดมาจากฟังก์ชัน get_job_tracking และ get_job_timeline ในฐานข้อมูล
 * ซึ่งคืนเฉพาะฟิลด์ที่ปลอดภัยเท่านั้น
 *
 * สิ่งที่ลูกค้าจะไม่มีวันเห็นจากหน้านี้
 *   ต้นทุน กำไร ชื่อโรงงานหรือซัพพลายเออร์ บันทึกภายใน
 *   ยอดเงินของงานอื่น และข้อมูลลูกค้ารายอื่น
 *
 * รหัสในลิงก์เป็นค่าสุ่ม ไม่ใช่เลขเรียง จึงเดาลิงก์ของงานอื่นไม่ได้
 */
export default async function TrackPage({ params }: { params: { token: string } }) {
  const sb = supabaseServer();

  const [{ data: rows }, { data: timeline }] = await Promise.all([
    sb.rpc("get_job_tracking", { p_token: params.token }),
    sb.rpc("get_job_timeline", { p_token: params.token }),
  ]);

  const job = Array.isArray(rows) ? rows[0] : rows;
  if (!job) notFound();

  // ขั้นที่ลูกค้าเห็นคำนวณจากสถานะภายใน ลูกค้าไม่เห็นรหัสสถานะจริง
  const step = publicStep(job.status);
  const current = PUBLIC_STEPS.find((s) => s.step === step);
  const held = isTrouble(job.status);

  // ไทม์ไลน์ภายในมีหลายสิบบรรทัด ยุบให้เหลือเจ็ดขั้นที่ลูกค้าเข้าใจ
  // เก็บเวลาที่เข้าขั้นนั้นครั้งแรก
  const seen = new Map<number, string>();
  for (const t of (timeline ?? []) as { to_status: string; created_at: string }[]) {
    const st = publicStep(t.to_status);
    if (!seen.has(st)) seen.set(st, t.created_at);
  }
  const steps = PUBLIC_STEPS.filter((s) => seen.has(s.step)).map((s) => ({
    step: s.step,
    label: s.th,
    at: seen.get(s.step)!,
  }));

  return (
    <div className="min-h-screen bg-bone">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Wordmark />
          <span className="text-[11px] uppercase tracking-wide2 text-ink/35">ติดตามงาน</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-9">
        <p className="text-[11px] uppercase tracking-wide2 text-ink/40">
          งานเลขที่ {job.code}
        </p>
        <h1 className="mt-1 text-[26px] font-medium leading-tight tracking-display">
          {job.title}
        </h1>
        {job.customer_name && (
          <p className="mt-1 text-[13px] text-ink/55">สำหรับ {job.customer_name}</p>
        )}

        {/* -------------------------------------------------------- ขั้นตอน */}
        <section className="card mt-7 px-5 py-6">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide2 text-ink/40">
                ขั้นที่ {step} จาก 7
              </p>
              <p className="text-[19px] font-medium tracking-display">{current?.th}</p>
              <p className="mt-0.5 text-[13px] text-ink/55">{current?.hint}</p>
            </div>
            {job.promised_date && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide2 text-ink/40">กำหนดส่ง</p>
                <p className="tnum text-[15px]">{thDate(job.promised_date)}</p>
              </div>
            )}
          </div>
          <StepBar current={step} />

          {held && (
            <p className="mt-4 border border-line bg-bone-200/60 px-3 py-2 text-[12px] leading-relaxed text-ink/65">
              งานนี้กำลังรอการยืนยันบางอย่างจากทางเรา
              ทีมงานจะติดต่อกลับไปแจ้งความคืบหน้าให้เร็วที่สุด
            </p>
          )}
        </section>

        {/* -------------------------------------------------------- ข้อมูลงาน */}
        <section className="card mt-4 divide-y divide-line-soft px-5">
          {job.qty_total ? (
            <Row k="จำนวน" v={`${num(job.qty_total)} ตัว`} />
          ) : null}
          {job.carrier && <Row k="ขนส่ง" v={job.carrier} />}
          {job.tracking_no && <Row k="เลขพัสดุ" v={job.tracking_no} mono />}
          {job.shipped_at && <Row k="ส่งออกเมื่อ" v={thDateTime(job.shipped_at)} mono />}
          {job.delivered_at && <Row k="ถึงปลายทางเมื่อ" v={thDateTime(job.delivered_at)} mono />}
        </section>

        {/* -------------------------------------------------------- ไทม์ไลน์ */}
        {steps.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[15px] font-medium tracking-display">ความคืบหน้า</h2>
            <ol className="card divide-y divide-line-soft">
              {steps.map((t, i) => (
                <li key={i} className="flex gap-4 px-5 py-3.5">
                  <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center bg-ink text-[11px] text-bone">
                    {t.step}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px]">{t.label}</span>
                    <span className="block text-[12px] text-ink/45">{thDateTime(t.at)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* -------------------------------------------------------- ติดต่อ */}
        <section className="mt-8 border border-line bg-white px-5 py-5">
          <h2 className="text-[14px] font-medium">มีอะไรอยากถาม</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/60">
            ทักกลับมาที่ช่องทางเดิมที่คุยกันไว้ได้เลย อ้างอิงเลขงาน {job.code}
            จะช่วยให้เราหาเรื่องของคุณเจอเร็วขึ้น
          </p>
        </section>

        <p className="mt-8 text-center text-[11px] leading-relaxed text-ink/35">
          ลิงก์นี้เป็นของงานนี้เท่านั้น และแสดงเฉพาะข้อมูลที่เกี่ยวกับงานของคุณ
          <br />
          BROVA · A Creative Manufacturing Company
        </p>
      </main>
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <span className="text-[12px] text-ink/45">{k}</span>
      <span className={`text-right text-[14px] ${mono ? "tnum" : ""}`}>{v}</span>
    </div>
  );
}
