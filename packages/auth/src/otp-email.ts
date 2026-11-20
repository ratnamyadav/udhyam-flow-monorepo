// The sign-in code email. Kept apart from server.ts so the copy is easy to
// find and the constants can be shared with the sign-in screens' wording.

export const OTP_LENGTH = 6;
export const OTP_EXPIRES_IN_SECONDS = 10 * 60;

export function signInCodeEmail(to: string, code: string) {
  const minutes = OTP_EXPIRES_IN_SECONDS / 60;
  return {
    to,
    subject: `${code} is your UdyamFlow sign-in code`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:auto;padding:24px;">
        <h2 style="margin:0 0 12px 0;font-weight:500;color:#1a1815;">Your sign-in code</h2>
        <p style="color:#5e5b54;line-height:1.6;">
          Enter this code to sign in to UdyamFlow. It expires in ${minutes} minutes.
        </p>
        <p style="margin:24px 0;font-family:ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:8px;font-weight:600;color:#1a1815;">
          ${code}
        </p>
        <p style="color:#9a978f;font-size:12px;line-height:1.6;">
          Never share this code. UdyamFlow staff will never ask you for it.
          If you didn't try to sign in, you can ignore this email.
        </p>
      </div>
    `.trim(),
  };
}
