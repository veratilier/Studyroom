# Studyroom · BIO101 学习室

网站：https://study.r-vera.com

由 GitHub Pages 直接托管，Cloudflare 负责 DNS。GitHub Pages 的发布来源为 `main` 分支的 `/docs` 目录；修改该目录并提交到 main 后，GitHub 自动更新网站。不依赖 Sites。

## 本地运行

```sh
python3 -m http.server 8000 --directory docs
```

打开 http://localhost:8000 。这是无需构建的静态网站。

## 内容

`docs/` 包含页面、样式、词卡与拼写逻辑、145 个词条、第一讲 PDF 课件和原始 XLSX 词表。图标来自用户提供的书本图片，保持原图，仅导出所需尺寸。

## PWA

支持安装到主屏幕，图标与名称为「学习室」。首次联网打开后，Service Worker 缓存页面和词汇供离线练习；课件 PDF、原始词表下载及外部字体仍需要联网。iPhone/iPad 使用 Safari 分享菜单中的「添加到主屏幕」。

`docs/manifest.webmanifest` 定义应用信息，`docs/icons/` 保存图标，`docs/sw.js` 管理离线缓存。改变离线资源清单时应更新缓存版本。

## 数据与访问

网站及仓库公开访问。学习进度仍保存在当前浏览器的 localStorage（`vera-bio101-progress-v1`），不会上传到 GitHub，也不自动跨设备同步。迁移保持同一域名；浏览器原有同域名进度可继续使用。

GitHub Pages 仅托管静态内容。未来可另接 Workers API、D1 和 R2 实现账户、进度同步和文件上传；这些功能尚未实现。不要把 API Token、密码或私密资料提交到公开仓库。
