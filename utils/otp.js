const crypto = require("crypto");

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const generateResetToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (rawToken) =>
  crypto.createHash("sha256").update(rawToken).digest("hex");

module.exports = { generateOtp, generateResetToken, hashToken };
