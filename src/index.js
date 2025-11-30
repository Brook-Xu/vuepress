const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize } = require('sequelize');
const config = require('./config');
const createUserModel = require('./models/user');

const app = express();

// CORS支持
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // 允许的源（可以根据需要配置）
  const allowedOrigins = process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : ['http://localhost:8080', 'http://localhost:3000'];
  
  // 处理 CORS
  if (origin && allowedOrigins.includes(origin)) {
    // 源在允许列表中，设置 CORS headers
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    // 没有 origin（如 Postman、curl 等），允许访问
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  // 如果 origin 存在但不在允许列表中，不设置 CORS headers，浏览器会拒绝请求
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 请求日志中间件
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

const sequelize = new Sequelize(config.db.name, config.db.user, config.db.pass, {
  host: config.db.host,
  port: config.db.port,
  dialect: 'mysql',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: {
    // if using SSL, provide certs here
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

const User = createUserModel(sequelize);
const models = { User };

// 数据库连接和初始化
let dbReady = false;
(async () => {
  try {
    await sequelize.authenticate();
    console.log('MySQL: Connected successfully');
    await sequelize.sync({ alter: false }); // 不自动修改表结构
    console.log('MySQL: Tables synced');
    dbReady = true;
  } catch (err) {
    console.error('MySQL: Connection failed', err.message);
    // 不阻止应用启动，但会在使用时失败
  }
})();

const authRouter = require('./routes/auth')(models);
app.use('/api/auth', authRouter);

app.get('/', (req, res) => {
  res.json({ 
    ok: true, 
    message: 'Alibaba Cloud Auth Backend',
    db: dbReady ? 'connected' : 'disconnected'
  });
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    db: dbReady ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// 全局错误处理中间件
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error' 
    : err.message;
  
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const server = app.listen(config.port, () => {
  console.log(`Server: Listening on port ${config.port}`);
});

// 优雅关闭
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(async () => {
    console.log('HTTP server closed');
    
    try {
      await sequelize.close();
      console.log('MySQL connection closed');
    } catch (err) {
      console.error('Error closing MySQL:', err.message);
    }
    
    process.exit(0);
  });
  
  // 强制关闭超时
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
