// Sends an SMS to alertPhoneTo from fromNumber.
// Falls back to console.log when Twilio env vars are missing (dev mode).
import twilio from 'twilio';

export async function sendSms(to: string, from: string, body: string): Promise<void> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];
  const authToken = process.env['TWILIO_AUTH_TOKEN'];

  if (!accountSid || !authToken) {
    console.log('[SMS dev mode] Would send SMS:');
    console.log(`  To:   ${to}`);
    console.log(`  From: ${from}`);
    console.log(`  Body: ${body}`);
    return;
  }

  const client = twilio(accountSid, authToken);
  await client.messages.create({ to, from, body });
}
