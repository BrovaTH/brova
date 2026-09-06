// ============================================================================
// การ์ด Flex สำหรับแจ้งเตือนเข้าไลน์
//
// โครงเดียวกันทุกใบ  หัวสีเข้มมีชื่อแบรนด์ ตัวเลขใหญ่หนึ่งตัวที่สำคัญที่สุด
// แถวรายละเอียดคั่นด้วยเส้นบาง แล้วปิดท้ายด้วยที่มาของข้อความ
// อ่านจบได้บนจอมือถือโดยไม่ต้องกดเข้าไปดูต่อ
//
// เอกสารรูปแบบ https://developers.line.biz/en/docs/messaging-api/flex-message-elements/
// ============================================================================

const INK = "#111111";
const BONE = "#F5F4F2";
const MUTE = "#8A8580";
const LINE_ = "#E4E1DC";
const OK = "#2E6F4E";
const WARN = "#B5761F";
const BAD = "#B03A3A";
const GOLD = "#E2B341";

export type Tone = "ok" | "warn" | "bad" | "info";

const toneColor = (t: Tone) =>
  t === "ok" ? OK : t === "warn" ? WARN : t === "bad" ? BAD : INK;

export type Row = { label: string; value: string; tone?: Tone; strong?: boolean };
export type RankItem = { name: string; qty?: string };

export type CardInput = {
  /** คำเล็กบนหัวการ์ด เช่นชื่อระบบ */
  brand?: string;
  /** หัวเรื่องใหญ่บนหัวการ์ด */
  title: string;
  /** บรรทัดเล็กใต้หัวเรื่อง */
  subtitle?: string;
  /** ป้ายตัวเลขเด่น เช่น ยอดเงิน */
  bigLabel?: string;
  bigValue?: string;
  bigUnit?: string;
  bigNote?: string;
  bigTone?: Tone;
  /** ข้อความยาวใต้ตัวเลข เช่นเหตุผลที่ขออนุมัติ */
  body?: string;
  rows?: Row[];
  rankTitle?: string;
  rank?: RankItem[];
  /** แถบเตือนท้ายการ์ด */
  alert?: string;
  alertTone?: Tone;
  /** ปุ่มเปิดเข้าระบบ */
  linkLabel?: string;
  linkUrl?: string;
  footer?: string;
};

// ---------------------------------------------------------------- ชิ้นส่วนย่อย
const sep = (m = "md") => ({ type: "separator", margin: m, color: LINE_ });

function textRow(r: Row) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "md",
    contents: [
      { type: "text", text: r.label, size: "sm", color: MUTE, flex: 0 },
      {
        type: "text",
        text: r.value,
        size: "sm",
        align: "end",
        wrap: true,
        color: r.tone ? toneColor(r.tone) : INK,
        weight: r.strong || r.tone ? "bold" : "regular",
      },
    ],
  };
}

function rankRow(item: RankItem, i: number) {
  return {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      {
        type: "text",
        text: String(i + 1),
        size: "sm",
        color: GOLD,
        weight: "bold",
        flex: 0,
      },
      {
        type: "text",
        text: item.name,
        size: "sm",
        color: INK,
        wrap: false,
        margin: "md",
      },
      ...(item.qty
        ? [{ type: "text", text: item.qty, size: "sm", color: MUTE, align: "end", flex: 0 }]
        : []),
    ],
  };
}

