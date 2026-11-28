import { isValidEmail } from '../validators/validators.js';

type EmailLanguage = 'fr' | 'en' | 'ar';

const messages: Record<EmailLanguage, {
  subject: string;
  subtitle: string;
  heading: string;
  introduction: string;
  codeLabel: string;
  expiry: (duration: string) => string;
  securityTitle: string;
  securityNotice: string;
  signature: string;
  copyright: string;
  automatedNotice: string;
}> = {
  fr: {
    subject: '+HR | Code de réinitialisation du mot de passe',
    subtitle: 'Gestion intelligente des ressources humaines',
    heading: 'Réinitialisation de votre mot de passe',
    introduction: 'Nous avons reçu une demande de réinitialisation du mot de passe de votre compte +HR. Utilisez le code ci-dessous pour continuer.',
    codeLabel: 'Votre code de vérification à 6 chiffres',
    expiry: (duration) => `Ce code expire dans ${duration} et ne peut être utilisé qu’une seule fois.`,
    securityTitle: 'Un rappel de sécurité',
    securityNotice: 'L’équipe +HR ne vous demandera jamais votre code. Ne le partagez avec personne.',
    signature: 'L’équipe +HR',
    copyright: '© 2026 +HR. Tous droits réservés.',
    automatedNotice: 'Cet e-mail a été envoyé automatiquement. Merci de ne pas y répondre.',
  },
  en: {
    subject: '+HR | Password reset code',
    subtitle: 'Intelligent Human Resources Management',
    heading: 'Reset your password',
    introduction: 'We received a request to reset the password for your +HR account. Use the code below to continue.',
    codeLabel: 'Your 6-digit verification code',
    expiry: (duration) => `This code expires in ${duration} and can only be used once.`,
    securityTitle: 'A security reminder',
    securityNotice: 'The +HR team will never ask you for this code. Do not share it with anyone.',
    signature: 'The +HR Team',
    copyright: '© 2026 +HR. All rights reserved.',
    automatedNotice: 'This email was sent automatically. Please do not reply.',
  },
  ar: {
    subject: '+HR | رمز إعادة تعيين كلمة المرور',
    subtitle: 'إدارة ذكية للموارد البشرية',
    heading: 'إعادة تعيين كلمة المرور',
    introduction: 'تلقينا طلبًا لإعادة تعيين كلمة المرور لحسابك في +HR. استخدم الرمز أدناه للمتابعة.',
    codeLabel: 'رمز التحقق المكوّن من 6 أرقام',
    expiry: (duration) => `تنتهي صلاحية هذا الرمز خلال ${duration} ويمكن استخدامه مرة واحدة فقط.`,
    securityTitle: 'تذكير أمني',
    securityNotice: 'لن يطلب منك فريق +HR هذا الرمز مطلقًا. لا تشاركه مع أي شخص.',
    signature: 'فريق +HR',
    copyright: '© 2026 +HR. جميع الحقوق محفوظة.',
    automatedNotice: 'تم إرسال هذا البريد الإلكتروني تلقائيًا. يرجى عدم الرد عليه.',
  },
};

const htmlEscapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => htmlEscapes[character]);
}

function formatDuration(language: EmailLanguage, validityMs: number): string {
  const minutes = Math.ceil(validityMs / 60_000);
  return new Intl.NumberFormat(language, {
    style: 'unit',
    unit: 'minute',
    unitDisplay: 'long',
  }).format(minutes);
}

function renderHtml(language: EmailLanguage, code: string, validityMs: number): string {
  const copy = messages[language];
  const direction = language === 'ar' ? 'rtl' : 'ltr';
  const alignment = direction === 'rtl' ? 'right' : 'left';
  const duration = formatDuration(language, validityMs);
  const safeCode = escapeHtml(code);
  const cells = Array.from(safeCode, (digit) => `
    <td class="otp-digit" width="35" height="52" align="center" valign="middle"
      style="width:35px;height:52px;padding:0 2px;border:1px solid #EFE6D8;border-radius:10px;background:#FDF9F3;color:#C8431F;font-family:Poppins,Arial,sans-serif;font-size:25px;font-weight:700;line-height:1">${digit}</td>
  `).join('');

  return `<!doctype html>
<html lang="${language}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${copy.heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#FDF9F3;color:#23201D;font-family:Poppins,Arial,sans-serif">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;background:#FDF9F3">
      <tr>
        <td align="center" style="padding:28px 12px">
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
            style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #EFE6D8;border-radius:24px">
            <tr>
              <td align="${alignment}" style="padding:32px 28px 18px;text-align:${alignment}">
                <div dir="ltr" style="color:#23201D;font-family:Poppins,Arial,sans-serif;font-size:25px;font-weight:700;letter-spacing:-1px;line-height:1.2">
                  <span style="color:#FF7A59">+</span>HR
                </div>
                <p style="margin:7px 0 0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:12px;line-height:1.6">${copy.subtitle}</p>
              </td>
            </tr>
            <tr>
              <td align="${alignment}" style="padding:8px 28px 0;text-align:${alignment}">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="46" height="46" align="center" valign="middle" aria-hidden="true"
                      style="width:46px;height:46px;border-radius:23px;background:#E8F7F4;color:#2BB6A3;font-family:Arial,sans-serif;font-size:23px;font-weight:700;line-height:1">&#10003;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="${alignment}" style="padding:19px 28px 0;text-align:${alignment}">
                <h1 style="margin:0;color:#23201D;font-family:Poppins,Arial,sans-serif;font-size:24px;font-weight:700;line-height:1.35">${copy.heading}</h1>
                <p style="margin:12px 0 0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:15px;line-height:1.75">${copy.introduction}</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 18px 0">
                <p style="margin:0 0 13px;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:13px;font-weight:600;line-height:1.5">${copy.codeLabel}</p>
                <table role="img" aria-label="${copy.codeLabel}: ${safeCode}" dir="ltr" align="center" border="0" cellpadding="0" cellspacing="5"
                  style="direction:ltr;margin:0 auto">
                  <tr>${cells}</tr>
                </table>
                <p style="margin:18px 0 0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:1.7">${copy.expiry(duration)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 28px 0">
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
                  style="width:100%;border:1px solid #F4D6CA;border-radius:14px;background:#FFF6F2">
                  <tr>
                    <td align="${alignment}" style="padding:15px 16px;text-align:${alignment}">
                      <p style="margin:0;color:#C8431F;font-family:Poppins,Arial,sans-serif;font-size:13px;font-weight:700;line-height:1.5">${copy.securityTitle}</p>
                      <p style="margin:5px 0 0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:13px;line-height:1.7">${copy.securityNotice}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="${alignment}" style="padding:21px 28px 28px;text-align:${alignment}">
                <p style="margin:0;color:#23201D;font-family:Poppins,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1.6">${copy.signature}</p>
              </td>
            </tr>
          </table>
          <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0"
            style="width:100%;max-width:600px">
            <tr>
              <td align="center" style="padding:19px 14px 0;text-align:center">
                <p style="margin:0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:12px;line-height:1.7">${copy.copyright}</p>
                <p style="margin:5px 0 0;color:#736C63;font-family:Poppins,Arial,sans-serif;font-size:11px;line-height:1.7">${copy.automatedNotice}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderText(language: EmailLanguage, code: string, validityMs: number): string {
  const copy = messages[language];
  return [
    '+HR',
    copy.subtitle,
    copy.heading,
    copy.introduction,
    `${copy.codeLabel}:\n${code}`,
    copy.expiry(formatDuration(language, validityMs)),
    `${copy.securityTitle}: ${copy.securityNotice}`,
    copy.signature,
    copy.copyright,
    copy.automatedNotice,
  ].join('\n\n');
}

export function getBrevoConfig() {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const email = process.env.EMAIL_FROM?.trim();
  const name = process.env.EMAIL_FROM_NAME?.trim();
  if (!apiKey || !email || !name || !isValidEmail(email) || /[<>,;\x00-\x1f\x7f]/.test(email) ||
      /[\x00-\x1f\x7f]/.test(apiKey) || /[\x00-\x1f\x7f]/.test(name)) return null;
  return { apiKey, sender: { email, name } };
}

export async function sendPasswordResetEmail(config: NonNullable<ReturnType<typeof getBrevoConfig>>,
  email: string, preferredLang: string, code: string, validityMs: number): Promise<boolean> {
  const lang: EmailLanguage = preferredLang === 'en' || preferredLang === 'ar' ? preferredLang : 'fr';
  const { subject } = messages[lang];
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
        textContent: renderText(lang, code, validityMs),
        htmlContent: renderHtml(lang, code, validityMs),
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
