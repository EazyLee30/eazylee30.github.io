# Gemini API Key 安全设置指南

为了保护 Gemini API Key 不被暴露在前端代码中，代码已改为使用代理 API。请选择以下方案之一：

## 方法 1: 使用 Vercel 部署 (推荐)

1. 将代码推送到 GitHub
2. 在 [Vercel](https://vercel.com) 导入你的 GitHub 仓库
3. 在 Vercel 项目设置中添加环境变量：
   - 名称：`GEMINI_API_KEY`
   - 值：`AIzaSyDnS5TsKWzhcdX_MfEtEKqSwhrvctTNV_g`
4. 部署后，更新 `game/gomoku/index.html` 中的代理 URL：
   ```javascript
   const GEMINI_PROXY_URL = 'https://your-vercel-app.vercel.app/api/gemini';
   ```

## 方法 2: 使用 Netlify 部署

1. 将代码推送到 GitHub
2. 在 [Netlify](https://netlify.com) 导入你的 GitHub 仓库
3. 在 Netlify 项目设置中添加环境变量：
   - 名称：`GEMINI_API_KEY`
   - 值：`AIzaSyDnS5TsKWzhcdX_MfEtEKqSwhrvctTNV_g`
4. 部署后，更新 `game/gomoku/index.html` 中的代理 URL：
   ```javascript
   const GEMINI_PROXY_URL = 'https://your-netlify-app.netlify.app/.netlify/functions/gemini';
   ```

## 方法 3: 使用 GitHub Actions (需要配置)

1. 在 GitHub 仓库中，进入 **Settings** > **Secrets and variables** > **Actions**
2. 添加 Secret：`GEMINI_API_KEY` = `AIzaSyDnS5TsKWzhcdX_MfEtEKqSwhrvctTNV_g`
3. GitHub Actions 会在构建时自动注入 API Key

## 方法 4: 临时方案（仅用于测试）

如果暂时无法设置代理，可以临时在 `game/gomoku/index.html` 中直接使用 API Key（不推荐用于生产环境）：

```javascript
const GEMINI_API_KEY = 'AIzaSyDnS5TsKWzhcdX_MfEtEKqSwhrvctTNV_g';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
// 然后修改 fetch 调用使用直接 API
```

**重要提示：** 
- 不要将包含真实 API Key 的代码提交到公开的 Git 仓库
- 生产环境必须使用代理方案保护 API Key
- 如果 API Key 已泄露，请立即在 Google Cloud Console 中重新生成

