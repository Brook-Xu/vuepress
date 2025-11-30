# Alibaba Cloud - User Auth Backend (Node.js + Express)

**What this project contains**

A minimal, production-minded backend for user authentication that:
- Email+password registration (with email verification via verification code)
- Email login (with JWT)
- Password reset (via email verification code)
- Password change
- Logout (JWT blacklisting using Redis)
- Uses Alibaba Cloud services:
  - **ApsaraDB RDS (MySQL)** — stores user records
  - **ApsaraDB for Redis** — stores short-lived verification codes and token blacklist
  - **DirectMail (SMTP)** — send verification codes and reset emails

> This project is a template. Replace the placeholder configuration values in `.env` or environment variables
> with your Alibaba Cloud resource endpoints/credentials.

## Quick features
- Password hashing with bcrypt
- JWT authentication with token invalidation (blacklist in Redis)
- Verification/reset codes stored in Redis with TTL (configurable)
- Sequelize ORM for MySQL
- Nodemailer with SMTP to send email through Alibaba Cloud DirectMail

---

## Files
- `src/index.js` — app entry
- `src/config.js` — centralized config (from env)
- `src/models/user.js` — Sequelize user model
- `src/routes/auth.js` — auth endpoints
- `src/middleware/auth.js` — JWT auth middleware
- `src/mail/mailer.js` — nodemailer using DirectMail SMTP
- `.env.example` — example environment variables
- `init-db.sql` — SQL to create `users` table if needed

---

## API 端点详细说明

### 1. 用户注册（两步验证）

#### 1.1 注册请求 - 发送验证码
```http
POST /api/auth/register/request
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "verification code sent to email"
}
```

**说明：**
- 创建未验证用户账户
- 生成 6 位验证码并发送到邮箱
- 验证码存储在 Redis 中，默认有效期 10 分钟

#### 1.2 验证注册码
```http
POST /api/auth/register/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456"
}
```

**响应示例：**
```json
{
  "ok": true
}
```

**说明：**
- 验证码正确后激活用户账户
- 验证码使用后自动删除

---

### 2. 用户登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password"
}
```

**成功响应：**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**说明：**
- 仅已验证用户可登录
- 返回 JWT 令牌，用于后续请求认证
- 令牌默认有效期 24 小时

---

### 3. 用户登出

```http
POST /api/auth/logout
Authorization: Bearer <your_jwt_token>
```

**响应示例：**
```json
{
  "ok": true
}
```

**说明：**
- 将令牌加入 Redis 黑名单
- 黑名单中的令牌将无法使用

---

### 4. 忘记密码

#### 4.1 请求重置密码验证码
```http
POST /api/auth/password/forgot
Content-Type: application/json

{
  "email": "user@example.com"
}
```

**响应示例：**
```json
{
  "ok": true,
  "message": "reset code sent if email exists"
}
```

**说明：**
- 发送 6 位重置验证码到邮箱
- 验证码存储在 Redis 中，默认有效期 15 分钟

#### 4.2 重置密码
```http
POST /api/auth/password/reset
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "newPassword": "new_password"
}
```

**响应示例：**
```json
{
  "ok": true
}
```

---

### 5. 修改密码（需登录）

```http
PUT /api/auth/password
Authorization: Bearer <your_jwt_token>
Content-Type: application/json

{
  "oldPassword": "old_password",
  "newPassword": "new_password"
}
```

**响应示例：**
```json
{
  "ok": true
}
```

**说明：**
- 需要提供正确的旧密码
- 新密码会自动加密存储

---

## 使用示例

### 使用 curl 测试 API

**1. 注册新用户：**
```bash
# 步骤 1: 请求注册验证码
curl -X POST http://localhost:3000/api/auth/register/request \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 步骤 2: 验证邮箱（检查邮箱获取验证码）
curl -X POST http://localhost:3000/api/auth/register/verify \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456"}'
```

**2. 登录：**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 保存返回的 token 用于后续请求
TOKEN="your_jwt_token_here"
```

**3. 修改密码（需要认证）：**
```bash
curl -X PUT http://localhost:3000/api/auth/password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"oldPassword":"password123","newPassword":"newpassword456"}'
```

**4. 登出：**
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

### 使用 Postman 或类似工具

1. 导入 API 端点到 Postman
2. 设置环境变量 `base_url = http://localhost:3000`
3. 登录后保存 `token` 到环境变量
4. 在需要认证的请求中添加 Header: `Authorization: Bearer {{token}}`

### 常见错误处理

- **400 Bad Request**: 请求参数缺失或格式错误
- **401 Unauthorized**: 令牌无效、过期或已被撤销
- **403 Forbidden**: 邮箱未验证
- **404 Not Found**: 用户不存在

---

## 运行和使用指南 (Setup & Usage)

### 前置要求

- Node.js (推荐 v14 或更高版本)
- MySQL 数据库（阿里云 ApsaraDB RDS 或本地 MySQL）
- Redis 服务（阿里云 ApsaraDB for Redis 或本地 Redis）
- 阿里云 DirectMail SMTP 账号（用于发送邮件）

### 步骤 1: 安装依赖

```bash
npm install
```

### 步骤 2: 配置环境变量

创建 `.env` 文件（在项目根目录），并填入以下配置：

```env
# 服务器配置
PORT=3000

# JWT 配置
JWT_SECRET=your_jwt_secret_key_change_this_in_production
JWT_EXPIRES_IN=1d

# MySQL 数据库配置（阿里云 ApsaraDB RDS）
DB_HOST=your_mysql_host
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_mysql_username
DB_PASS=your_mysql_password

# Redis 配置（阿里云 ApsaraDB for Redis）
REDIS_HOST=your_redis_host
REDIS_PORT=6379
REDIS_PASS=your_redis_password

# SMTP 配置（阿里云 DirectMail）
SMTP_HOST=smtpdm.aliyun.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_smtp_username
SMTP_PASS=your_smtp_password

# 验证码过期时间（秒）
VERIFICATION_CODE_TTL_SECONDS=600    # 注册验证码有效期 10 分钟
RESET_CODE_TTL_SECONDS=900           # 重置密码验证码有效期 15 分钟
TOKEN_TTL_SECONDS=86400              # JWT 令牌有效期 24 小时
```

### 步骤 3: 初始化数据库

**方式一：使用 Sequelize 自动创建表（推荐）**
- 直接运行项目，Sequelize 会自动创建 `users` 表

**方式二：手动执行 SQL 脚本**
```bash
# 连接到你的 MySQL 数据库，然后执行：
mysql -h your_host -u your_user -p your_database < init-db.sql
```

### 步骤 4: 启动服务

**开发模式（自动重启）：**
```bash
npm run dev
```

**生产模式：**
```bash
npm start
```

服务启动后，默认运行在 `http://localhost:3000`

### 步骤 5: 验证服务

访问根路径测试服务是否正常：
```bash
curl http://localhost:3000
```

应该返回：
```json
{"ok":true,"message":"Alibaba Cloud Auth Backend"}
```

---

## Alibaba Cloud notes

- **DirectMail (邮件推送/SMTP):** Create a DirectMail account and obtain SMTP credentials (SMTP server host, port, username, password). Use them in `.env`.
- **ApsaraDB RDS for MySQL:** Provide endpoint, port, username, password, and database name in `.env`.
- **ApsaraDB for Redis (Memcache/Redis):** Provide host, port, and password in `.env`.
- **Security:** In production use TLS/SSL for MySQL and secure network access rules (VPC, Security Group). Use environment variables or secret manager for production secrets.

---

## License
MIT
