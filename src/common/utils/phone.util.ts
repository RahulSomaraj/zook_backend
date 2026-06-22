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
