import { categoryKeywords } from "./categories";
import type { Category, VideoTrend } from "./types";

const titleSeeds: Record<Category, string[]> = {
  时评热点: [
    "这次热搜真正值得关注的不是反转，而是普通人的判断成本",
    "为什么同一个公共事件，会在24小时内被讲成三个版本",
    "别急着站队：这类热点最容易忽略的三条事实",
    "一个争议事件爆了，背后其实是情绪结构变了",
    "热搜不是答案，它只是暴露了大家的共同焦虑",
    "为什么越是大热点，越需要讲慢一点",
    "这类事件的流量密码，不是愤怒而是代入感",
    "普通人看热点，最该避开的不是观点而是叙事陷阱",
    "一条热搜冲到10万播放，靠的是哪三个信息钩子",
    "别再复述热搜了，真正的新角度在评论区"
  ],
  知识科普: [
    "一个生活常识为什么突然爆了？因为它解决了真实困惑",
    "把复杂原理讲到10万播放，只需要换一个入口",
    "这类科普视频增长快，是因为它先回答了为什么",
    "知识内容想出圈，别先讲概念，先讲误区",
    "一个冷知识破10万播放，关键不是冷，而是有用",
    "为什么越基础的知识，越容易被收藏",
    "科普视频的爆点，往往藏在一个反常识例子里",
    "别把知识讲完整，先把问题讲具体",
    "三分钟科普能破圈，是因为它给了判断标准",
    "知识类视频增长快，通常先制造一个认知落差"
  ],
  职场成长: [
    "新人越努力越焦虑？这条视频为什么快速破10万",
    "职场内容爆了，不是因为鸡汤，而是因为说中了处境",
    "为什么这类工作经验视频，比方法论更容易涨",
    "一个职场误区被讲透，评论区会自动贡献新选题",
    "别讲自律了，职场新人真正缺的是反馈系统",
    "这类面试内容增长快，因为它降低了不确定性",
    "普通打工人爱收藏的，不是建议而是可复制话术",
    "为什么越具体的职场场景，越容易跑出高播放",
    "同样讲成长，为什么这个角度更容易破圈",
    "职场视频想要快涨，先说出用户不好意思说的问题"
  ],
  商业分析: [
    "一个品牌突然爆了，真正的增长点不在营销话术",
    "这家公司为什么被反复讨论？因为它踩中了消费变化",
    "商业分析破10万播放，通常先讲一个反直觉结论",
    "别只看财报，这类视频增长快是因为讲清了因果",
    "为什么一个小品类，会突然出现大流量内容",
    "消费趋势视频被收藏，是因为它给了判断框架",
    "行业分析想出圈，入口不能像研报",
    "商业内容增长快，往往靠一个普通人能理解的例子",
    "从一个爆款产品，看懂一类人群需求变化",
    "品牌故事不重要，真正有流量的是选择背后的代价"
  ],
  AI科技: [
    "AI搜索正在替代传统搜索？普通人真正该学的是判断答案",
    "这条AI工具视频为什么快破10万：它没有只讲工具名",
    "别再问AI会不会取代你，先学会验证它的答案",
    "AI内容增长快，不是因为新，而是因为大家怕落后",
    "一个AI功能爆了，普通人该关心的是使用边界",
    "为什么AI教程容易收藏？因为它给了步骤和避坑",
    "AI搜索的真正变化：从找资料变成外包判断",
    "这类AI视频能冲榜，是因为它把焦虑变成动作",
    "别讲大模型参数了，讲一个普通人的真实场景",
    "AI工具视频想破圈，必须回答真假和成本"
  ],
  教育观察: [
    "家长都在聊AI教育，但孩子最缺的是提问能力",
    "这条教育视频为什么破10万：它说出了家长的隐性焦虑",
    "别急着买工具，学习效率真正卡在这个环节",
    "教育内容增长快，通常不是讲方法，而是讲误区",
    "为什么越基础的学习建议，越容易被家长收藏",
    "孩子成绩问题背后，可能不是努力不够",
    "一个学习方法爆了，因为它给了家庭可执行步骤",
    "教育观察想出圈，要先把场景讲具体",
    "家长为什么愿意转发这类视频？因为它降低了决策焦虑",
    "别讲宏大教育趋势，先讲今晚能做什么"
  ]
};

export function getFallbackVideos(category: Category): VideoTrend[] {
  const now = Date.now();
  const fastVideos = titleSeeds[category].map((title, index) => {
    const ageHours = 6 + index * 2;
    const viewCount = 280000 - index * 12000;

    return createVideo({
      category,
      title,
      index,
      ageHours,
      viewCount,
      fast: true,
      now
    });
  });

  const baselineVideos = categoryKeywords[category].map((keyword, index) =>
    createVideo({
      category,
      title: `${keyword}类内容的正常增长样本 ${index + 1}`,
      index: index + 20,
      ageHours: 72 + index * 4,
      viewCount: 48000 + index * 5000,
      fast: false,
      now
    })
  );

  return [...fastVideos, ...baselineVideos];
}

function createVideo({
  category,
  title,
  index,
  ageHours,
  viewCount,
  fast,
  now
}: {
  category: Category;
  title: string;
  index: number;
  ageHours: number;
  viewCount: number;
  fast: boolean;
  now: number;
}): VideoTrend {
  return {
    id: `${category}-${index}`,
    platform: "bilibili",
    title,
    author: fast ? "博闻热榜样本" : "博闻基准样本",
    url: "https://www.bilibili.com",
    description: `${category}样本：${title}`,
    publishedAt: new Date(now - ageHours * 60 * 60 * 1000).toISOString(),
    viewCount,
    likeCount: Math.round(viewCount * (fast ? 0.08 : 0.025)),
    favoriteCount: Math.round(viewCount * (fast ? 0.045 : 0.012)),
    commentCount: Math.round(viewCount * (fast ? 0.014 : 0.004)),
    growthScore: 0,
    growthReason: ""
  };
}
