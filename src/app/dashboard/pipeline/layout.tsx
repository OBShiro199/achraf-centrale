import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pipeline: Centrale" };

export default function Layout({ children }: LayoutProps<"/dashboard/pipeline">) {
  return children;
}
