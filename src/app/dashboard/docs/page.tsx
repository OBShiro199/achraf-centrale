import type { Metadata } from "next";
import { DocsView } from "@/components/docs/docs-view";
import { searchText } from "@/components/docs/text";
import { DOCS, DOCS_UPDATED } from "@/content/docs";

export const metadata: Metadata = { title: "Docs: Centrale" };

// Content is local and static. Search text is worked out here, on the server, so the client only
// filters strings.
const SECTIONS = DOCS.map((s) => ({ ...s, haystack: searchText(s.title, s.summary, s.body) }));

export default function DocsPage() {
  return <DocsView sections={SECTIONS} updated={DOCS_UPDATED} />;
}
