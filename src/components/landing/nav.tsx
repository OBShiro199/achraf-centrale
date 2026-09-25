import { ButtonLink } from "@/components/ui/button";
import { Logo } from "./logo";

const links = [
  { href: "#how", label: "How it works" },
  { href: "#matching", label: "Matching" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "Questions" },
];

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md">
      <div className="rail flex h-[60px] items-center justify-between px-4 md:px-8">
        <Logo />
        <nav className="hidden items-center gap-7 text-[14px] text-muted md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition-colors hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" size="sm" square className="hidden sm:inline-flex">
            Log in
          </ButtonLink>
          <ButtonLink href="/signup" variant="primary" size="sm" square>
            Start your raise
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
