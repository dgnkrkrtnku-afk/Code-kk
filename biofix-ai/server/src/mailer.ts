// Outgoing e-mail: address verification and password reset codes. Uses SMTP when SMTP_URL is set.
// Without it, codes can be printed in the server log for local testing (PRINT_EMAIL_CODES=true).
import nodemailer from 'nodemailer';
import { printEmailCodes } from './config.js';
import type { Lang } from './types.js';

export interface Mailer {
  /** True when a code can actually reach the user (SMTP configured, or printing switched on for local testing). */
  readonly enabled: boolean;
  /** Proves that whoever registered can read this mailbox. */
  sendVerifyCode(to: string, code: string, lang: Lang): Promise<void>;
  sendResetCode(to: string, code: string, lang: Lang): Promise<void>;
}

type Kind = 'verify' | 'reset';
const TEXT: Record<Kind, Record<Lang, (code: string) => { subject: string; text: string }>> = {
  verify: {
    tr: (code) => ({
      subject: `BioFix AI doğrulama kodu: ${code}`,
      text: `BioFix AI hesabını etkinleştirmek için kodun: ${code}\n\nKod 30 dakika geçerlidir. Bu hesabı sen açmadıysan bu e-postayı yok sayabilirsin; doğrulanmayan hesap kullanılamaz ve silinir.`,
    }),
    en: (code) => ({
      subject: `BioFix AI verification code: ${code}`,
      text: `Your code to activate your BioFix AI account is: ${code}\n\nThe code is valid for 30 minutes. If you did not create this account, you can ignore this e-mail; an unverified account cannot be used and is deleted.`,
    }),
  },
  reset: {
    tr: (code) => ({
      subject: `BioFix AI şifre sıfırlama kodu: ${code}`,
      text: `BioFix AI şifreni sıfırlamak için kodun: ${code}\n\nKod 15 dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`,
    }),
    en: (code) => ({
      subject: `BioFix AI password reset code: ${code}`,
      text: `Your BioFix AI password reset code is: ${code}\n\nThe code is valid for 15 minutes. If you did not ask for it, you can ignore this e-mail.`,
    }),
  },
};

export const mailConfigured = () => !!process.env.SMTP_URL;

export function createMailer(): Mailer {
  const url = process.env.SMTP_URL;
  if (!url) {
    // A code in a log file is as good as the mailbox: printed only when explicitly enabled for local testing.
    const print = async (kind: Kind, to: string, code: string) => {
      if (printEmailCodes()) console.log(`[PRINT_EMAIL_CODES] ${kind === 'verify' ? 'verification' : 'password reset'} code for ${to}: ${code}`);
      else console.warn('An e-mail code was requested but SMTP_URL is not set; nothing was sent. (Local testing: PRINT_EMAIL_CODES=true)');
    };
    return {
      get enabled() { return printEmailCodes(); },
      sendVerifyCode: (to, code) => print('verify', to, code),
      sendResetCode: (to, code) => print('reset', to, code),
    };
  }
  const transport = nodemailer.createTransport(url);
  const from = process.env.MAIL_FROM || 'BioFix AI <no-reply@localhost>';
  const send = async (kind: Kind, to: string, code: string, lang: Lang) => {
    await transport.sendMail({ from, to, ...TEXT[kind][lang](code) });
  };
  return {
    enabled: true,
    sendVerifyCode: (to, code, lang) => send('verify', to, code, lang),
    sendResetCode: (to, code, lang) => send('reset', to, code, lang),
  };
}
