import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken,
      },
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || !connectionSettings.settings.api_key) {
    throw new Error('Resend not connected');
  }
  return {
    apiKey: connectionSettings.settings.api_key,
    fromEmail: connectionSettings.settings.from_email,
  };
}

// Resend integration - creates fresh client each call (tokens expire)
async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail,
  };
}

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to,
      subject: 'Verify your TCG Binder account',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #faf8f5; border-radius: 12px;">
          <h2 style="color: #1a1a1a; margin: 0 0 8px;">Welcome to TCG Binder</h2>
          <p style="color: #555; font-size: 15px; margin: 0 0 24px;">Use the code below to verify your email address.</p>
          <div style="background: #fff; border: 1px solid #e5e0d8; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #888; font-size: 13px; margin: 0;">This code expires in 10 minutes. If you didn't create an account, you can safely ignore this email.</p>
        </div>
      `,
    });
    console.log(`[Email] Verification email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send verification email to ${to}:`, err);
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to,
      subject: 'Reset your TCG Binder password',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #faf8f5; border-radius: 12px;">
          <h2 style="color: #1a1a1a; margin: 0 0 8px;">Password Reset</h2>
          <p style="color: #555; font-size: 15px; margin: 0 0 24px;">Use the code below to reset your TCG Binder password.</p>
          <div style="background: #fff; border: 1px solid #e5e0d8; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1a1a1a;">${code}</span>
          </div>
          <p style="color: #888; font-size: 13px; margin: 0;">This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
    });
    console.log(`[Email] Password reset email sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[Email] Failed to send password reset email to ${to}:`, err);
    return false;
  }
}

export { generateCode };
