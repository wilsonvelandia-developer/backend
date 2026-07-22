import { logger } from '../logger.js';

// Nodemailer is an optional dependency loaded only when SMTP is configured
// Declare minimal types to avoid hard dependency at compile time
declare function require(module: string): unknown;

/**
 * Email service — sends transactional emails.
 *
 * In production: uses SMTP (Nodemailer) configured via environment variables.
 * In development: logs the email content to console (no actual send).
 *
 * Environment variables:
 *   SMTP_HOST     — SMTP server hostname (e.g. smtp.gmail.com)
 *   SMTP_PORT     — SMTP port (default 587)
 *   SMTP_USER     — SMTP username/email
 *   SMTP_PASSWORD — SMTP password or app-specific password
 *   SMTP_FROM     — Sender address (e.g. "OlimpicApp <no-reply@olimpicapp.com>")
 *   FRONTEND_URL  — Frontend base URL for building links
 */

interface EmailOptions {
  to:      string;
  subject: string;
  html:    string;
  text?:   string;
}

/**
 * Sends an email. In development mode, logs to console instead of sending.
 * Returns true if the email was sent (or logged) successfully.
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const isProduction = process.env['NODE_ENV'] === 'production';

  if (!isProduction) {
    // Dev mode: log email content for testing
    logger.info({
      to:      options.to,
      subject: options.subject,
      html:    options.html.substring(0, 200) + '...',
    }, '[DEV] Email would be sent');
    return true;
  }

  // Production: use Nodemailer
  const smtpHost     = process.env['SMTP_HOST'];
  const smtpPort     = parseInt(process.env['SMTP_PORT'] ?? '587', 10);
  const smtpUser     = process.env['SMTP_USER'];
  const smtpPassword = process.env['SMTP_PASSWORD'];
  const smtpFrom     = process.env['SMTP_FROM'] ?? 'OlimpicApp <no-reply@olimpicapp.com>';

  if (!smtpHost || !smtpUser || !smtpPassword) {
    logger.warn('SMTP not configured — email not sent. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.');
    return false;
  }

  try {
    // Nodemailer is loaded at runtime — optional production dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = require('nodemailer') as {
      createTransport: (config: unknown) => { sendMail: (opts: unknown) => Promise<unknown> };
    };
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
    });

    await transporter.sendMail({
      from:    smtpFrom,
      to:      options.to,
      subject: options.subject,
      html:    options.html,
      text:    options.text ?? options.html.replace(/<[^>]*>/g, ''),
    });

    logger.info({ to: options.to, subject: options.subject }, 'Email sent');
    return true;
  } catch (err) {
    logger.error({ err, to: options.to }, 'Failed to send email');
    return false;
  }
}

/**
 * Sends a password reset email with the reset link.
 */
export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:4200';
  const resetLink = `${frontendUrl}/auth/reset-password?token=${resetToken}`;

  return sendEmail({
    to:      email,
    subject: 'OlimpicApp — Restablecer contraseña',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem;">
        <h2 style="color: #1a56db; margin-bottom: 1rem;">Restablecer contraseña</h2>
        <p style="color: #374151; line-height: 1.6;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta en OlimpicApp.
          Haz clic en el siguiente enlace para crear una nueva contraseña:
        </p>
        <a href="${resetLink}"
           style="display: inline-block; margin: 1.5rem 0; padding: 0.75rem 1.5rem; background: #1a56db; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
          Restablecer contraseña
        </a>
        <p style="color: #6b7280; font-size: 0.875rem; line-height: 1.5;">
          Este enlace expira en 1 hora. Si no solicitaste este cambio, puedes ignorar este correo.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0;" />
        <p style="color: #9ca3af; font-size: 0.75rem;">
          OlimpicApp — Gestión de Torneos Deportivos
        </p>
      </div>
    `,
  });
}
