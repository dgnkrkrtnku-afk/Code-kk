// Outgoing e-mail (password reset codes). Uses SMTP when SMTP_URL is set; otherwise prints to the
// server console so the flow can be tried in development without a mail account.
import nodemailer from 'nodemailer';
import { isProd } from './config.js';
import type { Lang } from './types.js';

export interface Mailer {
  sendResetCode(to: string, code: string, lang: Lang): Promise<void>;
}

const TEXT: Record<Lang, (code: string) => { subject: string; text: string }> = {
  tr: (code) => ({
    subject: `BioFix AI şifre sıfırlama kodu: ${code}`,
    text: `BioFix AI şifreni sıfırlamak için kodun: ${code}\n\nKod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
  }),
  en: (code) => ({
    subject: `BioFix AI password reset code: ${code}`,
    text: `Your BioFix AI password reset code is: ${code}\n\nThe code is valid for 15 minutes. If you did not ask for it, you can ignore this e-mail.`,
  }),
};

export const mailConfigured = () => !!process.env.SMTP_URL;

export function createMailer(): Mailer {
  const url = process.env.SMTP_URL;
  if (!url) {
    return {
      async sendResetCode(to, code) {
        // A reset code in a log file is as good as the password, so it is only ever printed in development.
        if (isProd()) console.warn('Password reset requested but SMTP_URL is not set; no e-mail was sent.');
        else console.log(`[mail disabled] password reset code for ${to}: ${code}  (set SMTP_URL to send real e-mail)`);
      },
    };
  }
  const transport = nodemailer.createTransport(url);
  const from = process.env.MAIL_FROM || 'BioFix AI <no-reply@localhost>';
  return {
    async sendResetCode(to, code, lang) {
      await transport.sendMail({ from, to, ...TEXT[lang](code) });
    },
  };
}
