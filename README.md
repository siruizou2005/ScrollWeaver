# ScrollWeaver · Serverless 重构版

由 AI 驱动的沉浸式虚拟世界构建与多智能体博弈平台。本仓库是原项目的 **Cloudflare Workers 重构版**：
前端页面与样式逐像素保持不变，后端整体重写。

**Demo：** https://scrollweaver.sirui-account.workers.dev
（线上跑的就是本分支的代码）

## 与原版的关系

| | 原版（Python） | 本版（TypeScript / Workers） |
|---|---|---|
| 后端 | FastAPI + uvicorn，21,473 行 | Cloudflare Workers，部署产物 gzip 后约 100 KB |
| 依赖 | 1.2 GB（torch 498 MB + chromadb + transformers + modelscope…） | 3 个运行时依赖（hono / zod / zod-to-json-schema） |
| 检索 | 本地 bge-small（首次运行下载 98 MB 模型）+ ChromaDB | 构建期切块 + 运行时词法检索，零依赖 |
| 会话状态 | 进程内存字典，重启即丢 | Durable Object 持久化，可断点续跑 |
| 数据库 | 本地 SQLite | D1 |
| LLM | 14 个接口互不一致的适配器 | 1 个接口 1 份实现，任意 OpenAI 兼容端点 |
| 前端 | 15 个静态页面 | **完全相同的 15 个页面**（仅 2 个文件换掉 socket.io） |

## 目录结构

```
.
├── web/                      前端，原样保留
│   ├── index.html
│   └── frontend/             URL 布局与原版一致（/frontend/pages/*.html）
├── worker/
│   ├── src/
│   │   ├── index.ts          路由入口
│   │   ├── config.ts         单一配置源（供应商表驱动）
│   │   ├── auth.ts           PBKDF2 口令 + HMAC JWT
│   │   ├── llm/client.ts     统一 LLM 层（结构化输出 + 自修重试）
│   │   ├── domain/           纯业务逻辑，无 IO
│   │   │   ├── engine.ts     剧情状态机
│   │   │   ├── orchestrator.ts / performer.ts
│   │   │   ├── state.ts      可序列化会话状态
│   │   │   ├── content.ts    内容包
│   │   │   ├── retrieval.ts  词法检索
│   │   │   └── schemas.ts    20 个结构化输出契约
│   │   ├── durable/          StorySession / Room / 三个玩法
│   │   ├── api/              按领域拆分的路由
│   │   ├── storage/repo.ts   D1 数据访问
│   │   └── prompts/          从原版移植的 48 个提示词模板
│   ├── schema.sql            D1 表结构
│   └── wrangler.toml
├── data/                     内容资产（角色 / 世界观 / 地点 / 预设）
├── scripts/import-content.mjs  构建期把 data/ 打包进 KV
└── reference/                原版 Python 代码，仅供移植比对
```

## 本地开发

```bash
cd worker
npm install

# 配置密钥（不会被提交）
cp .dev.vars.example .dev.vars
# 编辑 .dev.vars 填入 GLM_API_KEY

# 建表 + 灌内容
npx wrangler d1 execute scrollweaver --local --file=schema.sql
node ../scripts/import-content.mjs
npx wrangler kv bulk put ../dist/kv-bulk.json --binding CONTENT --local

npm run dev            # http://localhost:8787
```

验证：

```bash
npm run typecheck
npm test               # 设置 GLM_API_KEY 环境变量可额外跑真实 LLM 用例
curl localhost:8787/api/health
```

## 部署到 Cloudflare

免费额度足够支撑一个演示站点：Workers 10 万请求/天、Durable Objects
10 万请求/天、D1 5 GB、KV 1 GB、R2 10 GB、Pages 无限带宽。

```bash
cd worker

# 1. 创建资源，把返回的 id 填进 wrangler.toml
npx wrangler d1 create scrollweaver
npx wrangler kv namespace create CONTENT
npx wrangler r2 bucket create scrollweaver-media

# 2. 建表
npx wrangler d1 execute scrollweaver --remote --file=schema.sql

# 3. 灌内容包
node ../scripts/import-content.mjs
npx wrangler kv bulk put ../dist/kv-bulk.json --binding CONTENT --remote

# 4. 配置密钥（绝不写进文件）
npx wrangler secret put GLM_API_KEY
npx wrangler secret put JWT_SECRET

# 5. 部署
npx wrangler deploy
```

## 换模型 / 换供应商

只支持 **OpenAI 兼容端点**。切换供应商不需要改代码：

```bash
# 换模型
npx wrangler deploy --var ROLE_MODEL:deepseek-chat --var WORLD_MODEL:deepseek-chat
npx wrangler secret put DEEPSEEK_API_KEY
```

内置端点：GLM / OpenAI / DeepSeek / Kimi / DashScope(Qwen) / OpenRouter。
用任意中转站时设置对应的 `<NAME>_API_BASE` 即可；模型名匹配不到内置前缀时，
会自动回落到第一个已配置的端点。

新增一家供应商 = 在 `src/config.ts` 的 `PROVIDER_TABLE` 里加一行。

## 已知差异

- **上传文档生成书卷**：原版把二进制直接丢给 Gemini 多模态解析，会把功能焊死在单一供应商上。
  本版改为**浏览器端提取文字**（pdf.js / fflate），再走通用生成链路——Worker 零 CPU 消耗，
  也不锁供应商。支持 PDF / DOCX / TXT / MD；旧版二进制 `.doc` 不支持（提示另存为 .docx）；
  扫描版 PDF 没有文字层，会给出明确提示而不是把空内容喂给模型。
  `creation.html` 的格式提示与文件选择器已同步去掉 `.doc`（页面此处唯一的改动）。
- **检索方式**：原版用 bge-small 向量检索，本版用词法检索。语料是几十段世界观设定，
  实测效果相当，但省掉了 580 MB 依赖和每次行动一次 embedding 往返。
  `ContentPack.worldChunks` 保留了 `vector` 字段，将来接 Workers AI 可平滑切换。
- **多人房间**：原版用 socket.io，本版用 Durable Object + 原生 WebSocket。
  前端通过 `web/frontend/js/common/room-socket.js` 垫片保持 `.on()/.emit()` 调用不变。

## 移植时修掉的原版缺陷

- `interaction_handler` 判断 `single`/`multi`/`enviroment`（拼写错误），而 schema 与提示词给的是
  `role`/`environment`/`npc`/`no` —— **四种互动里三种永远命中不了**，角色发完独白就结束，从不互相回应。
- `sw_utils.json_parser` 用 `eval()` 解析模型输出（代码注入面）。
- `Gemini._get_response_fallback` 静默丢弃 `response_model`，把字符串返回给期待结构化对象的调用方；
  且非重试错误会在 fallback 之前 `raise`，导致备用通道永远不可达。
- 7 处硬编码模型名绕过 `config.json`，使配置形同虚设。
- `get_models` 的 `gpt-*` 分支缺 else，未列举的模型名会让函数隐式返回 `None`。
- `judge_if_ended` 失败时默认 `if_end=True`，判定失败会直接把玩家的剧情结束掉。
- `decide_next_actor` / 移动决策不校验返回值，模型编造的角色或地点会污染状态。
