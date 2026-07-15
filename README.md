# 博闻 — 内容自媒体分析助手

面向 0-1 万粉观点类创作者的视频内容分析平台。从视频上传到内容评估，从访谈诊断到提纲生成，帮助创作者完成「分析—学习—创作」闭环。

## 功能概览

### 四大功能 Tab

| Tab | 功能 | 输入 | 输出 |
|-----|------|------|------|
| 视频分析 | 上传视频，自动转写+画面分析+爆点评估 | 视频文件 / 文案文本 | 三栏诊断报告（文稿/分镜/爆点） |
| 访谈诊断 | 分析访谈结构、提问质量、收藏触发点 | 访谈文稿 + 主题 + 嘉宾画像 | 结构评分 + 提问质量 + 改进建议 |
| 技巧知识库 | 检索访谈技巧、钩子模式、收藏策略 | 主题 + 嘉宾画像 | 知识列表（案例蒸馏 + 静态策略） |
| 提纲生成 | 基于知识库生成访谈提纲 | 主题 + 嘉宾画像 + 创作者定位 | 钩子建议 + 问题+追问 + 收尾策略 |

### 视频分析全链路

```
上传视频 → FFmpeg 音频提取 → FunASR 中文转写 → PaddleOCR 字幕识别
  → 构建 VideoEvidenceBundle → 分段视觉理解 → 跨片段时序推理
  → 知识库 RAG 召回 → 内容评估（8维评分） → 生成诊断报告
```

### 三级降级策略

所有功能均实现 LLM → 规则 → 骨架兜底，降级状态通过 `analysisMode` 字段对用户可见：

- **多模态**（`multimodal`）— 完整大模型分析
- **仅文稿**（`text_only`）— 视觉模型失败时降级
- **规则兜底**（`rules_fallback`）— 推理模型失败时降级

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 16 + React 18 + TypeScript + Tailwind CSS |
| 测试 | Vitest + Testing Library（506 个测试，核心引擎覆盖率 97.86%） |
| 后端 | Next.js API Routes（App Router） |
| Python 微服务 | FunASR（转写）、PaddleOCR（字幕识别）、differentiation-service（语义差异化） |
| LLM | 通义千问（qwen3-vl-plus），OpenAI 兼容接口 |
| 架构 | 六边形架构（Domain → Engine → Application/Ports → Infrastructure → Interface） |

## 项目结构

```
bowen-search/
├── app/                        # Next.js App Router
│   ├── page.tsx                # 主页面（Tab 导航）
│   ├── api/                    # API 路由
│   │   ├── analyze-uploaded-video/
│   │   ├── upload-video/
│   │   ├── video-analysis-jobs/
│   │   ├── video-assets/
│   │   ├── interview-diagnosis/
│   │   ├── interview-knowledge/
│   │   └── interview-outline/
│   └── components/
│       ├── tabs/               # 四个 Tab 组件
│       ├── shared/             # 共享组件（ScoreBadge/ModeTag/EmptyState）
│       └── UploadPipelineSummary.tsx
├── src/
│   ├── domain/                 # 领域层（类型、枚举、评估量规）
│   │   ├── interview/types.ts  # 访谈领域类型
│   │   ├── evaluation/         # 8维评估量规
│   │   ├── jobs/               # 视频分析任务聚合根
│   │   └── multimodalIntelligence/  # 多模态智能类型
│   ├── engine/                 # 纯函数引擎层（零外部依赖）
│   │   ├── analyzeInterviewSample.ts
│   │   ├── scoreInterviewQuality.ts
│   │   ├── generateOutlineStructure.ts
│   │   ├── extractInterviewKnowledge.ts
│   │   └── ...
│   ├── application/            # 用例编排层
│   │   ├── ports/              # 20 个端口接口
│   │   └── useCases/           # 用例实现
│   ├── infrastructure/         # 基础设施层（适配器）
│   │   ├── interview/          # 访谈知识仓储
│   │   ├── multimodal/         # LLM 适配器
│   │   ├── transcription/      # FunASR 客户端
│   │   ├── ocr/                # PaddleOCR 客户端
│   │   ├── media/              # FFmpeg 媒体处理
│   │   ├── knowledge/          # 知识仓储（本地+向量）
│   │   └── ...
│   └── interface/              # HTTP 边界
├── knowledge/                  # 静态知识库
│   ├── strategies/             # 策略知识（含访谈技巧）
│   ├── evaluation/             # 评估规则
│   └── cases/                  # 案例知识
├── services/                   # Python 微服务
│   ├── funasr-transcriber/     # 语音转写（端口 8765）
│   ├── paddleocr-service/      # 字幕识别（端口 8767）
│   └── interview-collector/    # 访谈视频批量采集
├── differentiation-service/    # 语义差异化服务（端口 8766）
├── storage/                    # 运行时存储（gitignore）
│   └── interview-collector/
│       └── raw/               # 蒸馏案例 JSON
├── tests/                      # 测试文件
├── tailwind.config.ts          # 设计系统配置
└── package.json
```

