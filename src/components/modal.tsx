"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * ป็อปอัพแสดงข้อมูล
 *
 * ใช้กับสลิปโอนเงิน รายละเอียดใบขออนุมัติ ข้อมูลผ้า และไทม์ไลน์งานฉบับเต็ม
 * หลักการคือดูข้อมูลเพิ่มโดยไม่ต้องออกจากหน้าที่กำลังทำงานอยู่
 */

export function Modal({
  open, onClose, title, subtitle, children, footer, wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ปิดด้วยปุ่ม Escape และล็อกไม่ให้หน้าหลังเลื่อน
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-8 sm:py-14"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} border border-ink bg-white shadow-[0_18px_50px_rgba(0,0,0,.22)]`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[16px] font-medium leading-snug tracking-display">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[12px] text-ink/50">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="shrink-0 border border-line px-2.5 py-1 text-[12px] text-ink/60 hover:border-ink hover:text-ink"
          >
            ปิด
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
          {children}
        </div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-bone-200/50 px-5 py-3">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * ปุ่มที่กดแล้วเปิดป็อปอัพ  ใช้ได้ทันทีจาก Server Component
 * เพราะเนื้อหาข้างในส่งมาเป็น children ที่เรนเดอร์ไว้แล้ว
 */
export function ModalButton({
  label, title, subtitle, children, footer, wide, variant = "link", className = "",
}: {
  label: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  variant?: "link" | "ghost" | "solid";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const cls =
    variant === "solid" ? "btn-solid"
    : variant === "ghost" ? "btn-ghost"
    : "text-[12px] text-ink/60 underline decoration-line-hard underline-offset-4 hover:text-ink hover:decoration-ink";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${cls} ${className}`}>
        {label}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        subtitle={subtitle}
        footer={footer}
        wide={wide}
      >
        {children}
      </Modal>
    </>
  );
}
