import type { Category } from "./types";

export const categories: Category[] = ["时评热点", "知识科普", "职场成长", "商业分析", "AI科技", "教育观察"];

export const categoryKeywords: Record<Category, string[]> = {
  时评热点: ["热点", "社会", "新闻", "事件", "评论", "争议", "公共"],
  知识科普: ["科普", "知识", "原理", "解释", "为什么", "冷知识", "科学"],
  职场成长: ["职场", "工作", "新人", "成长", "面试", "简历", "老板", "同事"],
  商业分析: ["商业", "公司", "品牌", "消费", "财经", "行业", "增长", "创业"],
  AI科技: ["AI", "人工智能", "科技", "模型", "搜索", "工具", "智能"],
  教育观察: ["教育", "学习", "学生", "家长", "学校", "孩子", "老师"]
};

export function isCategory(value: string | null): value is Category {
  return value !== null && categories.includes(value as Category);
}
