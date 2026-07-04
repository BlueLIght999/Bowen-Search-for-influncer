# 博闻 Local MVP

本地验证链路：抓取近五日视频榜单 -> 找到快速增长范例 -> 解析文案逻辑 -> 调取知识库 -> 输出拍摄文案大纲和建议。

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validation Script

1. Click `抓取近五日视频榜单`.
2. Select one fast-growing sample from the left panel.
3. Review the copy logic analysis.
4. Review the shooting outline and differentiation advice.
5. Check whether the output is specific enough to start filming.

## Data Source

The MVP calls `/api/hot-videos`, which tries to fetch Bilibili's public popular video list, filters videos published in the last five days, and ranks them by a proxy growth score: views per hour plus weighted engagement per hour.

If the live request fails, the API returns local fallback samples so the demo flow stays usable.

## MVP Validation Checklist

Use this with each test user:

1. Can the user understand what to input within 30 seconds?
2. Can the user generate a result within 2 minutes?
3. Does the sample analysis correctly explain why the reference works?
4. Does at least one differentiated direction feel non-obvious?
5. Does the filming advice make the user feel they can shoot today?
6. Would the user pay 9.9元 for one complete plan?

Record:

- Category:
- Hotspot:
- Sample source:
- Chosen direction:
- User usefulness score from 1-5:
- User shootability score from 1-5:
- Payment willingness:
- Biggest missing piece:
