import { isValidEmail } from '../validators/validators.js';

const messages = {
  fr: {
    subject: '+HR | Code de réinitialisation du mot de passe',
    heading: 'Réinitialisation de votre mot de passe',
    instruction: 'Saisissez ce code dans +HR pour réinitialiser votre mot de passe.',
    expiry: 'Ce code est valable 5 minutes et ne peut être utilisé qu’une seule fois.',
    ignore: 'Si vous n’avez pas demandé cette réinitialisation, ignorez cet e-mail. Ne partagez jamais ce code.',
  },
  en: {
    subject: '+HR | Password reset code',
    heading: 'Reset your password',
    instruction: 'Enter this code in +HR to reset your password.',
    expiry: 'This code expires in 5 minutes and can only be used once.',
    ignore: 'If you did not request a password reset, ignore this email. Never share this code.',
  },
  ar: {
    subject: '+HR | رمز إعادة تعيين كلمة المرور',
    heading: 'إعادة تعيين كلمة المرور',
    instruction: 'أدخل هذا الرمز في تطبيق +HR لإعادة تعيين كلمة المرور.',
    expiry: 'هذا الرمز صالح لمدة خمس دقائق ويمكن استخدامه مرة واحدة فقط.',
    ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، فتجاهل هذا البريد الإلكتروني. لا تشارك هذا الرمز مع أي شخص.',
  },
};

export function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const email = process.env.EMAIL_FROM?.trim();
  const name = process.env.EMAIL_FROM_NAME?.trim();
  if (!apiKey || !email || !name || !isValidEmail(email) || /[<>,;\x00-\x1f\x7f]/.test(email) ||
      /[\x00-\x1f\x7f]/.test(apiKey) || /[\x00-\x1f\x7f]/.test(name)) return null;
  return { apiKey, sender: { email, name } };
}

export async function sendPasswordResetEmail(config: NonNullable<ReturnType<typeof getBrevoConfig>>,
  email: string, preferredLang: string, code: string): Promise<boolean> {
  const lang = preferredLang === 'en' || preferredLang === 'ar' ? preferredLang : 'fr';
  const { subject, heading, instruction, expiry, ignore } = messages[lang];
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: { 'api-key': config.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: config.sender,
        to: [{ email }],
        subject,
        textContent: [heading, instruction, code, expiry, ignore].join('\n\n'),
        htmlContent: `<!DOCTYPE html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"></head>
          <body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif">
            <main style="max-width:540px;margin:24px auto;padding:28px;background:#fff;border-radius:12px">
              <p style="font-size:22px;color:#1d4ed8"><strong>+HR</strong></p>
              <h1 style="font-size:20px">${heading}</h1>
              <p>${instruction}</p>
              <p dir="ltr" style="background:#eff6ff;padding:16px;text-align:center;font-size:28px;letter-spacing:6px"><strong>${code}</strong></p>
              <p>${expiry}</p><p style="color:#475569">${ignore}</p>
            </main>
          </body></html>`,
      }),
    });
    const accepted = response.status === 201;
    void response.body?.cancel().catch(() => {});
    if (!accepted) console.warn('[+HR Email] Brevo rejected a password reset email.', response.status);
    return accepted;
  } catch {
    console.warn('[+HR Email] Brevo password reset email delivery failed.');
    return false;
  }
}
