const nodemailer = require('nodemailer');
const config = require('../config');

// 验证邮箱格式
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: {
    user: config.smtp.user,
    pass: config.smtp.pass
  }
});

// 验证transporter配置
let transporterVerified = false;
(async () => {
  try {
    await transporter.verify();
    transporterVerified = true;
    console.log('SMTP: Transporter verified');
  } catch (err) {
    console.error('SMTP: Transporter verification failed:', err.message);
  }
})();

async function sendVerificationCode(toEmail, code) {
  if (!isValidEmail(toEmail)) {
    throw new Error('Invalid email format');
  }
  
  if (!transporterVerified) {
    throw new Error('SMTP transporter not verified');
  }
  
  try {
    const info = await transporter.sendMail({
      from: config.smtp.user,
      to: toEmail,
      subject: 'Your verification code',
      text: `Your verification code is: ${code}. It expires in ${Math.floor(config.verifTtl / 60)} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Verification Code</h2>
          <p>Your verification code is:</p>
          <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code expires in ${Math.floor(config.verifTtl / 60)} minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `
    });
    return info;
  } catch (err) {
    console.error('SMTP: Failed to send verification code:', err.message);
    throw err;
  }
}

async function sendResetCode(toEmail, code) {
  if (!isValidEmail(toEmail)) {
    throw new Error('Invalid email format');
  }
  
  if (!transporterVerified) {
    throw new Error('SMTP transporter not verified');
  }
  
  try {
    const info = await transporter.sendMail({
      from: config.smtp.user,
      to: toEmail,
      subject: 'Your password reset code',
      text: `Your password reset code is: ${code}. It expires in ${Math.floor(config.resetTtl / 60)} minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Code</h2>
          <p>Your password reset code is:</p>
          <div style="background: #f4f4f4; padding: 20px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${code}
          </div>
          <p>This code expires in ${Math.floor(config.resetTtl / 60)} minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `
    });
    return info;
  } catch (err) {
    console.error('SMTP: Failed to send reset code:', err.message);
    throw err;
  }
}

module.exports = {
  sendVerificationCode,
  sendResetCode
};
