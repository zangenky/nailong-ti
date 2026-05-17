// 4 个维度定义
const DIMENSIONS = [
  { key: 'EI', left: '抽象', right: '正经', leftCode: 'E', rightCode: 'I' },
  { key: 'NS', left: '直觉', right: '实感', leftCode: 'N', rightCode: 'S' },
  { key: 'TF', left: '理性', right: '感性', leftCode: 'T', rightCode: 'F' },
  { key: 'JP', left: '计划', right: '随性', leftCode: 'J', rightCode: 'P' }
];

// 16 道题，每个维度 4 题
const QUESTIONS = [
  // 抽象(E) vs 正经(I) — 4 题
  {
    dim: 'EI',
    q: '朋友突然约你出去玩，你的第一反应是？',
    left: '好呀，走啊！现在出发！',
    right: '我先看看日程有没有安排'
  },
  {
    dim: 'EI',
    q: '在聚会上你通常？',
    left: '到处串场，跟谁都聊几句',
    right: '找个熟悉的人待着就很安心'
  },
  {
    dim: 'EI',
    q: '你更享受哪种聊天氛围？',
    left: '天马行空，想到哪聊到哪',
    right: '有主题有逻辑地深入聊'
  },
  {
    dim: 'EI',
    q: '你的社交能量来源是？',
    left: '和人待在一起就是在充电',
    right: '独处才是真正的回血方式'
  },
  // 直觉(N) vs 实感(S) — 4 题
  {
    dim: 'NS',
    q: '你看电影时更关注？',
    left: '背后的寓意和隐喻',
    right: '剧情逻辑和画面细节'
  },
  {
    dim: 'NS',
    q: '拿到一个新工具，你会？',
    left: '先想想它的各种可能性',
    right: '直接上手试试怎么用'
  },
  {
    dim: 'NS',
    q: '你跟人聊天时更在意？',
    left: '对方话里的潜台词和意图',
    right: '对方说的具体内容和事实'
  },
  {
    dim: 'NS',
    q: '你更擅长记住？',
    left: '曾经有过的感觉和氛围',
    right: '具体发生过的事情和细节'
  },
  // 理性(T) vs 感性(F) — 4 题
  {
    dim: 'TF',
    q: '朋友向你倾诉烦恼，你首先会？',
    left: '帮他分析问题出在哪里',
    right: '先安抚他的情绪感受'
  },
  {
    dim: 'TF',
    q: '做重要决定时你更依赖？',
    left: '逻辑分析和客观数据',
    right: '内心的感觉和价值观'
  },
  {
    dim: 'TF',
    q: '看到有人被欺负，你会？',
    left: '理性分析谁对谁错',
    right: '先站到弱势一方'
  },
  {
    dim: 'TF',
    q: '吵架过后你更容易？',
    left: '觉得需要讲清对错',
    right: '在意对方是不是伤心了'
  },
  // 计划(J) vs 随性(P) — 4 题
  {
    dim: 'JP',
    q: '你出门旅行前会？',
    left: '做好详细的行程规划',
    right: '订个机票就走，到了再说'
  },
  {
    dim: 'JP',
    q: '你的桌面通常是？',
    left: '整洁有序，东西归位',
    right: '乱中有序，能找到就行'
  },
  {
    dim: 'JP',
    q: '截止日期临近，你通常会？',
    left: '提前规划，稳步推进',
    right: '最后一刻效率最高'
  },
  {
    dim: 'JP',
    q: '你更喜欢哪种生活方式？',
    left: '有规律有计划，心中有数',
    right: '随遇而安，享受当下'
  }
];

// 16 种奶龙-TI 类型（名字和描述可自定义）
const TYPE_DATA = {
  'ENFP': { name: '奶察', desc: '充满好奇心的社交达人，总能在人群中找到乐趣。你天马行空的想法常常让人眼前一亮，是朋友眼中的气氛担当。', color: '#FF9A9E' },
  'ENFJ': { name: '奶导', desc: '天生的领导者，温暖而有力量。你擅长发现别人的优点，总能把团队凝聚在一起。', color: '#FFD3B6' },
  'ENTP': { name: '奶辩', desc: '辩论小能手，享受思维碰撞的快感。你的脑袋里装满了新奇的点子，永远在挑战常规。', color: '#A8D8EA' },
  'ENTJ': { name: '奶帅', desc: '果断利落的指挥官，目标明确从不拖泥带水。你的执行力让人佩服，是天生的决策者。', color: '#FF9A9E' },
  'INFP': { name: '嘉豪', desc: '内心世界丰富的理想主义者。你温柔敏感，对美和意义有着独特的追求。', color: '#B5EAD7' },
  'INFJ': { name: '奶哲', desc: '安静而有深度的观察者。你看似沉默，却能洞察事物本质，常常一语中的。', color: '#C9B8E8' },
  'INTP': { name: '奶思', desc: '理性至上的思考者。你喜欢拆解问题、探索规律，在知识的海洋里乐此不疲。', color: '#A8D8EA' },
  'INTJ': { name: '奶谋', desc: '战略型策划大师。你总是提前想好三步，看似高冷实则内心充满野心。', color: '#C9B8E8' },
  'ESFP': { name: '奶星', desc: '舞台中央的闪耀明星。你热爱生活，享受当下，有你在的地方就有欢笑。', color: '#FFE699' },
  'ESFJ': { name: '奶暖', desc: '贴心温暖的大管家。你总是能记住每个人的喜好，把周围人照顾得妥妥帖帖。', color: '#FFD3B6' },
  'ESTP': { name: '奶闯', desc: '行动派的冒险家。你胆大心细，遇事不慌，总能在关键时刻挺身而出。', color: '#FF9A9E' },
  'ESTJ': { name: '奶管', desc: '靠谱务实的执行者。你做事有条有理，交给你的任务从不让人操心。', color: '#FFE699' },
  'ISFP': { name: '奶艺', desc: '安静的艺术灵魂。你用自己的方式感受世界，在细节中发现生活的美。', color: '#B5EAD7' },
  'ISFJ': { name: '奶护', desc: '温柔坚定的守护者。你默默付出，用行动表达关心，是朋友最可靠的后盾。', color: '#B5EAD7' },
  'ISTP': { name: '奶匠', desc: '心灵手巧的实践家。你喜欢动手解决问题，看似低调却是隐藏的高手。', color: '#A8D8EA' },
  'ISTJ': { name: '奶稳', desc: '沉稳可靠的中流砥柱。你脚踏实地，言行一致，是大家心中最靠谱的人。', color: '#FFE699' }
};

// 维度映射
const DIM_MAP = {
  'EI': { leftCode: 'E', rightCode: 'I' },
  'NS': { leftCode: 'N', rightCode: 'S' },
  'TF': { leftCode: 'T', rightCode: 'F' },
  'JP': { leftCode: 'J', rightCode: 'P' }
};
