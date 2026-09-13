/** Format validators for the format assertion keyword (draft-07 subset). */

const RE = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
  hostname: /^(?=.{1,253}\.?$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.?$/,
  jsonPointer: /^(?:\/(?:[^~/]|~0|~1)*)*$/,
  uriTemplate: /^(?:[^\x00-\x20"'<>%\\^`{|}]|\{[^{}\s]*\})*$/,
  regex: /^\/(?:[^/\\\n]|\\.)*\/[dgimsuvy]*$/,
  uuid: /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  time: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-][01]\d:[0-5]\d)?$/,
};

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  const days = [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d >= 1 && d <= days[m - 1];
}

function isIpv6(value: string): boolean {
  if (value.includes(":::")) return false;
  const parts = value.split("::");
  if (parts.length > 2) return false;
  const hasCompress = parts.length === 2;
  const groups = hasCompress ? [...parts[0].split(":").filter(Boolean), ...parts[1].split(":").filter(Boolean)] : value.split(":");
  if (!hasCompress && groups.length !== 8) return false;
  if (hasCompress && groups.length >= 8) return false;
  for (const g of groups) {
    if (g.includes(".")) {
      if (!RE.ipv4.test(g)) return false;
    } else if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
      return false;
    }
  }
  return true;
}

function isUri(value: string, allowRelative: boolean): boolean {
  // reject spaces and control chars
  if (/[\s\x00-\x1f\x7f]/.test(value)) return false;
  // scheme:  "scheme://..."
  const schemeMatch = /^[A-Za-z][A-Za-z0-9+.\-]*:/.exec(value);
  if (schemeMatch) return true;
  return allowRelative;
}

function isDateTime(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return false;
  const [, Y, mo, d] = m;
  return isValidDate(Number(Y), Number(mo), Number(d));
}

function isDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  return isValidDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function isDuration(value: string): boolean {
  return /^P(?:\d+W|(?:(?:\d+Y)?(?:\d+M)?(?:\d+D)?(?:T(?:\d+H)?(?:\d+M)?(?:\d+(?:\.\d+)?S)?)?))$/.test(
    value,
  );
}

export type FormatValidator = (value: string) => boolean;

/** Built-in format validators. Unknown formats are ignored unless strictFormats is set. */
export const FORMATS: Record<string, FormatValidator> = {
  "date-time": isDateTime,
  date: isDate,
  time: (v) => RE.time.test(v),
  duration: isDuration,
  email: (v) => RE.email.test(v),
  "idn-email": (v) => RE.email.test(v),
  hostname: (v) => RE.hostname.test(v),
  "idn-hostname": (v) => RE.hostname.test(v),
  ipv4: (v) => RE.ipv4.test(v),
  ipv6: isIpv6,
  uri: (v) => isUri(v, false),
  "uri-reference": (v) => isUri(v, true),
  "uri-template": (v) => RE.uriTemplate.test(v),
  "json-pointer": (v) => RE.jsonPointer.test(v),
  "relative-json-pointer": (v) => /^(?:0|[1-9]\d*)(?:#|(?:\/(?:[^~/]|~0|~1)*)*)$/.test(v),
  uuid: (v) => RE.uuid.test(v),
  regex: (v) => RE.regex.test(v),
  "json-pointer-uri-fragment": (v) => v.startsWith("#/") && RE.jsonPointer.test(v.slice(1)),
};
