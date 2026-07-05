# Firecrawl 能力评估与博闻接入建议

## 结论

Firecrawl 适合作为博闻的“网页/视频详情内容抓取与清洗层”，不适合作为热榜增长算法本身。

博闻当前核心链路是：品类/平台切换 -> 热榜 Top10 -> 选择快速增长视频 -> 解析文稿 -> 趋势预测 -> 生成同款爆款。Firecrawl 最适合补强中间两段：

- 把视频链接、榜单链接、微博热搜页抓成 LLM-ready markdown/html/json。
- 批量处理 Top10 视频链接，提取标题、简介、正文、页面元数据、截图等分析材料。
- 用 actions/interact 处理需要点击、滚动、等待加载的页面。

不建议在 MVP 阶段完整自托管 Firecrawl。它包含 API、队列、Redis、Postgres、Playwright 微服务、多语言 SDK、监控与计费等完整平台能力，对当前本地演示过重。

## Firecrawl 主要功能

| 功能 | Firecrawl 能力 | 对博闻是否适用 | 建议用法 |
| --- | --- | --- | --- |
| Search | 根据 query 搜索网页，并可返回结果正文 | 中等 | 可用于补充外部资料，不作为抖音/微博/B 站热榜来源 |
| Scrape | 单 URL 转 markdown/html/rawHtml/links/images/screenshot/json | 高 | 用于抓取视频详情页、微博榜单页、文章页 |
| Interact | 对 scrape 后的浏览器会话执行点击、滚动、输入、等待 | 高 | 用于动态页面：滚动加载、展开全文、切换 tab |
| Batch Scrape | 批量抓取多个 URL，异步查询状态 | 高 | 对 Top10 视频链接批量提取详情 |
| Crawl | 爬取整站多个 URL | 低 | 博闻不是整站索引产品，MVP 暂缓 |
| Map | 快速发现站点 URL | 低 | 对视频平台帮助有限，暂缓 |
| Parse | 解析 PDF/DOCX/上传文件 | 低 | 后续知识库导入可用，MVP 暂缓 |
| Extract | 按目标抽取结构化数据 | 中高 | 后续可抽取“标题/简介/评论/发布时间/互动数” |
| Agent | 描述任务后自动采集数据 | 中 | 后续可做研究助手，MVP 暂缓 |
| Monitor | 监控页面变化 | 中 | 后续做“热点持续追踪/二次爆发监控” |
| Browser session | 创建/执行/删除浏览器会话 | 中 | 可替代自研 Playwright 操作，但 MVP 先不用 |

## 推荐接入方式

### 阶段 1：只接云 API 或本地适配器

新增端口：

```text
src/application/ports/ContentFetchPort.ts
src/infrastructure/content/FirecrawlContentFetcher.ts
src/infrastructure/content/FallbackContentFetcher.ts
```

端口输出保持博闻自己的结构：

```ts
interface FetchedContent {
  url: string;
  title?: string;
  markdown?: string;
  html?: string;
  screenshotUrl?: string;
  metadata?: Record<string, string>;
  source: "firecrawl" | "fallback";
}
```

不要把 Firecrawl 原始响应直接传到 UI，也不要让 domain 依赖 Firecrawl SDK。

### 阶段 2：批量抓取 Top10 视频详情

在 `getHotVideos` 之后新增用例：

```text
application/useCases/enrichVideoReferences.ts
```

输入 `VideoTrend[]`，输出带内容解析素材的视频引用：

- 页面 markdown
- 页面标题/描述
- 可见链接/图片
- 截图，必要时
- 结构化字段，后续用 json schema 约束

### 阶段 3：再引入动态交互

只有在页面必须点击、滚动、等待加载时才用 Firecrawl actions/interact：

- 等待视频简介渲染
- 展开全文
- 滚动加载评论或相关推荐
- 截图用于拍摄场景判断

这一步要加超时、失败降级和缓存，避免演示时被平台反爬拖垮。

## 不建议复刻的部分

- 自托管完整 Firecrawl：需要 Docker、Redis、Postgres、队列、Playwright service，维护成本高。
- 计费、账号、团队额度、信用点系统：和博闻 MVP 无关。
- 全站 crawl/map：当前产品关注“近五日快速增长样本”，不是搜索引擎。
- 多语言 SDK：博闻是 Next.js/TypeScript，最多参考 JS SDK。

## 最适合复刻的实现思路

1. 端口隔离：Firecrawl 的 API/SDK 只放在 infrastructure。
2. 请求流水线：validate -> fetch -> normalize -> fallback -> log。
3. 批量任务状态：Top10 抓取可以先同步，后续变成 job/status。
4. 输出格式选择：优先 markdown/json，截图只在拍摄场景判断需要时使用。
5. 动态页面动作：用 actions 描述点击、等待、滚动，而不是把 Playwright 逻辑散在业务层。

## MVP 优先级

P0：

- `scrape(url, { formats: ["markdown", "links"] })`
- 抓取选中视频页面文本，用于“视频文稿解析”

P1：

- `batchScrape(urls, ...)`
- 对热榜 Top10 批量补全文案素材

P2：

- `scrape(..., { formats: [{ type: "json", schema }] })`
- 直接抽取标题、简介、发布时间、账号名、互动数等结构化字段

P3：

- actions/interact、screenshot、monitor
- 用于动态页面和热点持续追踪

## 风险

- 抖音/微博/B 站都有反爬、登录态和动态加载限制，Firecrawl 不能保证所有平台稳定抓取。
- 云 API 需要 API key；自托管需要额外服务栈。
- 平台内容抓取涉及服务条款和合规风险，MVP 应明确标注数据来源与 fallback。
- 截图/视频页面解析成本高，应按需触发，不要每次切换都抓。

## 建议下一步

先做 `ContentFetchPort` + `FirecrawlContentFetcher`，只处理“用户选中视频后抓取该链接详情”。如果没有 `FIRECRAWL_API_KEY`，自动走 fallback，不影响本地演示。
