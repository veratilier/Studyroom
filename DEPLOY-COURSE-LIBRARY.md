# Studyroom 课件库部署交接

此改动保留 GitHub Pages 的 `main /docs` 和 `study.r-vera.com`，新增独立 Cloudflare Worker API。不要用新项目覆盖现有网站，不迁移域名，不重建已有词表或学习进度。

## 已实现

- 学科 → 课件目录；上传时创建学科，之后可修改分类与名称。
- PDF、PPTX、XLSX、TXT、Markdown 的本地文字提取；上传前预览、原文件私有保存。
- 课件分段分析、中文知识点梳理、原文引用与页码、英文词汇和中文/英文释义。
- 词汇进入原有词卡、拼写、复习逻辑。旧 `vera-bio101-progress-v1` 不迁移、不清空；上传词汇按课件隔离。
- 上传相同原件去重；分析可继续；已完成段不会再次调用模型；处理中使用数据库租约避免并发调用。
- 口令解锁；签名会话只保存在当前标签页 sessionStorage，12 小时有效。Provider keys 不进入前端。API 原件和提取文字不缓存、不写入公开仓库。

## 部署步骤（在已登录 Cloudflare 的电脑执行）

1. 检查该分支与 `main` 差异，确认 `docs/CNAME` 仍为 `study.r-vera.com`。先部署后端并验证，再合并前端。
2. 在仓库根目录用 Wrangler 创建独立资源，已有同名资源则核对后复用：

   ```sh
   npx wrangler@4 d1 create studyroom-library
   npx wrangler@4 r2 bucket create studyroom-course-files
   ```

3. 将创建返回的 D1 ID 填入 `worker/wrangler.jsonc` 的 `database_id`。确认 R2 bucket name 对应实际资源。AI 使用 Workers AI binding，无需 OpenAI API key。
4. 设置两个独立 secret，不放在 GitHub、聊天或命令参数里：

   ```sh
   npx wrangler@4 secret put LOGIN_PASSWORD --config worker/wrangler.jsonc
   npx wrangler@4 secret put SESSION_SECRET --config worker/wrangler.jsonc
   ```

   `LOGIN_PASSWORD` 是 Vera 用来解锁课件库的强口令；`SESSION_SECRET` 至少 32 个随机字符，两者不可相同。开发时复制 `.dev.vars.example` 为本地 `.dev.vars` 并替换示例，禁止提交。
5. 应用独立数据库迁移并部署：

   ```sh
   npx wrangler@4 d1 migrations apply studyroom-library --remote --config worker/wrangler.jsonc
   npx wrangler@4 deploy --config worker/wrangler.jsonc
   ```

6. 将实际 Worker HTTPS 地址填入 `docs/library-config.js`，不能填示例地址；`ALLOWED_ORIGIN` 必须保留 `https://study.r-vera.com`。Worker 使用 Authorization 签名会话而非跨站 Cookie，兼容 Pages → workers.dev。
7. 实测解锁、上传一个非私密文字 PDF、确认上传、分段整理、引用、词汇练习、刷新后恢复和原件下载；再合并 PR 到 main 让 Pages 更新。最后在手机 PWA 验证。不要仅凭 HTTP 200 就宣布可用。

若账户要求开通付费服务或购买，先向 Vera 说明并取得确认；本分支未调用真实模型、未创建 Cloudflare 资源、未变更套餐。

## 限制与验证边界

- 默认模型 `@cf/meta/llama-3.3-70b-instruct-fp8-fast`，输入为提取文字，每段不超过 6000 字符。提示词要求只依课件整理；服务端校验引用确实出现在该页、英文术语确实存在，但这不能保证所有解释在语义上完全正确。
- PDF/PPTX 只取文字，不能理解图片、图表和讲者备注；扫描件需要先 OCR。PPT 需另存为 PPTX。XLSX 按工作表每 25 行分段，不重算公式。提取器在页面展示空白页与图像内容遗漏提示。
- 文件最多 20 MB、300 页/段、12 万字符；超过直接拒绝，不静默截断。课件库上限 200 份，无公开删除接口。
- 默认每天最多 30 次分析调用（UTC 日期），失败调用同样计入；可调整 `DAILY_AI_CALL_LIMIT`，代码硬上限 100。每次失败后手动继续可能再次消耗一次调用；网络断开后的租约最长 3 分钟。限制是调用数，并非货币预算。模型有用量计费，需要维护者核实账号额度。
- 长课件每段分别梳理，页面按部分展示；没有伪装成一次全篇推理。切换页面或关闭标签后停止发起下一段；重新打开对应课件点击继续。
- 课件和分析结果可在设备间查看，词卡学习进度仍是浏览器本地，不宣称云同步进度。
- 课件库默认 `STUDYROOM_API=''`，未配置时明确显示服务未接入，原有静态功能不受影响。
- Parser 依赖已放在 `docs/vendor`：PDF.js 5.6.205 legacy build，JSZip 3.10.1，附许可证；运行时不向第三方 CDN 获取脚本。

## 本地验证

```sh
node --test tests/*.test.mjs
node --check docs/app.js
node --check docs/library.js
node --check docs/extract.mjs
node --check worker/index.mjs
```

测试使用 Node 24 自带 SQLite 内存库、R2 模拟存储和模拟 AI，不接触正式数据。覆盖认证、来源限制、文件去重、分类、原文件下载、失败恢复、并发租约、每日限额、错误引用过滤、长页保全、BIO101 旧进度与新课件隔离。未验证真实 Workers AI 生成质量或手机浏览器完整链路；上线前必须实测。

参考：
- https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/
- https://developers.cloudflare.com/workers/wrangler/configuration/
- https://mozilla.github.io/pdf.js/examples/
