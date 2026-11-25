// Reading delivery reports. OpenMail has no bounce event: a bounce arrives as an ordinary inbound message with
// category "bounce", usually in the thread of the email that failed. These helpers decide whether it is a
// permanent failure and which address it was about, so the webhook can stop emailing that address.

const ADDRESS = /[a-z0-9._%+'-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const SYSTEM_SENDER = /^(mailer-daemon|postmaster|no-?reply|bounces?)@/i;

/**
 * True when a delivery report says the address will never work (5.x.x status, or "user unknown" style wording).
 * Delays and other temporary failures (4.x.x, "will retry") are false, since those emails may still arrive.
 */
export function isPermanentBounce(subject: string, body: string) {
  const text = `${subject}\n${body}`;
  if (/\b5\.\d{1,3}\.\d{1,3}\b/.test(text)) return true;
  if (/\b4\.\d{1,3}\.\d{1,3}\b/.test(text) || /\b(delay(ed)?|deferred|will (continue to )?retry|temporar(y|ily))\b/i.test(text)) return false;
  return /(does not exist|doesn't exist|user unknown|no such (user|mailbox|recipient)|address rejected|recipient rejected|mailbox (unavailable|not found|disabled)|account (is )?disabled|undeliverable|could not be delivered|wasn't delivered|address couldn't be found)/i
    .test(text);
}

/** Addresses named in a delivery report, minus the founder's own inbox and the system senders that report bounces. */
export function bouncedAddresses(body: string, ownAddress: string) {
  const own = ownAddress.toLowerCase();
  const found = new Set<string>();
  for (const m of body.matchAll(ADDRESS)) {
    const a = m[0].toLowerCase().replace(/\.$/, "");
    if (a !== own && !SYSTEM_SENDER.test(a)) found.add(a);
  }
  return [...found];
}

/** Out-of-office and other automatic replies. They are not a real reply, so follow-ups still go out. */
export function isAutoReply(subject: string) {
  return /(out of (the )?office|automatic reply|auto(matic)?[- ]?reply|autoreply|away from (the )?office|on (annual |parental |maternity |paternity )?leave|abwesenheit|absence|réponse automatique|respuesta automática)/i
    .test(subject);
}
