import type { Metadata } from "next";

export const metadata: Metadata = { title: "Inbox: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/inbox">) {
  return children;
}
