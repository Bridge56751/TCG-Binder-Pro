function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  console.log(`[Email] Verification code for ${to}: ${code} (email sending disabled)`);
  return true;
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  console.log(`[Email] Password reset code for ${to}: ${code} (email sending disabled)`);
  return true;
}

export { generateCode };
