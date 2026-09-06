"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { newDraft } from "@/actions/docs";

export function NewDraftForm({ customers }: { customers: { id: string; name: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErr(null);
    start(async () => {
      const res = await newDraft(fd);
      if (!res.ok || !res.id) {
        setErr(res.message);
        return;
      }
      router.push(`/docs/${String(fd.get("doc_type"))}/${res.id}`);
    });
  }

  return (
    <form onSubmit={submit}>
      <label className="mb-3 block">
        <span className="label">ชนิดเอกสาร</span>
        <select name="doc_type" className="field">
          <option value="quotation">ใบเสนอราคา</option>
          <option value="invoice">ใบวางบิล</option>
          <option value="receipt">ใบเสร็จรับเงิน</option>
        </select>
      </label>

      <label className="block">
        <span className="label">ลูกค้า</span>
        <select name="customer_id" className="field">
          <option value="">ยังไม่ระบุ กรอกเองในหน้าถัดไป</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>

      <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
        เลือกลูกค้าแล้วระบบจะคัดลอกชื่อ ที่อยู่ และเลขผู้เสียภาษี มาไว้บนเอกสารเป็นภาพนิ่ง
        แก้ข้อมูลลูกค้าทีหลัง เอกสารเก่าจะไม่เปลี่ยนตาม
      </p>

      {err && (
        <p className="mt-3 border border-signal-bad/30 bg-signal-badbg px-3 py-2 text-[12px] text-signal-bad">
          {err}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-solid mt-4">
        {pending ? "กำลังสร้าง…" : "สร้างร่างแล้วไปหน้าแก้ไข"}
      </button>
    </form>
  );
}
