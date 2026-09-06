import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PageHead, Tag, LinkBtn } from "@/components/ui";
import { DocEditor } from "@/components/doc-editor";
import { saveDoc, issueDoc } from "@/actions/docs";
import { toDocModel, DOC_TITLE, type DocType } from "@/lib/doc-model";
import { lockReason } from "@/lib/accounting";
import { thDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const TABLE: Record<DocType, string> = {
  quotation: "quotations",
  invoice: "invoices",
  receipt: "receipts",
};

function isDocType(t: string): t is DocType {
  return t === "quotation" || t === "invoice" || t === "receipt";
}

export default async function DocEditPage({
  params,
}: {
  params: { type: string; id: string };
}) {
  if (!isDocType(params.type)) notFound();
  const docType: DocType = params.type;

  const sb = supabaseServer();
  const [{ data: row }, { data: lines }, { data: company }] = await Promise.all([
    sb.from(TABLE[docType]).select("*").eq("id", params.id).maybeSingle(),
    sb.from("doc_lines").select("*").eq("doc_type", docType).eq("doc_id", params.id).order("seq"),
    sb.from("company_settings").select("*").eq("id", 1).maybeSingle(),
  ]);

  if (!row) notFound();

  const model = toDocModel(docType, row, lines ?? []);
  const locked = lockReason({
    code: row.code,
    status: row.status,
    locked_at: row.locked_at,
  });

  return (
    <>
      <PageHead
        eyebrow={DOC_TITLE[docType]}
        title={row.code ?? "ร่างที่ยังไม่ได้ออกเลข"}
        lead={
          locked
            ? `เอกสารนี้ล็อกแล้ว${row.locked_at ? ` เมื่อ ${thDateTime(row.locked_at)}` : ""} · เปิดดูและพิมพ์ได้`
            : "แก้ได้ทุกช่อง ทั้งตัวเลขและคำบนใบ ด้านขวาคือหน้ากระดาษจริงที่จะพิมพ์ออกมา"
        }
        right={
          <>
            {locked ? <Tag tone="mute">ล็อกแล้ว</Tag> : <Tag tone="warn">ร่าง</Tag>}
            <LinkBtn href="/docs">กลับรายการเอกสาร</LinkBtn>
          </>
        }
      />

      <DocEditor
        initial={model}
        company={company}
        readOnly={!!locked}
        lockNote={locked}
        onSave={saveDoc.bind(null, docType, params.id)}
        onIssue={locked ? undefined : issueDoc.bind(null, docType, params.id)}
      />
    </>
  );
}