// ---------------------------------------------------------------- การ์ดหลัก
export function card(c: CardInput) {
  const body: Record<string, unknown>[] = [];

  if (c.bigValue) {
    if (c.bigLabel) {
      body.push({ type: "text", text: c.bigLabel, size: "sm", color: MUTE });
    }
    body.push({
      type: "box",
      layout: "baseline",
      margin: "xs",
      contents: [
        ...(c.bigUnit
          ? [{
              type: "text",
              text: c.bigUnit,
              size: "xl",
              weight: "bold",
              color: GOLD,
              flex: 0,
            }]
          : []),
        {
          type: "text",
          text: c.bigValue,
          size: "3xl",
          weight: "bold",
          color: c.bigTone ? toneColor(c.bigTone) : INK,
          margin: c.bigUnit ? "xs" : "none",
        },
      ],
    });
    if (c.bigNote) {
      body.push({ type: "text", text: c.bigNote, size: "xs", color: MUTE, margin: "xs", wrap: true });
    }
  }

  if (c.body) {
    if (body.length) body.push(sep("lg"));
    body.push({
      type: "text",
      text: c.body,
      size: "sm",
      color: INK,
      wrap: true,
      margin: body.length ? "lg" : "none",
    });
  }

  if (c.rows?.length) {
    if (body.length) body.push(sep("lg"));
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      contents: c.rows.map(textRow),
    });
  }

  if (c.rank?.length) {
    body.push(sep("lg"));
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      contents: [
        { type: "text", text: c.rankTitle ?? "รายการ", size: "sm", color: MUTE },
        ...c.rank.slice(0, 5).map(rankRow),
      ],
    });
  }

  if (c.alert) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "lg",
      paddingAll: "12px",
      backgroundColor:
        c.alertTone === "bad" ? "#F8E9E9"
        : c.alertTone === "ok" ? "#E7F1EB"
        : "#FBF1DE",
      contents: [
        {
          type: "text",
          text: c.alert,
          size: "sm",
          wrap: true,
          color: toneColor(c.alertTone ?? "warn"),
        },
      ],
    });
  }

  const bubble: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: INK,
      paddingAll: "20px",
      contents: [
        {
          // เว้นช่องไฟด้วยการใส่ช่องว่างระหว่างตัวอักษร ให้อ่านเป็นโลโก้
          type: "text",
          text: (c.brand ?? "BROVA").split("").join(" "),
          size: "xs",
          color: GOLD,
          weight: "bold",
        },
        {
          type: "text",
          text: c.title,
          size: "lg",
          color: BONE,
          weight: "bold",
          wrap: true,
          margin: "sm",
        },
        ...(c.subtitle
          ? [{ type: "text", text: c.subtitle, size: "xs", color: "#B8B3AD", margin: "sm", wrap: true }]
          : []),
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFFFFF",
      paddingAll: "20px",
      contents: body.length ? body : [{ type: "text", text: "—", size: "sm", color: MUTE }],
    },
  };

  const footerContents: Record<string, unknown>[] = [];
  if (c.linkUrl && c.linkLabel) {
    footerContents.push({
      type: "button",
      style: "primary",
      color: INK,
      height: "sm",
      action: { type: "uri", label: c.linkLabel.slice(0, 20), uri: c.linkUrl },
    });
  }
  footerContents.push({
    type: "text",
    text: c.footer ?? "ส่งอัตโนมัติจากระบบหลังบ้าน BROVA",
    size: "xxs",
    color: MUTE,
    align: "center",
    margin: footerContents.length ? "md" : "none",
    wrap: true,
  });

  bubble.footer = {
    type: "box",
    layout: "vertical",
    backgroundColor: "#FFFFFF",
    paddingAll: "16px",
    contents: footerContents,
  };

  return bubble;
}

/** ห่อเป็นข้อความพร้อมส่ง altText คือข้อความที่เห็นในรายการแชตและบนแจ้งเตือน */
export function flexMessage(altText: string, bubble: unknown) {
  return { type: "flex", altText: altText.slice(0, 400), contents: bubble };
}

// ============================================================================
// การ์ดสำเร็จรูปของแต่ละเหตุการณ์
// ============================================================================
const baht = (n: number) => Math.round(Number(n) || 0).toLocaleString("th-TH");

export function cardApprovalNew(a: {
  code: string; kindTh: string; title: string; reason: string;
  amount?: number | null; requester?: string | null; targetCode?: string | null; url?: string;
}) {
  return card({
    title: "มีเรื่องรออนุมัติ",
    subtitle: `${a.code} · ${a.kindTh}`,
    ...(a.amount
      ? { bigLabel: "ผลกระทบเป็นเงิน", bigUnit: "฿", bigValue: baht(a.amount), bigNote: "ยังทำรายการไม่ได้จนกว่าจะอนุมัติ" }
      : {}),
    body: a.title,
    rows: [
      { label: "เหตุผล", value: a.reason.slice(0, 120) },
      { label: "ผู้ยื่น", value: a.requester ?? "—" },
      ...(a.targetCode ? [{ label: "เกี่ยวกับ", value: a.targetCode }] : []),
    ],
    alert: "กดอนุมัติในระบบก่อน ทีมถึงจะทำรายการนี้ได้",
    alertTone: "warn",
    linkLabel: "เปิดหน้าขออนุมัติ",
    linkUrl: a.url,
  });
}

