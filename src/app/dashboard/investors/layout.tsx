import type { Metadata } from "next";

export const metadata: Metadata = { title: "Investors: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/investors">) {
  return children;
}
