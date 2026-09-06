"use client";

import { useState, useTransition } from "react";
import { money, num } from "@/lib/format";
import { Modal } from "./modal";
import type { ActionResult } from "./action-form";

export type ReceiveRow = {
  id: string;
  seq: number;
  item_name: string;
  sku_code: string | null;
  supply_code: string | null;
  color_name: string | null;
  size: string | null;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
};

/**
 * หน้ารับของเข้าคลังจากใบสั่งซื้อ
 *
 * รับบางส่วนได้ รับครบทั้งใบก็ได้
 * เพดานคือยอดที่ยังค้างรับ ระบบตรวจซ้ำที่เซิร์ฟเวอร์เสมอ
 * ต่อให้มีคนแก้ค่า max ในเบราว์เซอร์ ก็ยังรับเกินไม่ได้
 */
export function ReceiveForm({
  rows, poCode, readOnly, onReceive,
}: {
  rows: ReceiveRow[];
  poCode: string;
  readOnly?: boolean;
  onReceive: (fd: FormData) => Promise<ActionResult | void>;
}) {
  const outstanding = rows.map((r) => Math.max(0, r.qty_ordered - r.qty_received));
  const totalOutstanding = outstanding.reduce((a, b) => a + b, 0);

  const [vals, setVals] = useState<string[]>(() => rows.map(() => ""));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [askAll, setAskAll] = useState(false);

  const entered = vals.reduce((a, v) => a + (Number(v) || 0), 0);
  const enteredValue = rows.reduce(
    (a, r, i) => a + (Number(vals[i]) || 0) * r.unit_cost,
    0,
  );

  function submit(all: boolean) {
    setMsg(null);
    const fd = new FormData();
    fd.set("po_code", poCode);
    rows.forEach((r, i) => {
      const q = all ? outstanding[i] : Number(vals[i]) || 0;
      if (q > 0) fd.append(`qty_${r.id}`, String(q));
    });
    let any = false;
    fd.forEach((_v, k) => {
      if (k.startsWith("qty_")) any = true;
    });
    if (!any) {
      setMsg({ ok: false, text: "ยังไม่ได้ใส่จำนวนที่รับเข้า" });
      return;
    }
    start(async () => {
      try {
        const res = await onReceive(fd);
        if (res && res.ok === false) setMsg({ ok: false, text: res.message });
        else {
          setMsg({ ok: true, text: res?.message ?? "รับของเข้าคลังแล้ว" });
          setVals(rows.map(() => ""));
        }
      } catch (e: unknown) {
        setMsg({ ok: false, text: e instanceof Error ? e.message : "รับของไม่สำเร็จ" });
      }
    });
  }

  return (
    <div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-bone-200/60">
              {["รายการ", "ไซส์", "สั่ง", "รับแล้ว", "ค้างรับ", "รับครั้งนี้"].map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide2 text-ink/45 ${
                    i >= 2 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-line-soft last:border-0">
                <td className="px-3 py-2">
                  {r.item_name}
                  {r.color_name && <span className="text-ink/60"> · {r.color_name}</span>}
                  {r.sku_code && (
                    <span className="ml-2 text-[11px] text-ink/35">{r.sku_code}</span>
                  )}
                  <span className="tnum ml-2 text-[11px] text-ink/35">
                    @{money(r.unit_cost)}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink/70">{r.size ?? "—"}</td>
                <td className="tnum px-3 py-2 text-right text-ink/60">{num(r.qty_ordered)}</td>
                <td className="tnum px-3 py-2 text-right text-ink/60">{num(r.qty_received)}</td>
                <td
                  className={`tnum px-3 py-2 text-right ${
                    outstanding[i] > 0 ? "text-signal-warn" : "text-signal-ok"
                  }`}
                >
                  {outstanding[i] > 0 ? num(outstanding[i]) : "ครบ"}
                </td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={outstanding[i]}
                    inputMode="numeric"
                    className="field w-24 text-right"
                    value={vals[i]}
                    disabled={readOnly || outstanding[i] === 0}
                    placeholder="0"
                    onChange={(e) =>
                      setVals((s) => s.map((v, k) => (k === i ? e.target.value : v)))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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

      {!readOnly && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-solid"
            disabled={pending || entered <= 0}
            onClick={() => submit(false)}
          >
            {pending ? "กำลังรับเข้า…" : `รับเข้าตามที่กรอก ${num(entered)} ชิ้น`}
          </button>

          {totalOutstanding > 0 && (
            <button
              type="button"
              className="btn-ghost"
              disabled={pending}
              onClick={() => setAskAll(true)}
            >
              รับครบทั้งใบ {num(totalOutstanding)} ชิ้น
            </button>
          )}

          {entered > 0 && (
            <span className="tnum ml-auto text-[12px] text-ink/55">
              มูลค่าที่รับครั้งนี้ {money(enteredValue)} บาท
            </span>
          )}
        </div>
      )}

      <Modal open={askAll} onClose={() => setAskAll(false)} title="รับครบทั้งใบ">
        <p className="leading-relaxed">
          จะรับของที่ยังค้างทั้งหมด {num(totalOutstanding)} ชิ้น เข้าคลังทันที
          และปิดใบสั่งซื้อ {poCode} เป็นสำเร็จ
        </p>
        <p className="mt-2 leading-relaxed text-ink/60">
          รายการรับเข้าจะถูกบันทึกเป็นการเคลื่อนไหวสต็อก ย้อนดูได้ตลอด แต่ลบไม่ได้
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => setAskAll(false)}>
            ย้อนกลับ
          </button>
          <button
            type="button"
            className="btn-solid"
            onClick={() => {
              setAskAll(false);
              submit(true);
            }}
          >
            ยืนยันรับครบ
          </button>
        </div>
      </Modal>
    </div>
  );
}