export function cardApprovalDone(a: {
  code: string; kindTh: string; title: string; approved: boolean;
  note?: string | null; decider?: string | null; hours?: number; url?: string;
}) {
  return card({
    title: a.approved ? "เจ้าของอนุมัติแล้ว" : "เจ้าของไม่อนุมัติ",
    subtitle: `${a.code} · ${a.kindTh}`,
    body: a.title,
    rows: [
      { label: "ผล", value: a.approved ? "อนุมัติ" : "ไม่อนุมัติ", tone: a.approved ? "ok" : "bad" },
      { label: "ผู้ตัดสิน", value: a.decider ?? "เจ้าของ" },
      ...(a.note ? [{ label: "บันทึก", value: a.note.slice(0, 120) }] : []),
    ],
    alert: a.approved
      ? `ใบนี้ใช้ได้ครั้งเดียว ภายใน ${a.hours ?? 72} ชั่วโมง เลยเวลาต้องยื่นใหม่`
      : "ถ้ายังจำเป็น ให้แก้เงื่อนไขแล้วยื่นเรื่องใหม่",
    alertTone: a.approved ? "ok" : "bad",
    linkLabel: "เปิดดูในระบบ",
    linkUrl: a.url,
  });
}

export function cardJobLate(a: { jobs: { code: string; title: string; days: number }[]; url?: string }) {
  return card({
    title: "งานเลยกำหนดส่ง",
    subtitle: "ตรวจอัตโนมัติประจำวัน",
    bigLabel: "จำนวนงานที่เลยกำหนด",
    bigValue: String(a.jobs.length),
    bigUnit: "",
    bigNote: "เรียงจากงานที่เลยมานานที่สุด",
    bigTone: "bad",
    rankTitle: "งานที่ต้องตามด่วน",
    rank: a.jobs.slice(0, 5).map((j) => ({ name: `${j.code} ${j.title}`, qty: `เลย ${j.days} วัน` })),
    linkLabel: "เปิดรายการงาน",
    linkUrl: a.url,
  });
}

export function cardInvoiceOverdue(a: {
  count: number; total: number; items: { code: string; name: string; days: number }[]; url?: string;
}) {
  return card({
    title: "ใบวางบิลเลยกำหนดชำระ",
    subtitle: "ตรวจอัตโนมัติประจำวัน",
    bigLabel: "ยอดค้างรวม",
    bigUnit: "฿",
    bigValue: baht(a.total),
    bigNote: `${a.count} ใบ`,
    bigTone: "bad",
    rankTitle: "ใบที่ค้างนานที่สุด",
    rank: a.items.slice(0, 5).map((i) => ({ name: `${i.code} ${i.name}`, qty: `เลย ${i.days} วัน` })),
    linkLabel: "เปิดหน้าการเงิน",
    linkUrl: a.url,
  });
}

export function cardPaymentIn(a: {
  amount: number; invoiceCode: string; customer?: string | null;
  method: string; outstanding: number; by?: string | null; url?: string;
}) {
  return card({
    title: "รับเงินเข้าแล้ว",
    subtitle: a.invoiceCode,
    bigLabel: "ยอดที่รับ",
    bigUnit: "฿",
    bigValue: baht(a.amount),
    bigNote: a.outstanding > 0 ? `ยังค้างอีก ${baht(a.outstanding)} บาท` : "ใบนี้ชำระครบแล้ว",
    bigTone: "ok",
    rows: [
      { label: "ลูกค้า", value: a.customer ?? "—" },
      { label: "วิธีชำระ", value: a.method },
      { label: "ผู้บันทึก", value: a.by ?? "—" },
      {
        label: "คงค้าง",
        value: a.outstanding > 0 ? `${baht(a.outstanding)} บาท` : "ครบแล้ว",
        tone: a.outstanding > 0 ? "warn" : "ok",
      },
    ],
    linkLabel: "เปิดหน้าการเงิน",
    linkUrl: a.url,
  });
}

export function cardStockLow(a: {
  items: { code: string; name: string; available: number; reorder: number }[]; url?: string;
}) {
  return card({
    title: "ของใกล้หมด",
    subtitle: "ต่ำกว่าจุดสั่งซื้อที่ตั้งไว้",
    bigLabel: "จำนวนรหัสที่ต้องเติม",
    bigValue: String(a.items.length),
    bigNote: "ถ้ามีงานเข้ามาตอนนี้อาจรับไม่ได้",
    bigTone: "warn",
    rankTitle: "รหัสที่เหลือน้อยที่สุด",
    rank: a.items.slice(0, 5).map((i) => ({ name: `${i.code} ${i.name}`, qty: `เหลือ ${i.available}` })),
    linkLabel: "เปิดหน้าคลัง",
    linkUrl: a.url,
  });
}

