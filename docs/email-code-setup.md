# Email code sign-in setup

This change needs a matching Supabase email template update. Do not deploy the code-entry UI alone: the default Supabase emails contain a one-click link, not a six-digit code. Mail security scanners can open those links before the user does.

1. Configure a production email sender under **Supabase → Authentication → Emails → SMTP Settings**. Use an email provider and a sender domain the team controls. Keep the SMTP password in Supabase, out of Git and Vercel.
2. Set the **Confirm sign up** subject to `Your AptSignal confirmation code` and its body to:

   ```html
   <h2>Confirm your AptSignal account</h2>
   <p>Enter this six-digit code in AptSignal:</p>
   <p><strong>{{ .Token }}</strong></p>
   <p>If you did not request this, you can ignore this email.</p>
   ```

3. Set the **Magic link or OTP** subject to `Your AptSignal sign-in code` and its body to:

   ```html
   <h2>Your AptSignal sign-in code</h2>
   <p>Enter this six-digit code in AptSignal:</p>
   <p><strong>{{ .Token }}</strong></p>
   <p>If you did not request this, you can ignore this email.</p>
   ```

4. Coordinate saving both templates with deploying the code-entry UI. Request a new email after the templates are saved; old one-click links cannot be used as codes. Test a new account and an existing account, then confirm `/saved` loads and a real building can be saved. The old `/auth/callback` route stays available for links already sent.

References: [Supabase email template variables](https://supabase.com/docs/guides/auth/auth-email-templates), [passwordless email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
