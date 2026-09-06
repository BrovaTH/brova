"use client";

import { useMemo, useState, useTransition } from "react";
import { num } from "@/lib/format";
import { sizeRank } from "@/lib/workflow";
import type { ActionResult } from "./action-form";

export type CountRow = {
  id: string;
  sku_code: string | null;
  supply_code: string | null;
  item_name: string;
  color_name: string | null;
  size: string | null;
  qty_system: number;
  qty_counted: number | null;
  note: string | null;
};

/**
 * ใบนับสต็อก
 *
 * นับรวมทั้งคลัง แยกไซส์และสี ตามที่ตกลงกันไว้
 * คนนับกรอกยอดที่นับได้จริง ระบบเทียบกับยอดในระบบให้เห็นทันทีว่าต่างเท่าไร
 * ยังไม่แตะสต็อกจนกว่าจะกดปิดรอบ
 */
export function CountSheet({
  rows, readOnly, onSaveRow,
}: {
  rows: CountRow[];
  readOnly?: boolean;
  onSaveRow: (fd: FormData) => Promise<ActionResult | void>;
}) {
  const [local, setLocal] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.id, r.qty_counted === null ? "" : String(r.qty_counted)]),
    ),
  );
  const [saving, setSaving] = useState<Record<string, "ok" | "err" | "busy">>({});
  const [filter, setFilter] = useState<"all" | "todo" | "diff">("all");
  const [q, setQ] = useState("");
  const [, start] = useTransition();

  const sorted = useMemo(
    () =>
      rows.slice().sort((a, b) => {
        const n = (a.item_name ?? "").localeCompare(b.item_name ?? "", "th");
        if (n !== 0) return n;
        const c = (a.color_name ?? "").localeCompare(b.color_name ?? "", "th");
        if (c !== 0) return c;
        return sizeRank(a.size ?? "") - sizeRank(b.size ?? "");
      }),
    [rows],
  );

  const view = sorted.filter((r) => {
    const v = local[r.id];
    const counted = v !== "" && v !== undefined;
    const diff = counted && Number(v) !== r.qty_system;
    if (filter === "todo" && counted) return false;
    if (filter === "diff" && !diff) return false;
    if (q) {
      const hay = `${r.item_name} ${r.color_name ?? ""} ${r.size ?? ""} ${r.sku_code ?? ""}`;
      if (!hay.toLowerCase().includes(q.toLowerCase())) return false;
    }
    return true;
  });

  const stats = useMemo(() => {
    let counted = 0, diffLines = 0, diffQty = 0;
    for (const r of sorted) {
      const v = local[r.id];
      if (v === "" || v === undefined) continue;
      counted++;
      const d = Number(v) - r.qty_system;
      if (d !== 0) {
        diffLines++;
        diffQty += d;
      }
    }
    return { counted, total: sorted.length, diffLines, diffQty };
  }, [sorted, local]);

  function commit(r: CountRow, raw: string) {
    if (readOnly) return;
    const prev = r.qty_counted === null ? "" : String(r.qty_counted);
    if (raw === prev) return;
    setSaving((s) => ({ ...s, [r.id]: "busy" }));
    start(async () => {
      const fd = new FormData();
      fd.set("item_id", r.id);
      fd.set("qty_counted", raw);
      try {
        const res = await onSaveRow(fd);
        setSaving((s) => ({ ...s, [r.id]: res && res.ok === false ? "err" : "ok" }));
      } catch {
        setSaving((s) => ({ ...s, [r.id]: "err" }));
      }
    });
  }

  return (
    <div>
      {/* -------------------------------------------------------- แถบสรุปและตัวกรอง */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="tnum border border-line bg-white px-3 py-1.5 text-[12px]">
          นับแล้ว {num(stats.counted)} / {num(stats.total)} รายการ
        </span>
        <span
          className={`tnum border px-3 py-1.5 text-[12px] ${
            stats.diffLines
              ? "border-signal-warn/30 bg-signal-warnbg text-signal-warn"
              : "border-line bg-white text-ink/55"
          }`}
        >
          ต่างจากระบบ {num(stats.diffLines)} รายการ · {stats.diffQty > 0 ? "+" : ""}
          {num(stats.diffQty)} ชิ้น
        </span>

        <span className="ml-auto flex gap-1">
          {([
            ["all", "ทั้งหมด"],
            ["todo", "ยังไม่นับ"],
            ["diff", "เฉพาะที่ต่าง"],
          ] as const).map(([k, lb]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`border px-3 py-1.5 text-[12px] ${
                filter === k ? "border-ink bg-ink text-bone" : "border-line bg-white hover:border-ink"
              }`}
            >
              {lb}
            </button>
          ))}
        </span>

        <input
          className="field w-full sm:w-48"
          placeholder="ค้นหาชื่อ สี หรือรหัส"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* -------------------------------------------------------- ตารางนับ */}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line bg-bone-200/60">
              {["รายการ", "สี", "ไซส์", "ในระบบ", "นับได้", "ต่าง", ""].map((h, i) => (
                <th
                  key={i}
                  className={`px-3 py-2.5 text-[11px] font-normal uppercase tracking-wide2 text-ink/45 ${
                    i >= 3 ? "text-right" : "text-left"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[13px] text-ink/40">
                  ไม่มีรายการตรงเงื่อนไข
                </td>
              </tr>
            )}
            {view.map((r) => {
              const v = local[r.id] ?? "";
              const counted = v !== "";
              const d = counted ? Number(v) - r.qty_system : 0;
              const st = saving[r.id];
              return (
                <tr
                  key={r.id}
                  className={`border-b border-line-soft last:border-0 ${
                    counted && d !== 0 ? "bg-signal-warnbg/40" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    {r.item_name}
                    {r.sku_code && (
                      <span className="ml-2 text-[11px] text-ink/35">{r.sku_code}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink/70">{r.color_name ?? "—"}</td>
                  <td className="px-3 py-2 text-ink/70">{r.size ?? "—"}</td>
                  <td className="tnum px-3 py-2 text-right text-ink/60">{num(r.qty_system)}</td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      inputMode="numeric"
                      className="field w-24 text-right"
                      value={v}
                      disabled={readOnly}
                      onChange={(e) => setLocal((s) => ({ ...s, [r.id]: e.target.value }))}
                      onBlur={(e) => commit(r, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>
                  <td
                    className={`tnum px-3 py-2 text-right ${
                      !counted ? "text-ink/25" : d === 0 ? "text-signal-ok" : "text-signal-warn"
                    }`}
                  >
                    {!counted ? "—" : d === 0 ? "ตรง" : `${d > 0 ? "+" : ""}${num(d)}`}
                  </td>
                  <td className="px-3 py-2 text-right text-[11px] text-ink/40">
                    {st === "busy" ? "…" : st === "ok" ? "บันทึกแล้ว" : st === "err" ? "ผิดพลาด" : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-ink/45">
        กรอกแล้วกด Enter หรือคลิกออกจากช่องเพื่อบันทึก · ยอดในคลังจะยังไม่เปลี่ยนจนกว่าจะปิดรอบนับ
      </p>
    </div>
  );
}
