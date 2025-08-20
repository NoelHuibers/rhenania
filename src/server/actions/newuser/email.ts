// lib/email.ts
"use server";
import nodemailer from "nodemailer";
import { env } from "~/env";

// Configure your email transporter using your existing Gmail setup
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.GMAIL,
    pass: env.GMAIL_PASSWORD,
  },
});

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function getVerificationEmailTemplate(verificationUrl: string): EmailTemplate {
  return {
    subject: "Bestätigen Sie Ihre E-Mail-Adresse",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>E-Mail bestätigen</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 14px; color: #6c757d; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; }
            .button:hover { background-color: #0056b3; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Willkommen!</h1>
            </div>
            <div class="content">
              <h2>Bestätigen Sie Ihre E-Mail-Adresse</h2>
              <p>Sie haben eine Einladung erhalten, sich bei unserer Anwendung zu registrieren.</p>
              <p>Um Ihr Konto zu aktivieren und ein Passwort zu erstellen, klicken Sie bitte auf den folgenden Link:</p>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" class="button">E-Mail bestätigen und Passwort erstellen</a>
              </p>
              
              <div class="warning">
                <strong>Wichtiger Hinweis:</strong> Dieser Link ist nur 24 Stunden gültig. Falls der Link abgelaufen ist, wenden Sie sich an einen Administrator.
              </div>
              
              <p>Falls Sie diese E-Mail nicht erwartet haben, können Sie sie einfach ignorieren.</p>
            </div>
            <div class="footer">
              <p>Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese E-Mail.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Willkommen!

Sie haben eine Einladung erhalten, sich bei unserer Anwendung zu registrieren.

Um Ihr Konto zu aktivieren und ein Passwort zu erstellen, besuchen Sie bitte den folgenden Link:

${verificationUrl}

Wichtiger Hinweis: Dieser Link ist nur 24 Stunden gültig. Falls der Link abgelaufen ist, wenden Sie sich an einen Administrator.

Falls Sie diese E-Mail nicht erwartet haben, können Sie sie einfach ignorieren.

Diese E-Mail wurde automatisch generiert. Bitte antworten Sie nicht auf diese E-Mail.
    `,
  };
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  try {
    const verificationUrl = `${
      env.NEXTAUTH_URL
    }/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;
    const template = getVerificationEmailTemplate(verificationUrl);

    const mailOptions = {
      from: env.GMAIL,
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Verification email sent successfully:", result.messageId);
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Failed to send verification email");
  }
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  try {
    const resetUrl = `${env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;

    const mailOptions = {
      from: env.GMAIL,
      to: email,
      subject: "Passwort zurücksetzen",
      text: `
Passwort zurücksetzen

Sie haben angefordert, Ihr Passwort zurückzusetzen.

Klicken Sie auf den folgenden Link, um ein neues Passwort zu erstellen:

${resetUrl}

Dieser Link ist nur 1 Stunde gültig.

Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.
      `,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Passwort zurücksetzen</title>
          </head>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2>Passwort zurücksetzen</h2>
              <p>Sie haben angefordert, Ihr Passwort zurückzusetzen.</p>
              <p>Klicken Sie auf den folgenden Link, um ein neues Passwort zu erstellen:</p>
              
              <p style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Passwort zurücksetzen</a>
              </p>
              
              <p><strong>Wichtiger Hinweis:</strong> Dieser Link ist nur 1 Stunde gültig.</p>
              <p>Falls Sie diese Anfrage nicht gestellt haben, können Sie diese E-Mail ignorieren.</p>
            </div>
          </body>
        </html>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Password reset email sent successfully:", result.messageId);
  } catch (error) {
    console.error("Error sending password reset email:", error);
    throw new Error("Failed to send password reset email");
  }
}
