import type { Metadata } from "next";

export const metadata: Metadata = { title: "Custom domain: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/domain">) {
  return children;
}
