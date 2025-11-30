const redis = require('redis');
const config = require('./config');

// 支持有密码和无密码的 Redis 连接
const redisUrl = config.redis.pass 
  ? `redis://:${config.redis.pass}@${config.redis.host}:${config.redis.port}`
  : `redis://${config.redis.host}:${config.redis.port}`;

const client = redis.createClient({
  url: redisUrl,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis: Max reconnection attempts reached');
        return new Error('Max reconnection attempts reached');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

let isConnected = false;

client.on('error', (err) => {
  console.error('Redis Client Error:', err.message);
  isConnected = false;
});

client.on('connect', () => {
  console.log('Redis: Connecting...');
});

client.on('ready', () => {
  console.log('Redis: Connected and ready');
  isConnected = true;
});

client.on('reconnecting', () => {
  console.log('Redis: Reconnecting...');
  isConnected = false;
});

// 连接Redis
(async () => {
  try {
    await client.connect();
  } catch (err) {
    console.error('Redis: Failed to connect:', err.message);
    // 不抛出错误，允许应用启动，但会在使用时失败
  }
})();

// 优雅关闭
process.on('SIGINT', async () => {
  if (isConnected) {
    await client.quit();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  if (isConnected) {
    await client.quit();
  }
  process.exit(0);
});

module.exports = client;