## 快速开始

### 1. 环境准备

**前置要求：**
- Node.js 18+
- Python 3.10+
- FFmpeg（或自动使用 imageio-ffmpeg 内置版本）

**安装依赖：**

```bash
npm install
```

### 2. 环境变量配置

在项目根目录创建 `.env.local`：

```bash
# LLM 配置（通义千问 OpenAI 兼容接口）
BOWEN_VLM_PROVIDER=openai_compatible
BOWEN_VLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
BOWEN_VLM_API_KEY=your-api-key
BOWEN_VLM_MODEL=qwen3-vl-plus

# Python 微服务地址（可选，不启动则走降级路径）
FUNASR_SERVICE_URL=http://127.0.0.1:8765
PADDLEOCR_SERVICE_URL=http://127.0.0.1:8767
VECTOR_STORE_URL=http://127.0.0.1:8766
```

### 3. 启动主应用

```bash
npm run dev
```

访问 http://localhost:3000 即可使用。不启动 Python 微服务时，视频分析走文案降级路径，访谈功能走规则兜底路径，均可正常使用。

### 4. 启动 Python 微服务（可选）

#### FunASR 语音转写（端口 8765）

```bash
cd services/funasr-transcriber
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8765
```

#### PaddleOCR 字幕识别（端口 8767）

```bash
cd services/paddleocr-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --host 127.0.0.1 --port 8767
```

#### 差异化评分服务（端口 8766）

```bash
cd differentiation-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8766
```

### 5. 运行测试

```bash
npm test              # 运行全部测试
npx vitest run --coverage  # 带覆盖率报告
npx tsc --noEmit      # 类型检查
```

## 案例蒸馏

将访谈视频蒸馏为知识库案例数据，供技巧知识库检索使用。

### 蒸馏流程

```
访谈视频 → FFmpeg 提取音频 → Paraformer 转写 → 通义千问 LLM 蒸馏
  → 规则补充（正则匹配反常识句式等）
  → 组装 DistilledCaseFile JSON
  → 写入 storage/interview-collector/raw/
  → CombinedKnowledgeRepository 自动加载
  → 知识库立即可检索
```

### 蒸馏产出

每个视频蒸馏后生成一个 JSON 文件，包含：

- **转写文稿** — 完整文本 + 带时间戳分段
- **访谈技巧** — 技巧名称 + 描述 + 原文引用 + 适用场景
- **钩子模式** — 开场钩子 + 心理触发机制 + 留存机制
- **收藏触发点** — 金句原文 + 收藏原因
- **传播力信号** — 8 维度传播力评分
- **可复用公式** — 创作公式提炼

### 运行蒸馏

将访谈视频放入 `case/` 目录，执行蒸馏脚本：

```bash
python distill_cases.py
```

蒸馏结果自动写入 `storage/interview-collector/raw/`，知识库 API 即可检索。

## 架构设计

### 六边形架构依赖规则

```
Domain ← Engine（纯函数，零外部依赖）
Engine ← Application（用例编排，注入数据给 engine）
Application ← Infrastructure（组合数据源 + engine 纯函数）
```

- Engine 层不得包含异步端口编排或直接依赖 knowledge 数据源
- 禁止循环依赖（如 infrastructure → engine）
- 所有外部依赖通过 Port 接口注入，测试使用 Fake 实现

### API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/analyze-uploaded-video` | 文案分析（一次性返回） |
| POST | `/api/upload-video` | 视频上传（创建分析任务） |
| GET | `/api/video-analysis-jobs/:id` | 查询任务状态 |
| GET | `/api/video-analysis-jobs/:id/report` | 获取分析报告 |
| POST | `/api/interview-diagnosis` | 访谈诊断 |
| GET | `/api/interview-knowledge` | 知识库检索 |
| POST | `/api/interview-outline` | 提纲生成 |

### Tab 间联动

```
访谈诊断 ──→ 查看相关知识 ──→ 技巧知识库
    │                              │
    └──→ 生成改进提纲 ←───────────┘
```

诊断完成后可一键跳转知识库检索相关知识，或跳转提纲生成器基于诊断主题生成提纲。各 Tab 通过 `display: none` 保留内部状态，切换时不丢失数据。

## 设计系统

| Token | 色值 | 用途 |
|-------|------|------|
| `ink` | #111827 | 主文字 |
| `ink-soft` | #4B5563 | 次要文字 |
| `ink-mute` | #9CA3AF | 弱化文字 |
| `paper` | #FFFFFF | 背景 |
| `line` | #F3F4F6 | 分割线 |
| `flow` / `flow-deep` | #60A5FA / #3B82F6 | 浅蓝点缀色 |

动画：`animate-soft-rise` 系列淡入上移，支持 `prefers-reduced-motion` 无障碍降级。

## License

Private
