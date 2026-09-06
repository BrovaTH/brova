import { redirect } from "next/navigation";

export default function InvoicePage({ params }: { params: { id: string } }) {
  redirect(`/docs/invoice/${params.id}`);
}
