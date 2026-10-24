# Shipyard 黑客松项目交接（2026-10-24，14:10 ET）

给接手的 Claude Code 看。读完这份就能接着干。

## 0. 一句话
项目叫 **dcnicecar-reel-agent**。车行（DC Nice Car）把车的照片或链接丢进网页，自动出一支 9:16 卖车短视频，外加小红书文案和 Facebook Marketplace 文案。

## 1. 比赛信息
- 活动：Tech@NYU **Shipyard**，2026-10-24，地点 446 Broadway。
- **15:45 前在 MLH 提交**。
- 赛道：SpaceXAI、ElevenLabs、Snowflake、DigitalOcean、TrueMarkets。现在主要用到 SpaceXAI（Grok 写稿）和 ElevenLabs（配音）。

## 2. 代码在哪（重要）
- 代码在一台开发机上（主机名/地址已从公开版移除）：`/workspace/coding/dcnicecar-reel-agent/`
- **git 还没有任何 commit，也没推到 GitHub**。所有文件都是未跟踪状态。接手第一件事：先 commit 一次，再决定建哪个公开仓库（MIT）。
- 不要改 Stephen 的私有仓库（名称已从公开版移除）。只从里面参考或复制思路。
- 公开仓库里**不能出现** MMR、Manheim 的具体数值或私有字段。

## 3. 目录结构
| 路径 | 作用 |
|---|---|
| `src/scrape.ts` | 抓 dcnicecar.com 详情页 → `listing.json` + 图片 |
| `src/sources/photos.ts` | **现在的主入口**：上传照片 → 识别车型 → `listing.json` |
| （私有拍卖车适配器，不在公开仓库） | 可选，缺失时自动退回 dcnicecar 抓取 |
| `src/script.ts` | Grok 写旁白、分镜、小红书和 Marketplace 文案 |
| `src/voice.ts` | ElevenLabs 配音 + 字幕时间轴 |
| `src/render.ts` | 调 Remotion 出 MP4；用 ffmpeg 合成背景音乐 |
| `src/valuation.ts` | 判断是否显示 "BELOW MARKET x%" 角标 |
| `remotion/Reel.tsx` | 视频画面本体 |
| `web/server.ts` + `web/public/index.html` | 手机网页 |
| `DESIGN.md` | 视频视觉规范（v2 = Huashu-motion 风格） |
| `CONTRACT.md` | 流水线和网页之间的接口约定 |
| `README-dev.md` | 每一步的命令 |
| `remotion/HUASHU-NOTES.md` | 采用了 Huashu 哪些规则、跳过了哪些 |
| `out/<slug>/` | 每台车的产物（不进 git） |
| `out/_amends/` | 中途改需求的记录 |
| `out/_backups/` | 改版前的备份 |

## 4. 怎么跑
```bash
cd /workspace/coding/dcnicecar-reel-agent
npm install
# 一键：链接 → 视频 + 文案
npx tsx src/cli/run.ts "https://www.dcnicecar.com/showroom/?mod=document&pageid=1&uid=1616" --lang both
# 网页（127.0.0.1:8787）
npx tsx web/server.ts          # FAKE_PIPELINE=1 只跑假流程
npm test
```
环境变量：`AI_GATEWAY_API_KEY`（必需），`GROK_MODEL`（默认 `spacexai/grok-4.20-non-reasoning`，比 grok-4.7 快很多），`ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID`。

手机访问网页：通过私有 Tailscale serve 转发到 8787（地址已从公开版移除）。

## 5. 今天按时间做了什么
1. **上午**：从 Stephen 的 X 收藏里找方向。他要做「二手车 / 现实市场工具」，定了方向 E：车源 → 卖车视频 + 文案。
2. 看了他私有仓库里能复用的东西（细节已从公开版移除）。决定只复用抓取思路和估值快照，**角标只显示百分比，不显示参考价金额**。
3. 建项目，写 DESIGN.md v1（夜间展厅风格，黑底 + 荧光绿 Volt），搭好抓取、写稿、配音、渲染流水线。
4. 出了第一批片子：1503 Highlander、1616 Accord（中英各一）。
5. Codex 审查（模型 **gpt-6-astra**）抓到一个 P1：抓取跟随重定向有 SSRF 风险，已修。
6. **12:55** 改需求：网页主入口改成**上传照片**，不再贴链接。
7. **13:05** 改风格：按 **Huashu-motion**（MIT）重做画面。13:23 改完 `Reel.tsx`，13:25 写完 HUASHU-NOTES。
8. **13:28** Stephen 叫停，旧的 claude / codex 进程已杀。
9. Stephen 指定音效库用 **earshot**（github.com/Leonxlnx/earshot，MIT，代码生成音效）。
10. **13:43** 网页换成 **WIN1STEP 红黑浅色**（tokens 来自 WIN1STEP 设计系统）。只改样式，没改功能。截图在 `web/screens-v2/`。

## 6. 现在的状态（14:10）
- 没有 claude / codex 在跑。只有网页服务在跑（`tsx web/server.ts`，8787）。
- 能看的真视频：`out/1616-2024-honda-accord-hybrid-sport/reel-en.mp4`、`reel-zh.mp4`（13:23 前后，Huashu 新风格）。13:48 之后那几支只有约 300KB，是假流程占位，不是真视频。

## 7. 没做完 / 已知问题
1. **earshot 音效没接进去**。现在成片只有 ElevenLabs 旁白 + ffmpeg 合成底乐。DESIGN.md 只是列了链接。
2. **网页真出片没测过**。手机上点「生成视频」会真调 API，还没跑通一遍。
3. **中文配音没有**：ElevenLabs 免费档报 "free tier disabled"。要么升级，要么换别的 TTS。
4. **视频画面配色**还是黑底 + 荧光绿；网页已是红黑。要不要统一成红黑，Stephen 还没定。
5. 输入框提示字偏淡（小问题）。
6. 没有 commit，没有公开仓库，没有 README，没有 LICENSE。
7. MLH 还没提交（15:45 截止）。
8. 待定：用 Huashu + earshot 给这个平台做一支宣传片（片里用真实录屏）。卖车视频是第二步。

## 8. Stephen 的工作规则（必须遵守）
- 回复默认中文。结论先行，句子短，一句话一件事。区分事实、推断和没验证的东西，不编造。
- 他要做决定时，**把你的原问题原样给他**，别替他决定，别用 A/B/C 这种没解释的代号。
- **中途改需求**：先停掉旧进程 → 把改动写进 `out/_amends/YYYYMMDD-HHMM.md` → 新的指令引用这个文件 → 再开工。旧进程没停之前不能说「正在改」。
- 每个阶段告诉他：在改什么、哪支视频是哪一版。
- 代码审查用 Codex，模型 **`gpt-6-astra`**（`codex exec -m gpt-6-astra`）。
- 链接只发内网（Tailscale）地址。
- 永远不在视频、网页、日志、公开仓库里显示 MMR 数值。

## 9. 参考
- Huashu-motion：https://github.com/alchaincyf/huashu-motion
- earshot：https://github.com/Leonxlnx/earshot
- 其他收藏参考见 `DESIGN.md` 末尾和 `STYLE-CANDIDATES.md`。
