import type { Metadata } from "next";

export const metadata: Metadata = { title: "Admin: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/admin">) {
  return children;
}
