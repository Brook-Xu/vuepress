const jwt = require('jsonwebtoken');
const config = require('../config');
const redisClient = require('../redis');

async function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization;
    
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const token = auth.slice(7);
    
    if (!token) {
      return res.status(401).json({ error: 'Token required' });
    }
    
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      throw err;
    }
    
    // 检查token格式
    const jti = payload.jti;
    if (!jti) {
      return res.status(401).json({ error: 'Malformed token' });
    }
    
    // 检查黑名单
    try {
      const blackKey = `black_${jti}`;
      const isBlack = await redisClient.get(blackKey);
      if (isBlack) {
        return res.status(401).json({ error: 'Token revoked' });
      }
    } catch (err) {
      // Redis错误不应该阻止认证，但应该记录
      console.error('Redis error in auth middleware:', err.message);
      // 继续执行，允许请求通过（可以根据需要调整策略）
    }
    
    req.user = payload;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = authMiddleware;
