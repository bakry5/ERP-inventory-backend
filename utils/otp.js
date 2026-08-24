const crypto = require('crypto');

// 6-digit numeric OTP for email verification.
const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

// Reset "token" the user actually receives in the email link.
const generateResetToken = () => crypto.randomBytes(32).toString('hex');

// We never store the raw reset token anywhere (Redis included) — only its
// hash. This way, even if Redis is ever compromised, the leaked value can't
// be replayed as a valid reset link.
const hashToken = (rawToken) => crypto.createHash('sha256').update(rawToken).digest('hex');

module.exports = { generateOtp, generateResetToken, hashToken };
