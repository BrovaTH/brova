import { supabaseServer, currentProfile } from "@/lib/supabase/server";
import { PageHead, Stat, Section, Note, Table, Td, Tag, LinkBtn } from "@/components/ui";
import {
  ChartFrame, Legend, StackedBars, Funnel, HBars, KpiTable, BU_FILL,
  type StackPoint, type Kpi,
} from "@/components/chart";
import { money, num } from "@/lib/format";

export const dynamic = "force-dynamic";

// ============================================================================
// หน้ารายงาน — มุมมองผู้บริหาร
//
// หน้าภาพรวมตอบว่า "วันนี้ต้องแตะอะไร"  หน้านี้ตอบคนละคำถาม คือ
// "ธุรกิจกำลังไปทางไหน"  จึงมองย้อนหลังหกเดือนแทนที่จะมองแค่วันนี้
//
// ตัวเลขทุกช่องคำนวณสดจากงานจริงในฐานข้อมูล ไม่มีค่าที่พิมพ์ค้างไว้
// ถ้าช่องไหนเป็นศูนย์ แปลว่ายังไม่มีข้อมูลจริงพอ ไม่ใช่ระบบพัง
// ============================================================================

const TH_MONTH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

/** หกเดือนล่าสุดรวมเดือนนี้ เรียงจากเก่าไปใหม่ */
function lastSixMonths(): { key: string; label: string }[] {
  const now = new Date();
  const out: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${TH_MONTH[d.getMonth()]} ${String((d.getFullYear() + 543) % 100).padStart(2, "0")}`,
    });
  }
  return out;
}

/**
 * ทำวันที่ให้เป็นรูปแบบเดียวกันเสมอ คือ ปี-เดือน-วัน แบบสากล
 *
 * จำเป็นเพราะวันที่เดินทางมาถึงหน้านี้ได้สองแบบ  จากฐานข้อมูลจริงมาเป็นข้อความ
 * แต่ถ้าต่อฐานข้อมูลตรง ๆ มันมาเป็นวัตถุวันที่  ถ้าเอาไปตัดตัวอักษรตรง ๆ
 * แบบหลังจะได้คำว่า "Wed Aug" แทนที่จะได้ "2026-08" แล้วกราฟจะว่างทั้งที่มียอดขาย
 */
function isoOf(v: unknown): string {
  if (!v) return "";
  if (v instanceof Date) {
    // ใช้เวลาไทยในการตัดเดือน ไม่ใช้ UTC เพราะงานที่เปิดตอนดึกจะตกเดือนผิด
    return new Date(v.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  }
  return String(v).slice(0, 10);
}

function monthKey(v: unknown): string {
  return isoOf(v).slice(0, 7);
}

export default async function ReportsPage() {
  const sb = supabaseServer();
  const me = await currentProfile();
  const canSeeCost = me?.can_see_cost === true;

  const [
    { data: jobs }, { data: bus }, { data: customers },
    { data: inquiries }, { data: quotes }, { data: prod }, { data: qc },
  ] = await Promise.all([
    sb.from("jobs_view").select("*"),
    sb.from("business_units").select("*").order("code"),
    sb.from("customers").select("id, name, source"),
    sb.from("inquiries").select("id, status, created_at"),
    sb.from("quotations").select("id, code, status"),
    sb.from("production_logs").select("qty_in, qty_defect"),
    sb.from("qc_records").select("checked_qty, pass_qty"),
  ]);

  const J = jobs ?? [];
  const BU = bus ?? [];
  const months = lastSixMonths();

  // ------------------------------------------------------------ ยอดขายรายเดือนแยกหน่วยธุรกิจ
  const buCodes = BU.map((b) => b.code as string);
  const stack: StackPoint[] = months.map((m) => ({
    label: m.label,
    parts: buCodes.map((code) => ({
      key: code,
      value: J.filter((j) => monthKey(j.created_at) === m.key && j.bu_code === code)
              .reduce((a, j) => a + Number(j.total_amount ?? 0), 0),
    })),
  }));

  const thisMonth = months[months.length - 1].key;
  const salesThisMonth = J.filter((j) => monthKey(j.created_at) === thisMonth)
                          .reduce((a, j) => a + Number(j.total_amount ?? 0), 0);
  const targetMonth = BU.reduce((a, b) => a + Number(b.target_revenue_month ?? 0), 0);

  const salesAll = J.reduce((a, j) => a + Number(j.total_amount ?? 0), 0);
  const costAll = J.reduce((a, j) => a + Number(j.cost_estimate ?? 0), 0);
  const grossPct = salesAll > 0 ? ((salesAll - costAll) / salesAll) * 100 : 0;

  // ------------------------------------------------------------ กรวยการขาย
  const inq = inquiries ?? [];
  const issuedQuotes = (quotes ?? []).filter((q) => q.code);
  const closed = J.filter((j) => j.status === "99");
  const funnel = [
    { label: "คำขอราคาเข้ามา", value: inq.length, hint: "บรีฟที่บันทึกไว้ทั้งหมด" },
    { label: "ออกใบเสนอราคา", value: issuedQuotes.length, hint: "ใบที่ออกเลขแล้ว" },
    { label: "ลูกค้าตกลง เปิดเป็นงาน", value: J.length, hint: "ใบงานที่เปิดจริง" },
    { label: "ปิดงานเรียบร้อย", value: closed.length, hint: "ส่งของและเก็บเงินครบ" },
  ];

  // ------------------------------------------------------------ ช่องทางที่ลูกค้าเข้ามา
  const custSource = new Map<string, string>();
  for (const c of customers ?? []) custSource.set(c.id as string, (c.source as string) ?? "ไม่ระบุ");
  const byChannel = new Map<string, number>();
  for (const j of J) {
    const src = custSource.get(j.customer_id as string) ?? "ไม่ระบุ";
    byChannel.set(src, (byChannel.get(src) ?? 0) + Number(j.total_amount ?? 0));
  }
  const channelRows = Array.from(byChannel.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // ------------------------------------------------------------ ตัวชี้วัดเทียบเป้า
  // ส่งตรงเวลา นับจากวันที่ของถึงมือลูกค้า เทียบกับวันที่รับปากไว้
  // เทียบกันที่ระดับวัน ไม่เทียบเวลา เพราะรับปากลูกค้าเป็นวัน ไม่ได้รับปากเป็นชั่วโมง
  const shipped = J.filter((j) => j.delivered_at && j.promised_date);
  const onTime = shipped.filter((j) => isoOf(j.delivered_at) <= isoOf(j.promised_date));
  const onTimePct = shipped.length > 0 ? (onTime.length / shipped.length) * 100 : 0;

  const P = prod ?? [];
  const qtyIn = P.reduce((a, p) => a + Number(p.qty_in ?? 0), 0);
  const qtyDefect = P.reduce((a, p) => a + Number(p.qty_defect ?? 0), 0);
  const defectPct = qtyIn > 0 ? (qtyDefect / qtyIn) * 100 : 0;

  const Q = qc ?? [];
  const checked = Q.reduce((a, q) => a + Number(q.checked_qty ?? 0), 0);
  const passed = Q.reduce((a, q) => a + Number(q.pass_qty ?? 0), 0);
  const qcPct = checked > 0 ? (passed / checked) * 100 : 0;

  // ปิดการขายได้ นับจากใบเสนอราคาที่ลูกค้าตอบตกลง หารด้วยใบที่ส่งออกไปทั้งหมด
  // ไม่นับจากจำนวนใบงาน เพราะงานบางงานเปิดตรงโดยไม่ผ่านใบเสนอราคา
  // ถ้าเอาใบงานมาหาร ตัวเลขจะทะลุ 100% ได้ ซึ่งอ่านแล้วไม่มีความหมาย
  const acceptedQuotes = issuedQuotes.filter((q) => q.status === "Accepted").length;
  const winPct = issuedQuotes.length > 0 ? (acceptedQuotes / issuedQuotes.length) * 100 : 0;

  const kpis: Kpi[] = [
    {
      label: "ส่งตรงเวลา", value: onTimePct, target: 95, higherBetter: true, unit: "%",
      hint: `นับจากงานที่ส่งถึงมือลูกค้าแล้ว ${shipped.length} งาน`,
    },
    {
      label: "ผ่านตรวจคุณภาพ", value: qcPct, target: 95, higherBetter: true, unit: "%",
      hint: `ตรวจไปแล้ว ${num(checked)} ตัว ผ่าน ${num(passed)} ตัว`,
    },
    {
      label: "อัตราของเสียในการผลิต", value: defectPct, target: 3, higherBetter: false, unit: "%",
      hint: `เข้าไลน์ ${num(qtyIn)} ตัว เสีย ${num(qtyDefect)} ตัว`,
    },
    {
      label: "ปิดการขายได้จากใบเสนอราคา", value: winPct, target: 40, higherBetter: true, unit: "%",
      hint: `ส่งใบเสนอราคา ${issuedQuotes.length} ใบ ลูกค้าตกลง ${acceptedQuotes} ใบ`,
    },
  ];

  if (canSeeCost) {
    kpis.splice(0, 0, {
      label: "กำไรขั้นต้นเฉลี่ย", value: grossPct, target: 35, higherBetter: true, unit: "%",
      hint: `ยอดขายสะสม ${money(salesAll, 0)} บาท ต้นทุน ${money(costAll, 0)} บาท`,
    });
  }

  // ------------------------------------------------------------ ลูกค้ารายใหญ่
  const byCustomer = new Map<string, { name: string; amount: number; jobs: number }>();
  for (const j of J) {
    const id = String(j.customer_id ?? "-");
    const cur = byCustomer.get(id) ?? { name: String(j.customer_name ?? "ไม่ระบุ"), amount: 0, jobs: 0 };
    cur.amount += Number(j.total_amount ?? 0);
    cur.jobs += 1;
    byCustomer.set(id, cur);
  }
  const topCustomers = Array.from(byCustomer.values())
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
  const topShare = salesAll > 0 && topCustomers[0] ? (topCustomers[0].amount / salesAll) * 100 : 0;

  return (
    <>
      <PageHead
        eyebrow="รายงาน · มุมมองผู้บริหาร"
        title="REPORTS"
        lead="ธุรกิจกำลังไปทางไหน ทุกตัวเลขคำนวณสดจากงานจริงในระบบ ไม่มีค่าที่พิมพ์ค้างไว้"
        right={<LinkBtn href="/">กลับหน้าภาพรวม</LinkBtn>}
      />

      {/* ------------------------------------------------------------ ตัวเลขหลัก */}
      <Section title="ตัวเลขหลัก" hint="เทียบเดือนนี้กับเป้าที่ตั้งไว้ในหน่วยธุรกิจ">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="ยอดขายเดือนนี้" value={money(salesThisMonth, 0)} unit="บาท"
            tone={targetMonth > 0 && salesThisMonth < targetMonth ? "bad" : undefined}
            hint={
              targetMonth > 0
                ? `เป้า ${money(targetMonth, 0)} บาท · ทำได้ ${money((salesThisMonth / targetMonth) * 100, 0)}%`
                : "ยังไม่ได้ตั้งเป้าในหน่วยธุรกิจ"
            }
          />
          <Stat
            label="ยอดขายสะสมทั้งหมด" value={money(salesAll, 0)} unit="บาท"
            hint={`จากงานทั้งหมด ${J.length} งาน`}
          />
          {canSeeCost ? (
            <Stat
              label="กำไรขั้นต้นเฉลี่ย" value={money(grossPct, 1)} unit="%"
              tone={grossPct < 35 ? "bad" : undefined}
              hint={`เป้าไม่ต่ำกว่า 35% · เป็นเงิน ${money(salesAll - costAll, 0)} บาท`}
            />
          ) : (
            <Stat label="งานที่ปิดแล้ว" value={num(closed.length)} unit="งาน"
                  hint={`จากงานทั้งหมด ${J.length} งาน`} />
          )}
          <Stat
            label="ส่งตรงเวลา" value={money(onTimePct, 1)} unit="%"
            tone={shipped.length > 0 && onTimePct < 95 ? "bad" : undefined}
            hint={`เป้าไม่ต่ำกว่า 95% · นับจาก ${shipped.length} งานที่ส่งถึงแล้ว`}
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------ กราฟ */}
      <Section title="ยอดขายย้อนหลังหกเดือน">
        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartFrame
              title="ยอดขายรายเดือน แยกตามหน่วยธุรกิจ"
              hint="นับจากยอดงานที่เปิดในเดือนนั้น ตัวเลขบนแท่งคือยอดรวมของเดือน"
              legend={
                <Legend
                  items={BU.map((b) => ({
                    label: `${b.code} ${b.name}`,
                    fill: BU_FILL[b.code as string] ?? "#8A8681",
                  }))}
                />
              }
            >
              <StackedBars data={stack} fills={BU_FILL} />
            </ChartFrame>
          </div>

          <ChartFrame
            title="ช่องทางที่ลูกค้าเข้ามา"
            hint="ยอดขายรวมแยกตามที่มาของลูกค้า บอกว่าควรลงแรงกับช่องทางไหน"
          >
            <HBars rows={channelRows} />
          </ChartFrame>
        </div>
      </Section>

      <Section title="กรวยการขายและตัวชี้วัด">
        <div className="grid gap-3 lg:grid-cols-2">
          <ChartFrame
            title="กรวยการขาย"
            hint="ลูกค้าหลุดหายมากที่สุดตรงขั้นไหน ตรงนั้นคือที่ที่ควรแก้ก่อน"
          >
            <Funnel steps={funnel} />
          </ChartFrame>

          <ChartFrame
            title="ตัวชี้วัดเทียบเป้า"
            hint="แถบแดงคือยังไม่ถึงเป้า ไม่ต้องไปไล่หาเอง หน้านี้บอกให้แล้ว"
          >
            <KpiTable rows={kpis} />
          </ChartFrame>
        </div>
      </Section>

      {/* ------------------------------------------------------------ ลูกค้ารายใหญ่ */}
      <Section
        title="ลูกค้ารายใหญ่"
        hint="ถ้าลูกค้ารายเดียวกินสัดส่วนมากเกินไป เสียลูกค้ารายนั้นคือสะเทือนทั้งบริษัท"
      >
        {topShare > 30 && (
          <div className="mb-3">
            <Note tone="warn" title={`ลูกค้ารายใหญ่ที่สุดคิดเป็น ${money(topShare, 1)}% ของยอดขายทั้งหมด`}>
              เกิน 30% แล้ว ควรเร่งหาลูกค้ารายใหม่มาถ่วงไว้
              เพราะถ้าลูกค้ารายนี้หยุดสั่ง รายได้จะหายไปเกือบครึ่งทันที
            </Note>
          </div>
        )}
        <Table head={["ลูกค้า", "จำนวนงาน", "ยอดขายรวม", "สัดส่วน"]} empty="ยังไม่มีงานในระบบ">
          {topCustomers.map((c) => {
            const share = salesAll > 0 ? (c.amount / salesAll) * 100 : 0;
            return (
              <tr key={c.name} className="border-b border-line-soft last:border-0">
                <Td>{c.name}</Td>
                <Td><span className="tnum">{num(c.jobs)}</span></Td>
                <Td align="right"><span className="tnum">{money(c.amount, 0)}</span></Td>
                <Td align="right">
                  <Tag tone={share > 30 ? "warn" : "mute"}>{money(share, 1)}%</Tag>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Section>

      <Note tone="info" title="ตัวเลขในหน้านี้มาจากไหน">
        ยอดขายนับจากยอดรวมของใบงาน กำไรขั้นต้นคิดจากต้นทุนที่บันทึกไว้ในใบงานเดียวกัน
        ส่งตรงเวลานับเฉพาะงานที่ยืนยันว่าลูกค้าได้รับของแล้ว และของเสียคิดจากบันทึกการผลิตทุกสถานี
        ถ้าอยากให้ตัวเลขตรงกว่านี้ ให้ทีมบันทึกต้นทุนและผลผลิตให้ครบทุกงาน
      </Note>
    </>
  );
}
