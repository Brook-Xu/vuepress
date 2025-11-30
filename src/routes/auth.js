const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');
const config = require('../config');
const redisClient = require('../redis');
const { sendVerificationCode, sendResetCode } = require('../mail/mailer');

module.exports = (models) => {
  const User = models.User;

  // 生成指定长度的验证码（确保总是6位）
  function genCode(len = 6) {
    const min = Math.pow(10, len - 1);
    const max = Math.pow(10, len) - 1;
    return Math.floor(min + Math.random() * (max - min + 1)).toString();
  }

  // 验证邮箱格式（更严格的验证）
  function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    // 基本格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return false;
    }
    // 长度限制（RFC 5321）
    if (email.length > 254) {
      return false;
    }
    // 本地部分长度限制（@ 之前的部分）
    const localPart = email.split('@')[0];
    if (localPart.length > 64) {
      return false;
    }
    return true;
  }

  // 验证密码强度（至少6位）
  function isValidPassword(password) {
    return password && password.length >= 6;
  }

  // 统一错误响应
  function errorResponse(res, statusCode, message) {
    return res.status(statusCode).json({ error: message });
  }

  // Request registration: create user (unverified) and send code
  router.post('/register/request', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      // 输入验证
      if (!email || !password) {
        return errorResponse(res, 400, 'email and password required');
      }
      
      // 规范化邮箱（转小写，去除空格）
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'invalid email format');
      }
      
      if (!isValidPassword(password)) {
        return errorResponse(res, 400, 'password must be at least 6 characters');
      }

      // 使用事务确保数据一致性，防止并发问题
      const transaction = await models.User.sequelize.transaction();
      
      try {
        // 在事务内检查邮箱是否已注册（防止竞态条件）
        const existing = await User.findOne({ 
          where: { email: normalizedEmail },
          transaction 
        });
        if (existing) {
          await transaction.rollback();
          return errorResponse(res, 400, 'email already registered');
        }

        const password_hash = await bcrypt.hash(password, 12);
        const user = await User.create(
          { email: normalizedEmail, password_hash, verified: false },
          { transaction }
        );

        // 生成验证码
        const code = genCode(6);
        const key = `verif_${normalizedEmail}`;
        
        // Redis 操作（如果失败，回滚事务）
        try {
          await redisClient.setEx(key, config.verifTtl, code);
        } catch (redisErr) {
          await transaction.rollback();
          console.error('Redis error in register request:', redisErr.message);
          return errorResponse(res, 500, 'Failed to store verification code');
        }
        
        // 提交事务（用户已创建，验证码已存储）
        await transaction.commit();
        
        // 发送邮件（失败不影响用户创建和验证码存储）
        try {
          await sendVerificationCode(normalizedEmail, code);
        } catch (err) {
          console.error('SMTP: Failed to send verification code:', err.message);
          // 邮件发送失败，但用户已创建，可以稍后重试验证
        }

        return res.json({ ok: true, message: 'verification code sent to email' });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      // 处理 Sequelize 唯一约束错误
      if (err.name === 'SequelizeUniqueConstraintError') {
        return errorResponse(res, 400, 'email already registered');
      }
      console.error('Register request error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Verify registration code
  router.post('/register/verify', async (req, res) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return errorResponse(res, 400, 'email and code required');
      }
      
      // 规范化邮箱
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'invalid email format');
      }
      
      // 验证码应该是6位数字
      if (!/^\d{6}$/.test(code.trim())) {
        return errorResponse(res, 400, 'invalid code format');
      }

      const key = `verif_${normalizedEmail}`;
      let saved;
      
      try {
        saved = await redisClient.get(key);
      } catch (redisErr) {
        console.error('Redis error in register verify:', redisErr.message);
        return errorResponse(res, 500, 'Failed to verify code');
      }
      
      if (!saved) {
        return errorResponse(res, 400, 'code expired or not found');
      }
      
      if (saved !== code.trim()) {
        return errorResponse(res, 400, 'invalid code');
      }

      const user = await User.findOne({ where: { email: normalizedEmail } });
      if (!user) {
        return errorResponse(res, 404, 'user not found');
      }
      
      // 如果已经验证过，直接返回成功
      if (user.verified) {
        // 删除验证码（如果还存在）
        try {
          await redisClient.del(key);
        } catch (redisErr) {
          // 忽略删除错误
        }
        return res.json({ ok: true });
      }
      
      // 使用事务确保原子性
      const transaction = await models.User.sequelize.transaction();
      try {
        user.verified = true;
        await user.save({ transaction });
        
        // 删除验证码（使用后立即删除，防止重用）
        try {
          await redisClient.del(key);
        } catch (redisErr) {
          console.error('Redis error deleting verification code:', redisErr.message);
          // 即使删除失败，也继续（验证码已过期）
        }
        
        await transaction.commit();
        return res.json({ ok: true });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error('Register verify error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Login
  router.post('/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return errorResponse(res, 400, 'email and password required');
      }
      
      // 规范化邮箱
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'invalid email format');
      }

      const user = await User.findOne({ where: { email: normalizedEmail } });
      
      // 统一错误信息，防止用户枚举
      if (!user) {
        return errorResponse(res, 400, 'invalid credentials');
      }
      
      if (!user.verified) {
        return errorResponse(res, 403, 'email not verified');
      }

      const matched = await bcrypt.compare(password, user.password_hash);
      if (!matched) {
        return errorResponse(res, 400, 'invalid credentials');
      }

      const jti = uuidv4();
      const payload = { sub: user.id, email: user.email, jti };
      const token = jwt.sign(payload, config.jwtSecret, { expiresIn: config.jwtExpiresIn });

      return res.json({ token });
    } catch (err) {
      console.error('Login error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Logout — blacklist token
  router.post('/logout', async (req, res) => {
    try {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Bearer ')) {
        return errorResponse(res, 401, 'Unauthorized');
      }
      
      const token = auth.slice(7);
      if (!token) {
        return errorResponse(res, 401, 'Token required');
      }
      
      let payload;
      try {
        payload = jwt.verify(token, config.jwtSecret, { ignoreExpiration: true });
      } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
          return errorResponse(res, 401, 'invalid or expired token');
        }
        throw err;
      }
      
      const jti = payload.jti;
      if (!jti) {
        return errorResponse(res, 400, 'invalid token');
      }
      
      // 计算剩余TTL（如果token已过期，使用配置的TTL）
      let ttl = config.tokenTtlSeconds;
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        const remaining = payload.exp - now;
        if (remaining > 0) {
          ttl = remaining;
        }
      }
      
      const key = `black_${jti}`;
      try {
        await redisClient.setEx(key, ttl, '1');
      } catch (redisErr) {
        console.error('Redis error in logout:', redisErr.message);
        // Redis 失败不应该阻止登出，但应该记录
        // 返回成功，因为 token 在客户端已被清除
      }
      
      return res.json({ ok: true });
    } catch (err) {
      console.error('Logout error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Forgot password — send reset code
  router.post('/password/forgot', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return errorResponse(res, 400, 'email required');
      }
      
      // 规范化邮箱
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'invalid email format');
      }

      const user = await User.findOne({ where: { email: normalizedEmail } });
      
      // 统一响应，防止用户枚举（即使邮箱不存在也返回成功）
      // 但实际只在用户存在时发送邮件
      if (user) {
        const code = genCode(6);
        const key = `reset_${normalizedEmail}`;
        
        try {
          await redisClient.setEx(key, config.resetTtl, code);
        } catch (redisErr) {
          console.error('Redis error in forgot password:', redisErr.message);
          // Redis 失败不影响响应（安全考虑）
        }
        
        try {
          await sendResetCode(normalizedEmail, code);
        } catch (err) {
          console.error('SMTP: Failed to send reset code:', err.message);
          // 邮件发送失败，但返回成功（安全考虑）
        }
      }
      
      // 统一返回成功消息，防止邮箱枚举
      return res.json({ ok: true, message: 'reset code sent if email exists' });
    } catch (err) {
      console.error('Forgot password error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Reset password using code
  router.post('/password/reset', async (req, res) => {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return errorResponse(res, 400, 'email, code and newPassword required');
      }
      
      // 规范化邮箱
      const normalizedEmail = email.trim().toLowerCase();
      
      if (!isValidEmail(normalizedEmail)) {
        return errorResponse(res, 400, 'invalid email format');
      }
      
      if (!isValidPassword(newPassword)) {
        return errorResponse(res, 400, 'password must be at least 6 characters');
      }
      
      // 验证码应该是6位数字
      const trimmedCode = code.trim();
      if (!/^\d{6}$/.test(trimmedCode)) {
        return errorResponse(res, 400, 'invalid code format');
      }

      const key = `reset_${normalizedEmail}`;
      let saved;
      
      try {
        saved = await redisClient.get(key);
      } catch (redisErr) {
        console.error('Redis error in reset password:', redisErr.message);
        return errorResponse(res, 500, 'Failed to verify reset code');
      }
      
      if (!saved) {
        return errorResponse(res, 400, 'code expired or not found');
      }
      
      if (saved !== trimmedCode) {
        return errorResponse(res, 400, 'invalid code');
      }

      const user = await User.findOne({ where: { email: normalizedEmail } });
      if (!user) {
        return errorResponse(res, 404, 'user not found');
      }

      // 使用事务确保原子性
      const transaction = await models.User.sequelize.transaction();
      try {
        user.password_hash = await bcrypt.hash(newPassword, 12);
        await user.save({ transaction });
        
        // 删除验证码（使用后立即删除，防止重用）
        try {
          await redisClient.del(key);
        } catch (redisErr) {
          console.error('Redis error deleting reset code:', redisErr.message);
          // 即使删除失败，也继续（验证码已过期）
        }
        
        await transaction.commit();
        return res.json({ ok: true });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error('Reset password error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  // Change password (authenticated)
  const authMiddleware = require('../middleware/auth');
  router.put('/password', authMiddleware, async (req, res) => {
    try {
      const { oldPassword, newPassword } = req.body;
      
      if (!oldPassword || !newPassword) {
        return errorResponse(res, 400, 'oldPassword and newPassword required');
      }
      
      if (!isValidPassword(newPassword)) {
        return errorResponse(res, 400, 'password must be at least 6 characters');
      }
      
      // 新旧密码不能相同
      if (oldPassword === newPassword) {
        return errorResponse(res, 400, 'new password must be different from old password');
      }

      const uid = req.user.sub;
      const user = await User.findByPk(uid);
      if (!user) {
        return errorResponse(res, 404, 'user not found');
      }

      const matched = await bcrypt.compare(oldPassword, user.password_hash);
      if (!matched) {
        return errorResponse(res, 400, 'old password incorrect');
      }

      // 使用事务确保原子性
      const transaction = await models.User.sequelize.transaction();
      try {
        user.password_hash = await bcrypt.hash(newPassword, 12);
        await user.save({ transaction });
        await transaction.commit();
        return res.json({ ok: true });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error('Change password error:', err);
      return errorResponse(res, 500, 'internal server error');
    }
  });

  return router;
};