export function cardPoLate(a: {
  items: { code: string; supplier: string; days: number; qty: number }[]; url?: string;
}) {
  return card({
    title: "ใบสั่งซื้อเลยกำหนดรับของ",
    subtitle: "ควรโทรตามร้าน",
    bigLabel: "จำนวนใบที่เลยกำหนด",
    bigValue: String(a.items.length),
    bigTone: "warn",
    rankTitle: "ใบที่ค้างนานที่สุด",
    rank: a.items.slice(0, 5).map((i) => ({
      name: `${i.code} ${i.supplier}`,
      qty: `เลย ${i.days} วัน`,
    })),
    linkLabel: "เปิดหน้าสั่งซื้อ",
    linkUrl: a.url,
  });
}

export function cardQcFail(a: {
  jobCode: string; jobTitle: string; checked: number; pass: number;
  result: string; reasons?: string | null; by?: string | null; url?: string;
}) {
  const failed = a.checked - a.pass;
  return card({
    title: "ตรวจคุณภาพไม่ผ่าน",
    subtitle: `${a.jobCode} · ${a.jobTitle}`,
    bigLabel: "จำนวนที่ไม่ผ่าน",
    bigValue: String(failed),
    bigNote: `จากที่ตรวจ ${a.checked} ตัว`,
    bigTone: "bad",
    rows: [
      { label: "ผลตรวจ", value: a.result, tone: a.result === "ผ่าน" ? "ok" : "bad" },
      { label: "ผ่าน", value: `${a.pass} ตัว` },
      { label: "ผู้ตรวจ", value: a.by ?? "—" },
    ],
    alert: a.reasons ? `สาเหตุ ${a.reasons}` : "ยังแพ็กของไม่ได้จนกว่าจะตรวจผ่าน",
    alertTone: "bad",
    linkLabel: "เปิดใบงาน",
    linkUrl: a.url,
  });
}

export function cardDailySummary(a: {
  dateTh: string;
  openJobs: number; lateJobs: number;
  outstanding: number; overdueCount: number;
  pendingApprovals: number; pendingAmount: number;
  lowStock: number; openPo: number;
  hotJobs: { code: string; title: string; note: string }[];
  url?: string;
}) {
  return card({
    title: "สรุปประจำวัน",
    subtitle: `${a.dateTh} · ระบบหลังบ้าน`,
    bigLabel: "เงินที่ยังเก็บไม่ได้",
    bigUnit: "฿",
    bigValue: baht(a.outstanding),
    bigNote: `เลยกำหนดชำระ ${a.overdueCount} ใบ`,
    bigTone: a.overdueCount > 0 ? "bad" : "ok",
    rows: [
      { label: "งานที่ยังเปิดอยู่", value: `${a.openJobs} งาน` },
      { label: "งานเลยกำหนดส่ง", value: `${a.lateJobs} งาน`, tone: a.lateJobs > 0 ? "bad" : "ok" },
      {
        label: "เรื่องรออนุมัติ",
        value: a.pendingApprovals > 0 ? `${a.pendingApprovals} เรื่อง · ${baht(a.pendingAmount)} บาท` : "ไม่มี",
        tone: a.pendingApprovals > 0 ? "warn" : "ok",
      },
      { label: "ของใกล้หมด", value: `${a.lowStock} รายการ`, tone: a.lowStock > 0 ? "warn" : "ok" },
      { label: "ใบสั่งซื้อค้างรับ", value: `${a.openPo} ใบ` },
    ],
    ...(a.hotJobs.length
      ? {
          rankTitle: "งานที่ต้องแตะก่อน",
          rank: a.hotJobs.slice(0, 5).map((j) => ({ name: `${j.code} ${j.title}`, qty: j.note })),
        }
      : {}),
    ...(a.pendingApprovals > 0
      ? { alert: `มี ${a.pendingApprovals} เรื่องรอเจ้าของตัดสิน ทีมทำรายการนั้นไม่ได้จนกว่าจะกด`, alertTone: "warn" as Tone }
      : {}),
    linkLabel: "เปิดหน้าภาพรวม",
    linkUrl: a.url,
  });
}

export function cardTest(a: { by: string; when: string; url?: string }) {
  return card({
    title: "ทดสอบการแจ้งเตือน",
    subtitle: "ถ้าเห็นข้อความนี้ แปลว่าตั้งค่าถูกแล้ว",
    bigLabel: "สถานะการเชื่อมต่อ",
    bigValue: "สำเร็จ",
    bigTone: "ok",
    rows: [
      { label: "ส่งโดย", value: a.by },
      { label: "เวลา", value: a.when },
    ],
    alert: "จากนี้ระบบจะส่งแจ้งเตือนตามเหตุการณ์ที่เปิดไว้ในหน้าตั้งค่า",
    alertTone: "ok",
    linkLabel: "เปิดระบบ",
    linkUrl: a.url,
  });
}
