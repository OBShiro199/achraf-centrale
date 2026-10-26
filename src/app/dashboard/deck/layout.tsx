import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pitch deck: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/deck">) {
  return children;
}
