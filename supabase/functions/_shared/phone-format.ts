// Phone numbers from the investor directory, normalised for calling and WhatsApp.

/**
 * A directory phone number in E.164, or null when we cannot tell its country. Numbers stored with + or 00 keep
 * their country code; national formats are read for the US, Canada and the UK, where most of the directory is.
 */
export function toE164(raw: string | null | undefined, country: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/(ext\.?|x)\s*\d+$/i, "").replace(/\(0\)/g, "");
  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const c = (country ?? "").toLowerCase();
  const northAmerica = /^(us|usa|united states|canada|ca)/.test(c);
  if (digits.length === 10 && northAmerica) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && (northAmerica || !c)) return `+${digits}`;
  if (/^(uk|gb|united kingdom|england|scotland|wales)/.test(c) && digits.startsWith("0") && digits.length === 11) return `+44${digits.slice(1)}`;
  return null;
}
