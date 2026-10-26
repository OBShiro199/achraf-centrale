import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/settings">) {
  return children;
}
