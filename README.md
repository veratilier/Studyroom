# Studyroom · BIO101 学习室

BIO101 静态学习网站，包含分讲词卡、拼写练习、词汇搜索、课堂线索和原始学习资料。

## 网站

- 自定义域名：https://study.r-vera.com
- Sites 地址：https://bio101-study-rcera.q6r6nrp7qy.chatgpt.site
- 当前网站托管于 Sites，Cloudflare 管理自定义域名的 DNS；Sites 访问权限设为仅所有者。
- 此仓库用于保存源码，推送 GitHub 不会自动发布网站。

## 文件

- `public/index.html`：页面结构
- `public/style.css`：响应式样式
- `public/app.js`：词卡、拼写、复习与浏览器本地进度
- `public/words.json`：145 个词条，第一讲 59 个
- `public/lecture-01.pdf`：第一讲课件
- `public/glossary.xlsx`：原始词表
- `.openai/hosting.json`：当前 Sites 项目标识和静态输出配置，不含凭据

## 本地运行

```sh
python3 -m http.server 8000 --directory public
```

打开 http://localhost:8000 。词表通过 fetch 加载，不能直接双击 HTML。

## 静态发布文件

```sh
mkdir -p dist
cp -R public/. dist/
```

把 `dist/` 作为静态输出目录。所有资源保持相对路径。

## 学习进度与后续扩展

进度当前保存在 localStorage，键为 `vera-bio101-progress-v1`，按浏览器和域名隔离，不自动跨设备同步，也不会从旧域名自动迁移。

后续可通过 Workers 后端接入 D1 保存进度与笔记，通过 R2 保存上传文件；这些后端与同步功能目前尚未实现。部署用 API Token 不应放入仓库或前端代码。

第一讲资料已提供，其余讲次目前只有词汇。释义与词根主要保留教师原文，属于助记资料，概念理解请结合课件。听读使用浏览器 Web Speech API，声音取决于设备。
