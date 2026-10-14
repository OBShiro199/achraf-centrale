// Throwaway email services. Signups from these are refused, since a trial costs real Claude and scraping
// spend. Matches the domain and any subdomain of it.
const DISPOSABLE = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonaddy.me", "burnermail.io",
  "byom.de", "dispostable.com", "dropmail.me", "emailondeck.com", "fakeinbox.com", "getairmail.com",
  "getnada.com", "guerrillamail.biz", "guerrillamail.com", "guerrillamail.de", "guerrillamail.info",
  "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com", "harakirimail.com", "inboxbear.com",
  "incognitomail.org", "jetable.org", "mail.tm", "mail-temp.com", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailinator.net", "mailnesia.com", "mailpoof.com", "mintemail.com", "moakt.com",
  "mohmal.com", "mytemp.email", "nada.email", "sharklasers.com", "spam4.me", "spamgourmet.com",
  "temp-mail.io", "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.dev", "tempmail.net",
  "tempmailo.com", "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net",
  "yopmail.com", "yopmail.fr", "yopmail.net", "emailfake.com", "fakemail.net", "grr.la", "pokemail.net",
  "tmail.ws", "tmpmail.org", "tmpmail.net", "minuteinbox.com", "luxusmail.org", "1secmail.com",
  "1secmail.net", "1secmail.org", "mailsac.com", "linshiyouxiang.net", "spambox.us", "trbvm.com",
]);

export function isDisposable(email: string) {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
