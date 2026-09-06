import { redirect } from "next/navigation";

export default function ReceiptPage({ params }: { params: { id: string } }) {
  redirect(`/docs/receipt/${params.id}`);
}
