# WebURL

WebURL 是一个部署在 Cloudflare Workers 上的个人网址导航与管理系统。当前版本采用**单 Worker 架构**：同一个 Worker 同时提供静态页面、管理 API 和 D1 数据访问，不再需要分别部署前端与后端。

部署完成后，通过你在 `wrangler.toml` 中配置的自定义域名访问。

## 功能

- 分组展示、创建、编辑、删除与排序
- 链接创建、编辑、删除、跨分组拖拽和排序
- 公开分组与仅管理员可见的私密分组
- 名称、描述和 URL 的站内实时搜索
- 百度、Google、Bing 外部搜索
- 管理员登录及 24 小时会话令牌
- 自动获取网页标题、描述和站点图标
- 自定义背景图片、显示模式和透明度
- 响应式桌面及移动端界面
- Cloudflare 全球边缘网络与 D1 持久化

## 架构

```text
浏览器
  └─ https://nav.example.com（替换为你的域名）
       └─ Cloudflare Worker: weburl
            ├─ /api/*  → worker.js → D1 binding: DB → weburl-db
            └─ 其他路径 → static/ 静态资源
```

主要文件：

| 文件 | 用途 |
| --- | --- |
| `worker.js` | API、鉴权、输入校验、远程网页抓取及静态资源转发 |
| `static/index.html` | 页面结构与管理弹窗 |
| `static/app.js` | 页面状态、搜索、编辑和拖拽交互 |
| `static/api.js` | 同源 `/api` 请求封装和会话管理 |
| `static/styles.css` | 页面样式 |
| `DB.sql` | 新数据库的初始表结构，仅用于全新环境 |
| `wrangler.toml` | Worker、静态资源、自定义域名和 D1 绑定配置 |

## 安全设计

- 使用 Web Crypto HMAC-SHA256 签发和校验管理员 JWT，签名密钥不会写入令牌。
- `ADMIN_PASSWORD`、`JWT_SECRET` 必须使用 Cloudflare Secret，不应写入仓库或 `wrangler.toml`。
- 管理令牌只存放在 `sessionStorage`，关闭标签页后自动清除。
- 写操作和远程网页抓取均要求管理员身份。
- 对名称、描述、ID、排序值、URL 协议和数据长度进行服务端校验。
- 页面输出进行 HTML/属性转义，并拒绝 `javascript:` 等非 HTTP(S) 链接。
- 远程抓取限制协议、内网地址、重定向次数、超时时间和响应大小，以降低 SSRF 与资源耗尽风险。
- API 仅允许生产站点和本地开发地址跨域访问；单体部署正常使用同源请求。
- 静态响应包含 CSP、禁止 iframe 嵌入、MIME 嗅探防护等安全头。
- 分组级联删除使用 D1 `batch()`，避免不受支持的手写 `BEGIN/COMMIT`。

## 环境要求

- Node.js 20 或更高版本
- npm
- Cloudflare 账户
- Wrangler 已登录：`npx wrangler login`

安装依赖：

```bash
npm install
```

## 全新部署

以下步骤只适用于新环境。已有生产数据库不要重新执行 `DB.sql`。

1. 创建 D1：

   ```bash
   npx wrangler d1 create weburl-db
   ```

2. 将返回的数据库名称和 ID 写入 `wrangler.toml`，替换示例值 `weburl-db` 和全零 ID。

3. 初始化新数据库：

   ```bash
   npx wrangler d1 execute weburl-db --remote --file DB.sql
   ```

4. 配置 Secret：

   ```bash
   npx wrangler secret put ADMIN_PASSWORD
   npx wrangler secret put JWT_SECRET
   ```

   `JWT_SECRET` 建议使用至少 32 字节的密码学随机值。

5. 将 `wrangler.toml` 中的 `nav.example.com` 修改为自己的 Cloudflare 域名，然后部署：

   ```bash
   npm run check
   npm run deploy
   ```

## 本地开发

创建不会提交到 Git 的 `.dev.vars`：

```dotenv
ADMIN_PASSWORD=本地管理密码
JWT_SECRET=至少32字节的本地随机密钥
```

初始化本地 D1 并启动：

```bash
npx wrangler d1 execute weburl-db --local --file DB.sql
npm run dev
```

默认访问 `http://localhost:8787`。本地 D1 与生产 D1 相互独立。

## 生产更新流程

建议每次按以下顺序操作：

```bash
# 1. 安装锁定依赖
npm install

# 2. 备份生产数据库
New-Item -ItemType Directory -Force backups
npx wrangler d1 export weburl-db --remote --output backups/weburl-db.sql

# 3. 语法和部署构建检查
npm run check

# 4. 发布 Worker 与静态资源
npm run deploy

# 5. 查看实时日志
npm run tail
```

部署不会执行 `DB.sql`，也不会自动清空或重建 D1。`wrangler.toml` 通过固定数据库 ID 绑定目标数据库。

## 常用维护命令

```bash
# 登录及账户确认
npx wrangler whoami

# 查看 Worker 部署历史
npx wrangler deployments list --name weburl

# 查看 Worker 版本
npx wrangler versions list --name weburl

# 查看实时日志
npx wrangler tail weburl

# 查看 D1 数据库列表
npx wrangler d1 list

# 只读检查记录数
npx wrangler d1 execute weburl-db --remote --command "SELECT COUNT(*) FROM Groups; SELECT COUNT(*) FROM Links;"

# 导出生产备份
npx wrangler d1 export weburl-db --remote --output backups/weburl-db.sql

# 修改管理员密码
npx wrangler secret put ADMIN_PASSWORD

# 轮换 JWT 密钥（会使全部已登录会话失效）
npx wrangler secret put JWT_SECRET

# 回滚到指定 Worker 版本
npx wrangler rollback <VERSION_ID> --name weburl
```

## 数据库维护注意事项

- `DB.sql` 是新环境初始化脚本，不是生产升级脚本。
- 对生产库执行写 SQL 前必须先导出备份。
- 日常部署不需要运行任何 D1 初始化命令。
- 不要修改 `wrangler.toml` 中生产 D1 的 `database_id`，除非明确进行数据库迁移。
- 删除分组会同时删除该分组中的链接，这是产品既有行为。

## 故障排查

- 页面能打开但数据加载失败：检查浏览器网络面板中的 `/api/groups`，并运行 `npx wrangler tail weburl`。
- 登录后立即退出：确认 `ADMIN_PASSWORD` 与 `JWT_SECRET` 已配置为 Worker Secret。
- 图标或网页信息获取失败：目标网站可能拒绝抓取、发生超时、响应过大或解析到非公网地址。
- D1 报绑定错误：核对 `wrangler.toml` 中 `binding = "DB"` 和数据库 ID。
- 部署后异常：从 `versions list` 找到上一个版本并使用 `wrangler rollback`。

## License

MIT
