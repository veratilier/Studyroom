# 用 VPS 上现有的 Codex 接入 Studyroom

本方案运行在 VPS，Mac 无需保持开机。前端仍由 GitHub Pages 托管在 `study.r-vera.com`。浏览器只连接带口令认证的课件 HTTP 服务；服务在本机通过 stdio 启动现有 `codex app-server`。不把 app-server 的原始端口暴露给浏览器。

## 本版本已实现

- 沿用上传、学科分类、课件梳理、原件下载和单词练习。
- Codex 替代 Workers AI 生成梳理与词汇；每段独立分析，失败可继续。
- 每份上传课件增加“问这份课件”：解释、出题、跟进作答。
- 每份课件独立 Codex thread，存储 thread ID 后可在服务重启后恢复；网页保留最近 50 条问答，数据库最多 500 条/课件。
- 问答 request ID 去重、每课件最多一个未完成请求、每日分析与问答共用调用限额。
- 原件保存到 VPS 的私人目录，课程、问答、会话映射保存到 SQLite；不需要 D1、R2 或 Workers AI。

这是 **VPS 后端替代部署方案**，不要同时照着两份说明创建两套正式课件库。若之前已经使用 Worker/R2 上传真实资料，先做数据迁移；此版本不会自动迁移旧云端资料。

## 给 VPS 上 Codex 的部署步骤

1. 拉取 PR #1 的最新分支 `feature/course-library`。先核实 VPS 上已有的 `codex` 可执行路径、版本、Node.js 版本；使用 Node.js 24（内置 SQLite）。复用已有 Codex 安装，不覆盖原服务或原配置。
2. 使用独立的非特权服务账户，或隔离容器。为 Studyroom 配置独立数据目录和独立 `STUDYROOM_CODEX_HOME`，均放在仓库和网站目录之外；该 profile 不装 MCP、插件或其他项目指令。既有 Codex profile 保持原样。使用同一现有 Codex 程序，通过 `CODEX_HOME=<独立目录> codex login` 在该运行环境正常登录；由 Vera 完成所需登录，不复制或在聊天中展示凭据。
3. 在私有配置文件填写环境变量，设为仅服务用户可读（0600）：

   - `LOGIN_PASSWORD`：课件库访问口令。
   - `SESSION_SECRET`：独立的至少 32 字符随机值。
   - `STUDYROOM_DATA_DIR`：私人原件和 SQLite 目录的绝对路径。
   - `STUDYROOM_CODEX_HOME`：独立 Codex profile 的绝对路径。
   - `CODEX_BIN`：第 1 步找到的现有 Codex 可执行文件绝对路径。
   - `CODEX_MODEL`：可选；留空使用该 profile 已配置的模型，不强制替用户换模型。
   - `ALLOWED_ORIGIN=https://study.r-vera.com`
   - `PORT=8788`（如占用则换未使用端口）。
   - `DAILY_AI_CALL_LIMIT=30`：每日分析与问答总次数，硬上限 100；这是请求数而非费用预算。

4. 在仓库中执行 `node --env-file=<私有配置文件绝对路径> agent-server/server.mjs`。服务只监听 `127.0.0.1`。确认启动后用 systemd 等现有进程管理方式常驻，WorkingDirectory 设为本仓库，使用上述同一 Node 24 和配置文件；不要把口令直接写进 unit 或 GitHub。
5. 通过已有反向代理或 Cloudflare named tunnel，将一个空闲 API 子域名的 HTTPS 流量转发到上述回环端口。先检查现有路由，不能覆盖 Vesper、Nest 等其他服务。不需要直接开放 app-server 的 WebSocket。若需要付费或更改账户安全配置，先取得 Vera 的确认。
6. 将实际 HTTPS API 地址填入 `docs/library-config.js` 的 `STUDYROOM_API`。前端中没有服务口令、Codex 登录凭据或主机命令。
7. 先用非私密资料验证：解锁 → 读取/确认上传 → 整理 → 原文核对 → 单词练习 → 提问 → 重启服务 → 在同一课件继续提问 → 切换课件确保历史不串。再合并 PR 更新 Pages，并验证手机 PWA。

