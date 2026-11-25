import { assertEquals } from "jsr:@std/assert@1.0.13";
import { bouncedAddresses, isAutoReply, isPermanentBounce } from "./bounce.ts";

const GMAIL_HARD = `Address not found

Your message wasn't delivered to jane@acme.vc because the address couldn't be found, or is unable to receive mail.

The response from the remote server was:
550 5.1.1 The email account that you tried to reach does not exist.`;

const DELAY = `Delivery incomplete

There was a temporary problem delivering your message to sam@fund.com. Gmail will retry for 46 more hours.
421 4.7.0 Try again later`;

Deno.test("hard bounces are permanent", () => {
  assertEquals(isPermanentBounce("Delivery Status Notification (Failure)", GMAIL_HARD), true);
  assertEquals(isPermanentBounce("Undeliverable: Intro", "Your message to x@y.com couldn't be delivered. User unknown."), true);
});

Deno.test("delays are not permanent", () => {
  assertEquals(isPermanentBounce("Delivery Status Notification (Delay)", DELAY), false);
  assertEquals(isPermanentBounce("Warning: message delayed", "We will retry delivery."), false);
});

Deno.test("the bounced address is found, not the sender or the daemon", () => {
  assertEquals(bouncedAddresses(`From: mailer-daemon@googlemail.com\nTo: amy@omail.sh\n${GMAIL_HARD}`, "Amy@omail.sh"), ["jane@acme.vc"]);
});

Deno.test("out-of-office replies are spotted", () => {
  assertEquals(isAutoReply("Automatic reply: Intro to Acme"), true);
  assertEquals(isAutoReply("Out of Office: Re: Acme"), true);
  assertEquals(isAutoReply("Re: Intro to Acme"), false);
});
