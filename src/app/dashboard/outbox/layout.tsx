import type { Metadata } from "next";

export const metadata: Metadata = { title: "Outbox: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/outbox">) {
  return children;
}