## 运行边界

- 本仓库的 app-server 通信已按官方协议实现初始化、thread/start 或 resume、turn/start、最终回答事件和超时停止。已在 VPS 的 Codex 0.149.0 上核对 schema，并完成真实登录与模型响应验证。如受管理配置阻止，不要降低已有审批要求来绕过。
- 该接入只提供学习功能，不向网页开放终端、文件修改、任意 RPC 或工具审批。turn 使用该安装版本支持的只读沙箱（禁止工具网络访问），并禁用 shell、执行器、应用、插件、浏览器、图像和多 agent 工具；systemd RootDirectory 仅映射运行时和 Studyroom 自己的目录，其他项目不在服务文件系统中。不要仅靠旧版本不识别的 readableRoots 字段实现隔离。服务拒绝所有来自 app-server 的交互式工具/权限请求，并关闭内置 web search。主机应使用上述独立账户/profile，不依赖提示词作为主机隔离手段。
- Codex 子进程不会继承网页登录口令或签名密钥。服务使用当前 profile 的模型默认设置；消耗该登录方式对应额度，不承诺免费或与其他登录渠道额度互通。
- 每次生成限时 80 秒、最多同时两次生成。超时/断线显示错误并终止该子进程，已保存课件和已完成部分保留。问答暂时按完整回答显示，不是逐字流式 UI；重新打开课件或刷新回答可核实之前请求的结果。
- 问答会携带当前课件提取的全文及最近八次问答；大课件可能超出所选模型的上下文限制，须拆分或使用符合需求的模型，不能静默截断。
- SQLite 数据目录和独立 Codex profile 均需备份，并保留文件权限；只备份源码不能恢复上传资料与会话。现有浏览器词卡进度仍不自动云同步。
- 原件上限 20 MB、300 页/段、12 万字符，暂不支持扫描件 OCR。AI 解释仍需核实，问答页码不像结构化梳理引用那样经过逐条服务端匹配验证。

## 验证

`npm test` 覆盖原课件库测试、真实子进程的模拟 app-server 协议、事件先于应答、超时结束，以及本机 HTTP → SQLite/文件存储 → agent 替身的上传、问答去重、会话隔离和重启恢复。不调用真实模型，不改动正式课件。

官方接口说明：https://learn.chatgpt.com/docs/app-server

## 2026-09-07 实际 VPS 部署

- 前端：`https://study.r-vera.com`；API：`https://study-api.r-vera.com`。
- 服务：`studyroom-api.service`，独立用户 `studyroom`，监听 `127.0.0.1:8788`。
- 程序：`/opt/studyroom/current`；专用 Node：`/opt/studyroom/node/bin/node`（24.20.0）。系统 Node 22 和原有 Codex 0.149.0 安装不变。
- 私有配置：`/etc/studyroom/service.env`（0600）；数据：`/var/lib/studyroom/data`；独立登录 profile：`/var/lib/studyroom/codex`。口令不在仓库。
- `deploy/setup-service.sh` 和 `deploy/isolate-service.sh` 记录 systemd 配置；先准备已验证的源码与 Node 路径，再执行。隔离必需，不能只运行前一个脚本就公开服务。
- 复用 `cloudflared-r-vera.service` 的现有隧道，只增加 `study-api.r-vera.com → http://127.0.0.1:8788` 路由。修改前的配置保存在原目录 `.bak-studyroom-*`；其他路由保留。
- 安装版本的 `readOnly` 不支持 `access.readableRoots`，本部署采用禁用工具与 systemd 文件系统隔离。主机禁用了非特权 user namespace，因此没有降低该主机限制。
- 真实测试已通过文字课件上传、分类修改、引用检查、8 个词汇生成、问答、服务重启后同课件续答，以及两份课件会话隔离。验收资料以“部署验收”分类保留，内容不涉及私人资料。
- 备份 `data` 与 `codex` 两个目录并保留权限；更新时先备份数据，再切换 release 并重启 Studyroom 服务。

