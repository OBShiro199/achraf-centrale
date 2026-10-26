import type { Metadata } from "next";

export const metadata: Metadata = { title: "Billing: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/billing">) {
  return children;
}
