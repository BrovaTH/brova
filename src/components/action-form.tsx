"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { Modal } from "./modal";

export type ActionResult = { ok: true; message?: string } | { ok: false; message: string };

/**
 * ฟอร์มที่ยิงไปหา Server Action
 *
 * ทุกฟอร์มในระบบใช้ตัวนี้ตัวเดียว จะได้ได้พฤติกรรมเหมือนกันหมด
 *   กันกดซ้ำระหว่างรอ  แสดงข้อความผิดพลาดจากเซิร์ฟเวอร์ตรงจุดเดิม
 *   ถามยืนยันก่อนทำรายการที่ย้อนกลับไม่ได้
 *
 * ข้อความผิดพลาดมาจากเซิร์ฟเวอร์เสมอ ไม่ใช่จากการเดาฝั่งหน้าจอ
 * ต่อให้มีคนแก้ HTML ในเบราว์เซอร์ กติกาก็ยังอยู่ที่เซิร์ฟเวอร์
 */
export function ActionForm({
  action, children, submitLabel, submitting, confirmTitle, confirmText,
  danger, className = "", compact, onDone,
}: {
  action: (fd: FormData) => Promise<ActionResult | void>;
  children?: ReactNode;
  submitLabel: string;
  submitting?: string;
  /** ถ้าใส่ จะเปิดป็อปอัพถามยืนยันก่อน */
  confirmTitle?: string;
  confirmText?: string;
  danger?: boolean;
  className?: string;
  compact?: boolean;
  onDone?: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const ref = useRef<HTMLFormElement>(null);

  function run(fd: FormData) {
    setErr(null);
    setOk(null);
    start(async () => {
      try {
        const res = await action(fd);
        if (res && res.ok === false) setErr(res.message);
        else {
          if (res && res.message) setOk(res.message);
          ref.current?.reset();
          onDone?.();
        }
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "ทำรายการไม่สำเร็จ");
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (confirmText && !ask) {
      setAsk(true);
      return;
    }
    run(fd);
  }

  return (
    <>
      <form ref={ref} onSubmit={onSubmit} className={className}>
        {children}

        {err && (
          <p className="mt-3 border border-signal-bad/30 bg-signal-badbg px-3 py-2 text-[12px] leading-relaxed text-signal-bad">
            {err}
          </p>
        )}
        {ok && (
          <p className="mt-3 border border-signal-ok/30 bg-signal-okbg px-3 py-2 text-[12px] text-signal-ok">
            {ok}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`${danger ? "btn-danger" : "btn-solid"} ${compact ? "px-3 py-1.5" : ""} ${
            children ? "mt-4" : ""
          }`}
        >
          {pending ? (submitting ?? "กำลังทำรายการ…") : submitLabel}
        </button>
      </form>

      <Modal
        open={ask}
        onClose={() => setAsk(false)}
        title={confirmTitle ?? "ยืนยันการทำรายการ"}
      >
        <p className="leading-relaxed">{confirmText}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setAsk(false)}>
            ย้อนกลับ
          </button>
          <button
            type="button"
            className={danger ? "btn-danger" : "btn-solid"}
            onClick={() => {
              const fd = new FormData(ref.current!);
              setAsk(false);
              run(fd);
            }}
          >
            ยืนยัน
          </button>
        </div>
      </Modal>
    </>
  );
}

/** ปุ่มเดี่ยวที่ยิง Server Action โดยไม่มีช่องกรอก */
export function ActionButton({
  action, label, hidden, confirmText, confirmTitle, danger, compact, className,
}: {
  action: (fd: FormData) => Promise<ActionResult | void>;
  label: string;
  hidden?: Record<string, string | number | undefined | null>;
  confirmText?: string;
  confirmTitle?: string;
  danger?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <ActionForm
      action={action}
      submitLabel={label}
      confirmText={confirmText}
      confirmTitle={confirmTitle}
      danger={danger}
      compact={compact}
      className={className ?? "inline-block"}
    >
      {hidden &&
        Object.entries(hidden).map(([k, v]) =>
          v === undefined || v === null ? null : (
            <input key={k} type="hidden" name={k} value={String(v)} />
          ),
        )}
    </ActionForm>
  );
}
