# 🚀 WebURL - 智能网址导航主页

一个现代化、可自定义的个人导航中心。

基于 **Cloudflare Workers + D1 数据库 + 原生 JavaScript** 构建，无需传统服务器，即可拥有一个高速、安全、动态管理的网址导航平台。

支持：

- 📂 多分类管理
- 🔗 网站链接管理
- 🔍 智能站内搜索
- 🌐 百度 / Google / Bing 多引擎搜索
- 🔒 私密分组
- 🎨 个性化界面
- 📱 移动端适配
- ⚡ Cloudflare 全球边缘加速

---
[在线预览](https://dh.openapi.kdns.fr)

# ✨ 核心功能


## 🔍 智能站内搜索
<img width="1418" height="334" alt="image" src="https://github.com/user-attachments/assets/3a9c2ecd-f64b-43b5-ad52-3f4670a3b98f" />

支持实时模糊搜索：

- 网站名称

- 网站描述

- 网站 URL

  输入关键词即可快速定位导航内容。

  同时保留网络搜索：

- 百度

- Google

- Bing

---

## 📂 分组管理

管理员可以：

- 创建分类
- 编辑分类
- 删除分类
- 调整排序
- 设置私密分组

---
<img width="1511" height="1013" alt="image" src="https://github.com/user-attachments/assets/98863aa0-74cc-4648-ad0c-f03ed7aa9285" />

## 🔗 网站管理

支持：

- 添加网站
- 编辑网站信息
- 删除网站
- 自定义图标
- 自动获取网站标题和描述
- 拖拽调整顺序

---

# ☁️ 技术架构

## 后端

- Cloudflare Workers

- Cloudflare D1 Database

  优势：
- 无服务器
- 全球节点访问
- 自动扩展
- 低维护成本

[项目地址](https://github.com/dukeimp/weburl)
---
# 🚀 后端部署方式

## 创建 Worker

在 Cloudflare Dashboard 创建 Worker，并部署：

```
worker.js    替换项目中的源码
```
<img width="1003" height="967" alt="image" src="https://github.com/user-attachments/assets/5b4b83d2-6efd-4c42-97c5-f03b69f3ecfc" />

---

## 创建 D1 数据库
<img width="1331" height="789" alt="image" src="https://github.com/user-attachments/assets/bf5cf5e4-c3b3-4d55-b5b9-36451f080458" />

执行：

```
DB.sql

-- 创建分组表
CREATE TABLE Groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    order_num INTEGER DEFAULT 0,
    is_private BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 创建链接表
CREATE TABLE Links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    logo TEXT,
    description TEXT,
    group_id INTEGER,
    order_num INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES Groups(id) ON DELETE CASCADE
); 

-- 背景设置表
CREATE TABLE BackgroundSettings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    image_data TEXT,
    image_source TEXT,
    mode TEXT DEFAULT 'cover',
    opacity INTEGER DEFAULT 50,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

完成初始化。

---

## 配置绑定
<img width="1259" height="840" alt="image" src="https://github.com/user-attachments/assets/b1fd9747-94e0-4de7-b0bb-b439b24b954e" />

Worker 设置：

```
D1 Database Bindings

变量:

DB
```
---

## 环境变量
<img width="968" height="279" alt="image" src="https://github.com/user-attachments/assets/d2b6ce22-beff-4894-8162-fd22588d43f7" />

配置：

```
ADMIN_PASSWORD
JWT_SECRET
```
---
## 前端

- HTML5
- CSS3
- JavaScript
  特点：
- 无框架依赖
- 加载速度快
- 易于二次开发

---
[项目地址](https://github.com/dukeimp/weburl)
---
# 🚀 前端部署方式

## 创建 Worker
修改static/api.js  的后端接口地址  const API_BASE_URL = 'https://your-worker.workers.dev/api'; 
<img width="645" height="256" alt="image" src="https://github.com/user-attachments/assets/0baa9402-d831-4b4c-a521-089ecbcf47ed" />

在 Cloudflare Dashboard 创建 Worker，并部署：

选择  Upload your static files
上传并部署  拖入  项目目录  static中的所有文件夹
<img width="823" height="587" alt="image" src="https://github.com/user-attachments/assets/caac34ec-f183-4b15-898a-d16e075ca36e" />


# 📁 项目结构

```
.
├── DB.sql
├── worker.js
└── static/
    ├── index.html
    ├── app.js
    ├── api.js
    ├── styles.css
    └── favicon.svg
```
---

# 📄 License

MIT License

---

# 👨‍💻 作者

[dukeimp](https://github.com/dukeimp)

---

# 🙏 鸣谢

感谢：

- Cloudflare Workers

- Cloudflare D1

- Font Awesome

- DuckDuckGo Icon API

  以及所有贡献者和使用者。
