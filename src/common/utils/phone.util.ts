/**
 * Normalise a user-entered phone number to E.164-ish form.
 * Defaults bare local numbers to the UAE country code (+971), matching the app.
 */
export function normalizePhone(input: string): string {
  const cleaned = input.replace(/[\s()\-.]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) return '+971' + cleaned.slice(1);
  if (cleaned.startsWith('971')) return '+' + cleaned;
  return '+971' + cleaned;
}

/**
 * Sanity-check a normalized number BEFORE any paid SMS call. Catches the
 * classic failure normalizePhone can produce: a non-UAE number sent without
 * its '+' prefix gets a +971 glued on (e.g. Indian '9656082258' →
 * '+9719656082258', 10 national digits — impossible for UAE, rejected by
 * Twilio as 60200).
 *
 * Rules: E.164 shape overall (8–15 digits), and +971 numbers must have
 * exactly 9 national digits starting with 5 (UAE mobiles: 050/52/54/55/56/58).
 */
export function isPlausiblePhone(phone: string): boolean {
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return false;
  if (phone.startsWith('+971')) {
    return /^\+9715\d{8}$/.test(phone);
  }
  return true;
}
