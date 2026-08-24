const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // e.g. smtp-relay.brevo.com
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // STARTTLS on 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: `"${process.env.EMAIL_FROM_NAME || 'ERP System'}" <${process.env.EMAIL_FROM_ADDRESS}>`,
    to,
    subject,
    html,
  });
};

const sendOtpEmail = (to, otp) =>
  sendEmail({
    to,
    subject: 'Verify your email',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Confirm your email</h2>
        <p>Use the code below to verify your account. It expires in 10 minutes.</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 6px;">${otp}</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });

const sendResetPasswordEmail = (to, resetUrl) =>
  sendEmail({
    to,
    subject: 'Reset your password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Reset your password</h2>
        <p>Click the link below to set a new password. It expires in 15 minutes.</p>
        <p><a href="${resetUrl}" target="_blank">${resetUrl}</a></p>
        <p>If you didn't request this, please secure your account immediately.</p>
      </div>
    `,
  });

const sendPasswordChangedEmail = (to) =>
  sendEmail({
    to,
    subject: 'Your password was changed',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Password changed</h2>
        <p>Your password was just changed and all active sessions on every device were logged out for your security.</p>
        <p>If this wasn't you, contact support immediately.</p>
      </div>
    `,
  });

const sendOrderInvoiceEmail = (to, order) =>
  sendEmail({
    to,
    subject: `Invoice for order #${order.id}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2>Thanks for your order</h2>
        <p>Order <strong>#${order.id}</strong> — total: <strong>${order.totalAmount}</strong></p>
        <p>Status: ${order.status}</p>
      </div>
    `,
  });

module.exports = {
  sendEmail,
  sendOtpEmail,
  sendResetPasswordEmail,
  sendPasswordChangedEmail,
  sendOrderInvoiceEmail,
};
