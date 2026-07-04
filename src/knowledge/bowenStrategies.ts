import type { KnowledgeItem } from "../domain/types";

export const bowenStrategies: KnowledgeItem[] = [
  {
    id: "opposite-turn",
    category: "通用",
    title: "对立翻转",
    strategy: "把大众都在讲的正向结论翻到反面，寻找失败、误判、代价和副作用。",
    appliesWhen: ["同质化", "热点", "反常识"]
  },
  {
    id: "audience-drilldown",
    category: "通用",
    title: "人群下钻",
    strategy: "从泛人群切到更窄的人群，让用户觉得内容是在讲自己。",
    appliesWhen: ["职场新人", "学生", "普通人", "小白"]
  },
  {
    id: "ai-verification",
    category: "AI科技",
    title: "AI答案交叉验证",
    strategy: "AI工具类内容不要只给工具名，要给判断标准、验证路径和常见误区。",
    appliesWhen: ["AI", "搜索", "真假", "工具"]
  },
  {
    id: "collectible-checklist",
    category: "通用",
    title: "收藏型清单",
    strategy: "把观点收束成3-5条可复用清单，放在结尾触发收藏。",
    appliesWhen: ["收藏", "清单", "方法"]
  }
];
