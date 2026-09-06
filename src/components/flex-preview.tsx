"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * แสดงการ์ด Flex บนหน้าเว็บ
 *
 * เดินตามโครงสร้าง JSON ตัวเดียวกับที่ส่งเข้าไลน์จริง
 * ไม่ได้วาดใหม่ให้สวยกว่า จะได้เห็นตรงกับที่จะโผล่ในไลน์
 */

type Node = Record<string, unknown>;

const SIZE: Record<string, string> = {
  xxs: "10px", xs: "11px", sm: "13px", md: "14px",
  lg: "17px", xl: "20px", xxl: "24px", "3xl": "30px", "4xl": "36px", "5xl": "44px",
};
const SPACE: Record<string, string> = {
  none: "0", xs: "2px", sm: "4px", md: "8px", lg: "12px", xl: "16px", xxl: "20px",
};

function px(v: unknown, map: Record<string, string>, dflt = "0"): string {
  if (typeof v !== "string") return dflt;
  return map[v] ?? (v.endsWith("px") ? v : dflt);
}

function Text({ n }: { n: Node }) {
  const style: CSSProperties = {
    fontSize: px(n.size, SIZE, "14px"),
    color: (n.color as string) ?? "#111111",
    fontWeight: n.weight === "bold" ? 600 : 300,
    textAlign: (n.align as CSSProperties["textAlign"]) ?? "left",
    marginTop: px(n.margin, SPACE),
    whiteSpace: n.wrap ? "pre-wrap" : "nowrap",
    overflow: n.wrap ? undefined : "hidden",
    textOverflow: n.wrap ? undefined : "ellipsis",
    lineHeight: 1.45,
    flex: n.flex === 0 ? "0 0 auto" : "1 1 auto",
    minWidth: 0,
  };
  return <span style={style}>{String(n.text ?? "")}</span>;
}

function Box({ n }: { n: Node }) {
  const kids = (n.contents as Node[]) ?? [];
  const horizontal = n.layout === "horizontal" || n.layout === "baseline";
  const style: CSSProperties = {
    display: "flex",
    flexDirection: horizontal ? "row" : "column",
    alignItems: n.layout === "baseline" ? "baseline" : horizontal ? "center" : "stretch",
    gap: horizontal ? "8px" : "0",
    marginTop: px(n.margin, SPACE),
    padding: typeof n.paddingAll === "string" ? n.paddingAll : undefined,
    background: (n.backgroundColor as string) ?? undefined,
    minWidth: 0,
  };
  return (
    <div style={style}>
      {kids.map((k, i) => (
        <FlexNode key={i} n={k} />
      ))}
    </div>
  );
}

function FlexNode({ n }: { n: Node }): ReactNode {
  switch (n.type) {
    case "text":
      return <Text n={n} />;
    case "box":
      return <Box n={n} />;
    case "separator":
      return (
        <div
          style={{
            height: 1,
            background: (n.color as string) ?? "#E4E1DC",
            marginTop: px(n.margin, SPACE, "8px"),
          }}
        />
      );
    case "button": {
      const act = (n.action as Node) ?? {};
      return (
        <div
          style={{
            marginTop: px(n.margin, SPACE),
            background: (n.color as string) ?? "#111111",
            color: "#F5F4F2",
            textAlign: "center",
            padding: "9px 12px",
            fontSize: "13px",
            fontWeight: 400,
          }}
        >
          {String(act.label ?? "เปิด")}
        </div>
      );
    }
    default:
      return null;
  }
}

export function FlexPreview({ bubble, alt }: { bubble: unknown; alt?: string }) {
  const b = bubble as Node;
  if (!b || b.type !== "bubble") {
    return <p className="text-[12px] text-ink/40">ยังไม่มีการ์ดให้แสดง</p>;
  }

  return (
    <div className="w-full max-w-[320px]">
      {alt && (
        <p className="mb-2 truncate text-[11px] text-ink/40">
          ข้อความที่เห็นในรายการแชต · {alt}
        </p>
      )}
      <div className="border border-line bg-white shadow-[0_2px_14px_rgba(0,0,0,.10)]">
        {b.header ? <FlexNode n={b.header as Node} /> : null}
        {b.body ? <FlexNode n={b.body as Node} /> : null}
        {b.footer ? <FlexNode n={b.footer as Node} /> : null}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink/40">
        หน้าตาจริงในไลน์อาจต่างเล็กน้อยตามรุ่นของแอปและขนาดจอ
      </p>
    </div>
  );
}
