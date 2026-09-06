import type { ReactNode } from "react";

/**
 * กระดาษ A4 ขนาดจริง
 * 210 × 297 มม. ที่ 96 จุดต่อนิ้ว เท่ากับ 794 × 1123 พิกเซล
 * ตรึงขนาดไว้เป๊ะ ๆ เพื่อให้สิ่งที่เห็นบนจอกับสิ่งที่พิมพ์ออกมาเป็นภาพเดียวกัน
 */
export const A4_W = 794;
export const A4_H = 1123;

export function A4Sheet({
  children, className = "", scale,
}: {
  children: ReactNode;
  className?: string;
  /** ย่อให้พอดีช่องพรีวิว ตอนพิมพ์จะกลับเป็นขนาดเต็มเอง */
  scale?: number;
}) {
  const sheet = (
    <div
      className={`a4 relative bg-white text-ink shadow-[0_2px_20px_rgba(0,0,0,.10)] ${className}`}
      style={{
        width: A4_W,
        minHeight: A4_H,
        padding: "48px 52px 56px",
        ...(scale
          ? { transform: `scale(${scale})`, transformOrigin: "top left" }
          : {}),
      }}
    >
      {children}
    </div>
  );

  if (!scale) return sheet;

  // ครอบอีกชั้นเพื่อกันพื้นที่ว่างหลังย่อ ไม่ให้หน้าเว็บมีที่โล่งค้าง
  return (
    <div style={{ width: A4_W * scale, height: A4_H * scale }} className="overflow-hidden">
      {sheet}
    </div>
  );
}

/** ครอบหน้าพรีวิวให้ย่อพอดีความกว้างที่มี */
export function A4Frame({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto bg-bone-200 p-4 sm:p-6">
      <div className="mx-auto w-fit">{children}</div>
    </div>
  );
}
