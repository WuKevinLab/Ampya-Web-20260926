# Creator Crew

给创作者用的 AI 商业团队：品牌合作管线、数字商品、付费咨询预约、联盟链接、link-in-bio 主页，以及主页上替你接待粉丝和品牌的 AI 分身。

这个仓库把原先只在浏览器里跑模拟数据的交互演示，做成了可以部署、真实可用的产品：

- **真实账号**：注册 / 登录 / 改密码，会话用 HttpOnly Cookie；每位创作者的数据互相隔离。
- **真实后端**：Node.js 22 + 内置 SQLite，零运维；所有页面（后台、公开主页、官网）由同一个服务提供。
- **真实 AI 代理**：基于 Claude（默认 `claude-opus-5-5`），带工具调用——查业务总览、建/改交易、按粉丝数据估价、联网搜索品牌、写文件到工作区、起草商品、给 AI 分身加 FAQ、发邮件。对外发邮件默认先进 **Approvals** 等你审批，可以编辑后再发。
- **团队群聊**：多个代理在同一个对话里分工，@ 谁就轮到谁。
- **自动化**：定时（cron，按你的时区）、新线索、新订单、新预约、Webhook 触发代理干活。
- **AI 分身**：公开主页右下角的聊天，只按你主页上的事实回答；对方留下邮箱后自动变成线索，并触发“新线索”自动化。
- **收款**：接入 Stripe Connect，钱直接进创作者自己的 Stripe 账户，平台按套餐抽成（Starter 8%，Pro 0%）；品牌发票生成付款链接；Pro 订阅走 Stripe Billing。没配 Stripe 时是**测试模式**，整套流程照常走通但不扣卡。
- **交付**：数字商品付款后可下载（链接带订单令牌、限次），预约自动生成日历文件，买家收到确认邮件（配置了 Resend 时）。
- **联盟短链**：`/go/<handle>/<slug>` 跳转并统计点击。

## 快速开始

需要 Node.js 22.13 或更高版本。

```bash
npm install
cp .env.example .env      # 至少填 ANTHROPIC_API_KEY；其余可以先留空
npm start                 # http://localhost:3000
```

打开 `http://localhost:3000`，点 **Start free** 注册。第一个注册的账号是管理员（或用 `ADMIN_EMAILS` 指定），可以在 **Settings → Admin** 里填 API 密钥，不必重启。

想先看带数据的样子：在 `.env` 里设置 `DEMO_EMAIL` 和 `DEMO_PASSWORD`，启动时会创建示例创作者 Ava Lee 的账号。

```bash
npm test                  # 端到端测试（起真实服务，走完注册、业务、主页和下单）
```

## 页面

| 地址 | 内容 |
|---|---|
| `/` | 官网（功能、AI 分身、定价） |
| `/app` | 创作者后台 |
| `/c/<handle>` | 公开主页（商品、预约、精选链接、合作表单、AI 分身） |
| `/c/<handle>/kit` | Media kit |
| `/pay/<ref>` | 品牌发票付款页 |
| `/go/<handle>/<slug>` | 联盟短链 |

## 配置

所有配置见 [`.env.example`](.env.example)。环境变量优先于后台 Admin 页里保存的值。

| 变量 | 作用 | 不填时 |
|---|---|---|
| `PUBLIC_URL` | 对外地址，用于主页链接、付款回跳、邮件链接 | `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | AI 代理和 AI 分身 | 代理回复“离线”；分身按 FAQ 关键词兜底，仍能收集线索 |
| `ANTHROPIC_MODEL` | 代理和分身用的模型 | `claude-opus-5-5` |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | 真实收款 | 测试模式 |
| `STRIPE_PRO_PRICE_ID` | Pro 套餐的订阅价格 | 测试模式下点升级直接变 Pro |
| `RESEND_API_KEY` / `MAIL_FROM` | 发信 | 邮件只记录在代理邮箱里，界面会说明“未发送” |

### Stripe 设置

1. 在 Stripe 后台开启 Connect（Express 账户）。
2. 建一个 $29/月的价格，把 Price ID 填到 `STRIPE_PRO_PRICE_ID`。
3. 添加 Webhook 端点 `https://你的域名/stripe/webhook`，订阅事件：`checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`、`account.updated`，把签名密钥填到 `STRIPE_WEBHOOK_SECRET`。
4. 创作者在 **Settings → Payments** 点 **Connect Stripe** 完成入驻后，主页上的购买和预约就会走真实付款。

## 部署

```bash
docker build -t creator-crew .
docker run -d -p 3000:3000 -v creator-crew-data:/data --env-file .env creator-crew
```

数据全部在 `DATA_DIR`（Docker 里是 `/data`）：`app.db` 是数据库，`files/` 是代理工作区，`products/` 是商品文件。备份这个目录即可。放在 HTTPS 反向代理后面时，把 `PUBLIC_URL` 设成 `https://…`（Cookie 会自动带 `Secure`），并设置 `TRUST_PROXY=1`。

## 代码结构

```
server/
  index.js     HTTP 服务、静态页面、付款页、短链、Stripe 与自动化 Webhook、cron 调度
  api.js       所有 /api 接口
  engine.js    业务核心：总览统计、估价、FTC 披露检查、预约时段、线索与订单流转
  ai.js        Claude 代理（工具循环、审批、群聊、自动化）和 AI 分身
  payments.js  Stripe（Checkout、Connect、Webhook 验签）
  mail.js      发信（Resend）
  db.js        SQLite：账号、会话、平台设置、每位创作者的数据文档
  cron.js      cron 表达式匹配
  seed.js      新账号初始数据、演示账号数据
  templates.js 代理模板、推荐提示词、默认自动化
public/        前端（原生 JS，无构建步骤）
test/          node:test 测试
```

## 已知限制

- Telegram / Slack / iMessage / LINE 渠道、给代理买电话号码、连接自己的电脑执行命令：界面保留了入口，但服务端尚未接入，会明确提示“尚未开放”。
- 代理在服务器上不能执行 shell 命令（出于安全考虑关闭）。
- 收到的邮件 / 短信触发自动化还不支持；可以改用 Webhook 触发。
- 单进程部署：数据以每位创作者一份文档的方式存在 SQLite 里，适合个人到中小规模；横向扩展需要再拆表。
