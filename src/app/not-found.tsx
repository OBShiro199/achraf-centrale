import { ButtonLink } from "@/components/ui/button";
import { StatusScreen } from "@/components/app/status-screen";

export default function NotFound() {
  return (
    <StatusScreen code="404" title="This page does not exist" body="The link may be old or mistyped. Everything you need is one click away.">
      <ButtonLink href="/dashboard" variant="primary">
        Open your dashboard
      </ButtonLink>
      <ButtonLink href="/">Centrale home</ButtonLink>
    </StatusScreen>
  );
}
