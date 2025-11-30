const dotenv = require('dotenv');
dotenv.config();

// 验证必需的配置项
function validateConfig() {
  const required = [
    'DB_HOST',
    'DB_NAME',
    'DB_USER',
    'DB_PASS',
    'REDIS_HOST',
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  // 验证JWT_SECRET在生产环境
  if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change_this_secret')) {
    throw new Error('JWT_SECRET must be set in production environment');
  }
}

// 仅在非测试环境验证配置
if (process.env.NODE_ENV !== 'test') {
  validateConfig();
}

module.exports = {
  port: parseInt(process.env.PORT || '3000', 10),
  jwtSecret: process.env.JWT_SECRET || 'change_this_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
  },
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    pass: process.env.REDIS_PASS,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  verifTtl: parseInt(process.env.VERIFICATION_CODE_TTL_SECONDS || '600', 10),
  resetTtl: parseInt(process.env.RESET_CODE_TTL_SECONDS || '900', 10),
  tokenTtlSeconds: parseInt(process.env.TOKEN_TTL_SECONDS || '86400', 10)
};