- 浏览器验收使用同一前端源码与正式 VPS API：PDF 读取与上传、3 段梳理、5 个词汇生成、原文展开、翻词卡和拼写判定均通过。桌面浏览器验证不代表实机手机 PWA 验证。

## 独立账号版本（本次升级）

先备份整个 `STUDYROOM_DATA_DIR`，再更新 VPS Node 服务和 Pages 前端。这版前端需要 VPS 的 `/account/*` 接口；不要只部署 Pages，也不要把它指向旧的单口令 Worker。

- 在 VPS 私密环境文件增加 `REGISTRATION_INVITE_CODE`（自己生成的长随机字符串），重启服务。只把这个注册邀请码给朋友；不提供时朋友注册关闭，原主人仍可认领。
- 保留原 `LOGIN_PASSWORD`。原主人选择「创建账号」，设置新账号和至少 10 位密码，在「认领原来的私人课件库」填旧口令。只有这一账号能访问原目录的数据；认领只能成功一次。原数据不搬动、不删除。
- 朋友用邀请码注册，得到空库。账号为 3–40 位字母、数字、下划线或短横线，不区分大小写。可在「我的课件」修改密码；改密撤销其他会话，退出撤销当前会话。会话有效 12 小时。
- 账号和会话存入根目录 `accounts.sqlite`；密码使用随机盐 scrypt，数据库只存会话令牌的哈希。新账号的 SQLite、原文件、聊天线程索引和工作目录在 `users/<随机账号 ID>/`。每账号独立每日 AI 配额，共享最多两个 AI 请求；注册/登录等操作全站每十分钟最多 30 次。
- 备份须包含根目录及所有 `users/` 子目录。浏览器词卡进度按账号隔离，暂不跨设备同步。遗留 BIO 本地练习进度不导入新账号。
- 本次删除的是公开 `docs/` 中内置的 BIO 课件、词表与静态梳理，不会删除用户此前上传的私人资料；Git 历史保持原样。
- 本实现是同一维护者 VPS 内的应用级账号隔离，保留现有无工具 Codex profile。不要给学习助手启用文件/终端工具或共享额外 MCP 服务。

部署后验收：原主人认领可见旧课件；朋友注册为空库；两账号交叉访问文件/聊天/整理接口返回 404；改密和退出后的旧令牌返回 401；新课件上传、整理、词卡和课程聊天正常。旧单口令 `/session` 在 VPS 不再开放。当前 Worker 单独部署模式仍为旧版单人服务，不支持这套账号 UI。

### 朋友自己的 AI API

原主人认领账号继续使用 VPS Codex。其他账号在「我的课件 → 我的 AI 连接」填写 HTTPS Base URL（通常以 `/v1` 结束）、模型名和 API Key，支持 [OpenAI Chat Completions 格式](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create/)。上传后的梳理、词汇提取和课程聊天均调用该账号的服务；未配置不会回退到主人的 Codex。

保存不触发付费测试请求，实际整理时验证连接。页面说明课件文字将交给所选服务、费用由其账号承担。模型须能按提示返回 JSON。接口发送 model/messages/stream=false 以兼容不同服务商，不要求特定模型参数。

Key 用 SESSION_SECRET 派生密钥进行 AES-256-GCM 加密，绑定账号 ID，仅服务器解密；GET 不返回 Key。留空保留已存 Key，改地址必须重填，也可移除连接。请随数据库安全备份 SESSION_SECRET；更换它后用户需要重新保存 API Key。

外连仅支持有公开 IPv4 地址的 HTTPS 443 服务，拒绝内网/本机和重定向，DNS 结果验证后固定到本次连接；请求最多 90 秒、响应最多 2 MB。API 失败显示通用错误，不转发可能含密钥的服务商正文。13 项测试通过，包含账户路由与密钥隔离；未使用真实收费 API 测试。
