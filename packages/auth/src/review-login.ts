// App Store and Google Play reviewers have to sign in to a demo account, but
// can't receive our sign-in emails. When REVIEW_LOGIN_EMAIL and
// REVIEW_LOGIN_CODE are both set, that one account signs in with the fixed
// code (which goes into App Store Connect / Play Console, never the repo) and
// no email is sent. Every other account gets a random code by email.
//
// Point it only at an account holding demo data, and unset the variables
// when no review is in progress.

const CODE_PATTERN = /^\d{6}$/;

export function reviewLoginCode(
  email: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const reviewEmail = env.REVIEW_LOGIN_EMAIL?.trim().toLowerCase();
  const code = env.REVIEW_LOGIN_CODE?.trim();
  if (!reviewEmail || !code || !CODE_PATTERN.test(code)) return null;
  return email.trim().toLowerCase() === reviewEmail ? code : null;
}
