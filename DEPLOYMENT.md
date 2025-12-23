# 🌐 炸弹猫 - 线上部署指南

本指南帮助你将炸弹猫游戏部署到云服务器，实现跨网络联机游玩。

## 📋 部署选项对比

| 方案             | 难度        | 费用     | 推荐场景     |
| ---------------- | ----------- | -------- | ------------ |
| Vercel + Railway | ⭐ 简单     | 免费起步 | 推荐首选     |
| Render           | ⭐ 简单     | 免费     | 备选方案     |
| 自建 VPS         | ⭐⭐⭐ 复杂 | $5+/月   | 需要完全控制 |

---

## 🚀 方案一：Vercel（前端）+ Railway（后端）【推荐】

### 步骤 1：准备代码

确保项目有 `.gitignore` 并推送到 GitHub:

```bash
cd /Users/bytedance/fe/explode_cat
git init
git add .
git commit -m "Initial commit"
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```

### 步骤 2：部署后端到 Railway

1. 访问 [railway.app](https://railway.app) 并用 GitHub 登录
2. 点击 "New Project" → "Deploy from GitHub repo"
3. 选择你的仓库
4. 配置:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. 部署完成后获取 URL，如 `https://xxx.railway.app`

### 步骤 3：更新前端连接后端地址

修改 `client/src/stores/socketStore.ts`:

```typescript
// 生产环境使用环境变量
const serverUrl =
  import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`;
```

创建 `client/.env.production`:

```
VITE_SERVER_URL=https://xxx.railway.app
```

### 步骤 4：部署前端到 Vercel

1. 访问 [vercel.com](https://vercel.com) 并用 GitHub 登录
2. 点击 "Import Project" 选择你的仓库
3. 配置:
   - **Framework**: Vite
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. 点击 Deploy

### 步骤 5：访问游戏

前端地址：`https://your-app.vercel.app`

---

## 🚀 方案二：Render（一站式部署）

### 后端部署

1. 访问 [render.com](https://render.com) 并注册
2. 创建 "Web Service"
3. 连接 GitHub 仓库
4. 配置:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

### 前端部署

1. 创建 "Static Site"
2. 配置:
   - **Root Directory**: `client`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`

---

## 🛠 生产环境准备

### 1. 添加服务端生产脚本

在 `server/package.json` 中确保有:

```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc"
  }
}
```

### 2. 环境变量配置

后端 (Railway/Render 环境变量):

```
PORT=3001
NODE_ENV=production
```

前端 `client/.env.production`:

```
VITE_SERVER_URL=https://your-backend-url.railway.app
```

### 3. 更新 CORS 配置（已完成）

`server/src/index.ts` 中 CORS 已设置为 `origin: true`，支持任意来源。

---

## 📝 域名配置（可选）

1. 购买域名（如阿里云、Cloudflare）
2. 在 Vercel/Railway 添加自定义域名
3. 配置 DNS 解析

---

## ⚡ 性能优化建议

- 使用 CDN 加速静态资源
- 启用 Gzip 压缩
- 考虑使用 Redis 做房间状态持久化
- 添加健康检查端点（已有 `/health`）

---

## 🔒 安全建议

- 生产环境限制 CORS 来源
- 添加速率限制防止 DDoS
- 不要在日志中暴露敏感信息
- 定期更新依赖
