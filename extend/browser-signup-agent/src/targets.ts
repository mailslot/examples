/**
 * Services to sign up for. Selectors are necessarily service-specific — edit
 * these for your target. The email loop (mint → receive → extract → submit) is
 * identical for every entry; only the browser steps differ.
 *
 *   mode "otp"  → the service emails a code you type into a field. The signup
 *                 browser session is kept alive and reconnected when the mail
 *                 lands, so the code goes into the same page.
 *   mode "link" → the service emails a confirmation link you open (stateless).
 *
 * Pick a target without a CAPTCHA on signup, or drive it from an authenticated
 * session — bot defenses are the realistic blocker, not Mailslot.
 */
export type Target = {
  /** Signup page that asks for an email. */
  url: string;
  /** CSS selector for the email input. */
  emailSelector: string;
  /** CSS selector for the button that submits the email. */
  submitSelector: string;
  verify:
    | {
        mode: "otp";
        /** CSS selector for the OTP input shown after submitting the email. */
        otpSelector: string;
        /** CSS selector for the button that submits the OTP. */
        otpSubmitSelector: string;
      }
    | {
        mode: "link";
        /** Substring identifying the verification link among all links found. */
        linkMatch?: string;
      };
};

export const TARGETS: Record<string, Target> = {
  // Replace with a real target. Template for an OTP-style signup:
  example: {
    url: "https://example.com/signup",
    emailSelector: 'input[type="email"]',
    submitSelector: 'button[type="submit"]',
    verify: {
      mode: "otp",
      otpSelector: 'input[name="code"]',
      otpSubmitSelector: 'button[type="submit"]'
    }
  }
};
