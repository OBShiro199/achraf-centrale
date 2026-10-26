import type { Metadata } from "next";

export const metadata: Metadata = { title: "Startup profile: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/profile">) {
  return children;
}
