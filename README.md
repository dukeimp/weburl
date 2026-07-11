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
# 🚀 部署方式

## 创建 Worker

在 Cloudflare Dashboard 创建 Worker，并部署：

```
worker.js
```

---

## 创建 D1 数据库

执行：

```
DB.sql
```

完成初始化。

---

## 配置绑定

Worker 设置：

```
D1 Database Bindings

变量:
DB
```

---

## 环境变量

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
