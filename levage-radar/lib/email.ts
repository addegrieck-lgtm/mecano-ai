import "server-only";

/**
 * Envoi d'e-mails via SMTP (facultatif). Sans configuration, aucun e-mail n'est envoyé et
 * l'application l'indique (rapports consultables dans l'application uniquement).
 * Services possibles : tout serveur SMTP (Brevo, Mailjet, OVH, Gmail Workspace…) — certains sont payants au-delà d'un quota.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.EMAIL_FROM);
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!isEmailConfigured()) throw new Error("Service e-mail non configuré (SMTP_HOST / EMAIL_FROM).");
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.EMAIL_FROM, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
