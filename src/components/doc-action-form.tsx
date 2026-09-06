"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionResult } from "./action-form";

// ============================================================================
// ฟอร์มที่ออกเอกสารแล้วพาไปดูของจริงทันที
//
// ต่างจาก ActionForm ธรรมดาตรงที่ไม่ได้จบด้วยข้อความว่าสำเร็จ
// แต่พาผู้ใช้ไปที่หน้าเอกสารที่เพิ่งออกเลย
//
// เหตุผลคือคนกดปุ่มออกเอกสารเพราะอยากได้ตัวเอกสาร ไม่ได้อยากได้ข้อความ
// ถ้าจบแค่ข้อความ เขาต้องไปไล่หาเองว่าใบที่เพิ่งออกอยู่ตรงไหน
// และไม่มีทางรู้ว่าสิ่งที่ออกมาหน้าตาถูกต้องหรือเปล่าจนกว่าจะเปิดดู
// ============================================================================

export function DocActionForm({
  action, submitLabel, submitting, basePath, children, className = "", danger,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  submitLabel: string;
  submitting?: string;
  /**
   * ที่อยู่ของหน้าเอกสารโดยยังไม่มี id ต่อท้าย เช่น "/docs/quotation"
   *
   * ต้องเป็นข้อความ ไม่ใช่ฟังก์ชัน เพราะหน้าที่เรียกใช้เป็นฝั่งเซิร์ฟเวอร์
   * แต่ตัวนี้ทำงานฝั่งเบราว์เซอร์ ส่งฟังก์ชันข้ามกันแบบนั้นไม่ได้
   */
  basePath: string;
  children?: ReactNode;
  className?: string;
  danger?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);

    start(async () => {
      try {
        const res = await action(fd);

        if (!res.ok) {
          setErr(res.message);
          return;
        }

        // ปกติจะได้ id กลับมาเสมอ แต่ถ้าไม่ได้ก็ยังถือว่าทำรายการสำเร็จ
        // แค่พาไปไม่ได้ จึงรีเฟรชหน้าเดิมให้เห็นผลแทนการค้างอยู่เฉย ๆ
        if (res.id) router.push(`${basePath}/${res.id}`);
        else router.refresh();
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
      }
    });
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children}

      {err && (
        <p className="mt-3 border border-signal-bad/30 bg-signal-badbg px-3 py-2 text-[12px] leading-relaxed text-signal-bad">
          {err}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${danger ? "btn-danger" : "btn-solid"} ${children ? "mt-4" : ""}`}
      >
        {pending ? (submitting ?? "กำลังออกเอกสาร…") : submitLabel}
      </button>
    </form>
  );
}
