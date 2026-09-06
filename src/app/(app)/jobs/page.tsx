import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Section, Table, Td, Tag, LinkBtn, statusTone } from "@/components/ui";
import { money, num, thDate, daysBetween, todayISO } from "@/lib/format";
import { statusTh, statusPhase, isTrouble, isClosed, BUS } from "@/lib/workflow";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "open", th: "ที่ยังเปิดอยู่" },
  { key: "trouble", th: "ติดปัญหา" },
  { key: "late", th: "เลยกำหนด" },
  { key: "unpaid", th: "ยังค้างเงิน" },
  { key: "closed", th: "ปิดแล้ว" },
  { key: "all", th: "ทั้งหมด" },
] as const;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: { filter?: string; bu?: string; q?: string };
}) {
  const sb = supabaseServer();
  const { data } = await sb
    .from("jobs_view")
    .select("*")
    .order("created_at", { ascending: false });

  const all = data ?? [];
  const filter = searchParams.filter ?? "open";
  const bu = searchParams.bu ?? "";
  const q = (searchParams.q ?? "").trim().toLowerCase();

  let rows = all;
  if (filter === "open") rows = all.filter((j) => !isClosed(j.status));
  else if (filter === "trouble") rows = all.filter((j) => isTrouble(j.status));
  else if (filter === "late")
    rows = all.filter((j) => !isClosed(j.status) && j.due_date && daysBetween(todayISO(), j.due_date) > 0);
  else if (filter === "unpaid") rows = all.filter((j) => Number(j.outstanding ?? 0) > 0);
  else if (filter === "closed") rows = all.filter((j) => isClosed(j.status));

  if (bu) rows = rows.filter((j) => j.bu_code === bu);
  if (q)
    rows = rows.filter((j) =>
      `${j.code} ${j.title} ${j.customer_name ?? ""}`.toLowerCase().includes(q),
    );

  const count = (k: string) => {
    if (k === "all") return all.length;
    if (k === "open") return all.filter((j) => !isClosed(j.status)).length;
    if (k === "trouble") return all.filter((j) => isTrouble(j.status)).length;
    if (k === "late")
      return all.filter((j) => !isClosed(j.status) && j.due_date && daysBetween(todayISO(), j.due_date) > 0).length;
    if (k === "unpaid") return all.filter((j) => Number(j.outstanding ?? 0) > 0).length;
    return all.filter((j) => isClosed(j.status)).length;
  };

  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ filter, ...(bu ? { bu } : {}), ...(q ? { q } : {}) });
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    return `/jobs?${p.toString()}`;
  };

  return (
    <>
      <PageHead
        eyebrow="ใบงาน"
        title="งานทั้งหมด"
        lead="กรองด้วยปุ่มด้านล่าง หรือค้นด้วยเลขที่งาน ชื่องาน หรือชื่อลูกค้า"
        right={<LinkBtn href="/jobs/new" solid>เปิดใบงานใหม่</LinkBtn>}
      />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={qs({ filter: f.key })}
            className={`border px-3 py-1.5 text-[12px] ${
              filter === f.key
                ? "border-ink bg-ink text-bone"
                : "border-line bg-white text-ink/65 hover:border-ink"
            }`}
          >
            {f.th}
            <span className="tnum ml-1.5 opacity-60">{count(f.key)}</span>
          </Link>
        ))}

        <span className="ml-auto flex flex-wrap gap-2">
          <Link
            href={qs({ bu: "" })}
            className={`border px-3 py-1.5 text-[12px] ${
              !bu ? "border-ink bg-ink text-bone" : "border-line bg-white text-ink/65 hover:border-ink"
            }`}
          >
            ทุกหน่วยธุรกิจ
          </Link>
          {BUS.map((b) => (
            <Link
              key={b.code}
              href={qs({ bu: b.code })}
              className={`border px-3 py-1.5 text-[12px] ${
                bu === b.code
                  ? "border-ink bg-ink text-bone"
                  : "border-line bg-white text-ink/65 hover:border-ink"
              }`}
            >
              {b.th}
            </Link>
          ))}
        </span>
      </div>

      <form className="mb-4" action="/jobs">
        <input type="hidden" name="filter" value={filter} />
        {bu && <input type="hidden" name="bu" value={bu} />}
        <input
          name="q"
          defaultValue={q}
          className="field max-w-md"
          placeholder="ค้นหาเลขที่งาน ชื่องาน หรือชื่อลูกค้า"
        />
      </form>

      <Section title={`พบ ${num(rows.length)} งาน`}>
        <Table
          head={["ใบงาน", "ลูกค้า", "ขั้น", "สถานะ", "กำหนดส่ง", "ยอดงาน", "ค้างชำระ"]}
          empty="ไม่มีงานตรงเงื่อนไขที่เลือก"
        >
          {rows.map((j) => {
            const late = j.due_date && !isClosed(j.status) ? daysBetween(todayISO(), j.due_date) : 0;
            return (
              <tr key={j.id} className="border-b border-line-soft last:border-0 hover:bg-bone-200/50">
                <Td>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="underline decoration-line-hard underline-offset-4 hover:decoration-ink"
                  >
                    <span className="tnum">{j.code}</span>
                  </Link>
                  <span className="mt-0.5 block text-[12px] text-ink/55">{j.title}</span>
                </Td>
                <Td>{j.customer_name ?? "—"}</Td>
                <Td><span className="text-[12px] text-ink/55">{statusPhase(j.status)}</span></Td>
                <Td><Tag tone={statusTone(j.status)}>{statusTh(j.status)}</Tag></Td>
                <Td>
                  {j.due_date ? (
                    <span className={late > 0 ? "text-signal-bad" : ""}>
                      {thDate(j.due_date)}
                      {late > 0 && <span className="ml-1 text-[11px]">เลย {late} วัน</span>}
                    </span>
                  ) : "—"}
                </Td>
                <Td align="right"><span className="tnum">{money(j.total_amount, 0)}</span></Td>
                <Td align="right">
                  <span className={`tnum ${Number(j.outstanding ?? 0) > 0 ? "text-signal-warn" : "text-ink/35"}`}>
                    {Number(j.outstanding ?? 0) > 0 ? money(j.outstanding, 0) : "ครบ"}
                  </span>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>
    </>
  );
}
