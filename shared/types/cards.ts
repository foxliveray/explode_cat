// Card Types
export enum CardType {
  // Special Cards
  EXPLODING_KITTEN = "exploding_kitten",
  IMPLODING_KITTEN = "imploding_kitten",
  DEFUSE = "defuse",
  STREAKING_KITTEN = "streaking_kitten",

  // Action Cards
  NOPE = "nope",
  ATTACK = "attack",
  TARGETED_ATTACK = "targeted_attack",
  SKIP = "skip",
  SUPER_SKIP = "super_skip",
  FAVOR = "favor",
  SHUFFLE = "shuffle",
  SEE_THE_FUTURE_3 = "see_the_future_3",
  SEE_THE_FUTURE_5 = "see_the_future_5",
  ALTER_THE_FUTURE_3 = "alter_the_future_3",
  ALTER_THE_FUTURE_5 = "alter_the_future_5",
  REVERSE = "reverse",
  DRAW_FROM_BOTTOM = "draw_from_bottom",
  CATOMIC_BOMB = "catomic_bomb",
  GARBAGE_COLLECTION = "garbage_collection",
  SWAP_TOP_AND_BOTTOM = "swap_top_and_bottom",

  // Cat Cards (no individual effect, used for combos)
  TACO_CAT = "taco_cat",
  HAIRY_POTATO_CAT = "hairy_potato_cat",
  CATTERMELON = "cattermelon",
  RAINBOW_RALPHING_CAT = "rainbow_ralphing_cat",
  BEARD_CAT = "beard_cat",
  FERAL_CAT = "feral_cat",
}

// Card categories
export enum CardCategory {
  EXPLODING = "exploding",
  DEFUSE = "defuse",
  ACTION = "action",
  CAT = "cat",
  SPECIAL = "special",
}

// Card source/expansion
export enum CardSource {
  BASE = "base",
  IMPLODING_KITTENS = "imploding_kittens",
  STREAKING_KITTENS = "streaking_kittens",
}

// Card definition
export interface CardDefinition {
  type: CardType;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  category: CardCategory;
  source: CardSource;
  count: number; // Default count in deck
  emoji: string;
}

// Card instance in game
export interface Card {
  id: string;
  type: CardType;
  faceUp?: boolean; // For Imploding Kitten
}

// Card definitions registry
export const CARD_DEFINITIONS: Record<CardType, CardDefinition> = {
  // Exploding Cards
  [CardType.EXPLODING_KITTEN]: {
    type: CardType.EXPLODING_KITTEN,
    name: "Exploding Kitten",
    nameZh: "炸弹猫",
    description: "You explode unless you have a Defuse card",
    descriptionZh: "抽到即爆炸，除非使用拆除卡",
    category: CardCategory.EXPLODING,
    source: CardSource.BASE,
    count: -1, // Dynamic: player count - 1
    emoji: "💣",
  },
  [CardType.IMPLODING_KITTEN]: {
    type: CardType.IMPLODING_KITTEN,
    name: "Imploding Kitten",
    nameZh: "内爆猫",
    description:
      "Cannot be defused. First draw: flip face up. Second draw: explode!",
    descriptionZh: "无法拆除，首次抽到翻面放回，再次抽到爆炸",
    category: CardCategory.EXPLODING,
    source: CardSource.IMPLODING_KITTENS,
    count: 1,
    emoji: "🌀",
  },

  // Defuse Cards
  [CardType.DEFUSE]: {
    type: CardType.DEFUSE,
    name: "Defuse",
    nameZh: "拆除",
    description:
      "Defuse an Exploding Kitten and secretly place it back in the deck",
    descriptionZh: "拆除炸弹猫并秘密放回牌堆任意位置",
    category: CardCategory.DEFUSE,
    source: CardSource.BASE,
    count: 6,
    emoji: "🔧",
  },
  [CardType.STREAKING_KITTEN]: {
    type: CardType.STREAKING_KITTEN,
    name: "Streaking Kitten",
    nameZh: "裸奔猫",
    description: "Hold an Exploding Kitten safely in your hand",
    descriptionZh: "可以安全持有炸弹猫，失去此卡后炸弹立即爆炸",
    category: CardCategory.SPECIAL,
    source: CardSource.STREAKING_KITTENS,
    count: 1,
    emoji: "🏃",
  },

  // Action Cards
  [CardType.NOPE]: {
    type: CardType.NOPE,
    name: "Nope",
    nameZh: "否决",
    description:
      "Stop any action except Defuse or Exploding Kitten. Can be chained.",
    descriptionZh: "取消任何动作卡效果（可连锁）",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 5,
    emoji: "🚫",
  },
  [CardType.ATTACK]: {
    type: CardType.ATTACK,
    name: "Attack",
    nameZh: "攻击",
    description: "End your turn without drawing. Next player takes 2 turns.",
    descriptionZh: "结束回合不抽牌，下家必须进行2回合",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 4,
    emoji: "⚔️",
  },
  [CardType.TARGETED_ATTACK]: {
    type: CardType.TARGETED_ATTACK,
    name: "Targeted Attack",
    nameZh: "定向攻击",
    description: "Pick any player to take 2 turns.",
    descriptionZh: "指定任意玩家进行2回合",
    category: CardCategory.ACTION,
    source: CardSource.IMPLODING_KITTENS,
    count: 3,
    emoji: "🎯",
  },
  [CardType.SKIP]: {
    type: CardType.SKIP,
    name: "Skip",
    nameZh: "跳过",
    description: "End your turn without drawing a card.",
    descriptionZh: "跳过抽牌结束回合",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 4,
    emoji: "⏭️",
  },
  [CardType.SUPER_SKIP]: {
    type: CardType.SUPER_SKIP,
    name: "Super Skip",
    nameZh: "超级跳过",
    description: "End all your remaining turns.",
    descriptionZh: "结束当前所有累积回合",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 1,
    emoji: "⏩",
  },
  [CardType.FAVOR]: {
    type: CardType.FAVOR,
    name: "Favor",
    nameZh: "索取",
    description: "Force any player to give you 1 card of their choice.",
    descriptionZh: "强制一名玩家给你一张他选择的牌",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 4,
    emoji: "🙏",
  },
  [CardType.SHUFFLE]: {
    type: CardType.SHUFFLE,
    name: "Shuffle",
    nameZh: "洗牌",
    description: "Shuffle the Draw Pile.",
    descriptionZh: "洗乱牌堆",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 4,
    emoji: "🔀",
  },
  [CardType.SEE_THE_FUTURE_3]: {
    type: CardType.SEE_THE_FUTURE_3,
    name: "See the Future",
    nameZh: "预见未来",
    description: "Privately view the top 3 cards of the Draw Pile.",
    descriptionZh: "私密查看牌堆顶3张",
    category: CardCategory.ACTION,
    source: CardSource.BASE,
    count: 5,
    emoji: "🔮",
  },
  [CardType.SEE_THE_FUTURE_5]: {
    type: CardType.SEE_THE_FUTURE_5,
    name: "See the Future (5x)",
    nameZh: "预见未来(5张)",
    description: "Privately view the top 5 cards of the Draw Pile.",
    descriptionZh: "私密查看牌堆顶5张",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 2,
    emoji: "🔮",
  },
  [CardType.ALTER_THE_FUTURE_3]: {
    type: CardType.ALTER_THE_FUTURE_3,
    name: "Alter the Future",
    nameZh: "改变未来",
    description: "Privately view and rearrange the top 3 cards.",
    descriptionZh: "私密查看并重排牌堆顶3张",
    category: CardCategory.ACTION,
    source: CardSource.IMPLODING_KITTENS,
    count: 4,
    emoji: "✨",
  },
  [CardType.ALTER_THE_FUTURE_5]: {
    type: CardType.ALTER_THE_FUTURE_5,
    name: "Alter the Future (5x)",
    nameZh: "改变未来(5张)",
    description: "Privately view and rearrange the top 5 cards.",
    descriptionZh: "私密查看并重排牌堆顶5张",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 2,
    emoji: "✨",
  },
  [CardType.REVERSE]: {
    type: CardType.REVERSE,
    name: "Reverse",
    nameZh: "反转",
    description: "Reverse the direction of play and end your turn.",
    descriptionZh: "反转出牌方向，结束回合不抽牌",
    category: CardCategory.ACTION,
    source: CardSource.IMPLODING_KITTENS,
    count: 4,
    emoji: "🔄",
  },
  [CardType.DRAW_FROM_BOTTOM]: {
    type: CardType.DRAW_FROM_BOTTOM,
    name: "Draw From Bottom",
    nameZh: "底部抽牌",
    description: "End your turn by drawing from the bottom of the deck.",
    descriptionZh: "从牌堆底部抽牌结束回合",
    category: CardCategory.ACTION,
    source: CardSource.IMPLODING_KITTENS,
    count: 4,
    emoji: "⬇️",
  },
  [CardType.CATOMIC_BOMB]: {
    type: CardType.CATOMIC_BOMB,
    name: "Catomic Bomb",
    nameZh: "猫原子弹",
    description:
      "All players discard hand (except Defuse). Collect all Exploding Kittens to top of deck.",
    descriptionZh: "所有玩家弃掉手牌(除拆除)，收集所有炸弹猫洗入牌堆顶部",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 1,
    emoji: "☢️",
  },
  [CardType.GARBAGE_COLLECTION]: {
    type: CardType.GARBAGE_COLLECTION,
    name: "Garbage Collection",
    nameZh: "垃圾回收",
    description: "All players put a card from hand into deck, then shuffle.",
    descriptionZh: "所有玩家选一张牌放入牌堆，然后洗牌",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 2,
    emoji: "🗑️",
  },
  [CardType.SWAP_TOP_AND_BOTTOM]: {
    type: CardType.SWAP_TOP_AND_BOTTOM,
    name: "Swap Top and Bottom",
    nameZh: "首尾交换",
    description:
      "Swap the top and bottom cards of the Draw Pile without looking.",
    descriptionZh: "交换牌堆首尾两张牌",
    category: CardCategory.ACTION,
    source: CardSource.STREAKING_KITTENS,
    count: 3,
    emoji: "🔃",
  },

  // Cat Cards
  [CardType.TACO_CAT]: {
    type: CardType.TACO_CAT,
    name: "Taco Cat",
    nameZh: "墨西哥卷饼猫",
    description: "No effect alone. Use in combos.",
    descriptionZh: "单独无效果，用于组合技能",
    category: CardCategory.CAT,
    source: CardSource.BASE,
    count: 4,
    emoji: "🌮",
  },
  [CardType.HAIRY_POTATO_CAT]: {
    type: CardType.HAIRY_POTATO_CAT,
    name: "Hairy Potato Cat",
    nameZh: "毛茸茸土豆猫",
    description: "No effect alone. Use in combos.",
    descriptionZh: "单独无效果，用于组合技能",
    category: CardCategory.CAT,
    source: CardSource.BASE,
    count: 4,
    emoji: "🥔",
  },
  [CardType.CATTERMELON]: {
    type: CardType.CATTERMELON,
    name: "Cattermelon",
    nameZh: "西瓜猫",
    description: "No effect alone. Use in combos.",
    descriptionZh: "单独无效果，用于组合技能",
    category: CardCategory.CAT,
    source: CardSource.BASE,
    count: 4,
    emoji: "🍉",
  },
  [CardType.RAINBOW_RALPHING_CAT]: {
    type: CardType.RAINBOW_RALPHING_CAT,
    name: "Rainbow Ralphing Cat",
    nameZh: "彩虹呕吐猫",
    description: "No effect alone. Use in combos.",
    descriptionZh: "单独无效果，用于组合技能",
    category: CardCategory.CAT,
    source: CardSource.BASE,
    count: 4,
    emoji: "🌈",
  },
  [CardType.BEARD_CAT]: {
    type: CardType.BEARD_CAT,
    name: "Beard Cat",
    nameZh: "胡子猫",
    description: "No effect alone. Use in combos.",
    descriptionZh: "单独无效果，用于组合技能",
    category: CardCategory.CAT,
    source: CardSource.BASE,
    count: 4,
    emoji: "🧔",
  },
  [CardType.FERAL_CAT]: {
    type: CardType.FERAL_CAT,
    name: "Feral Cat",
    nameZh: "野猫",
    description: "Acts as any Cat Card for combos.",
    descriptionZh: "万能猫牌，可替代任意猫牌",
    category: CardCategory.CAT,
    source: CardSource.IMPLODING_KITTENS,
    count: 4,
    emoji: "😼",
  },
};

// Combo types
export enum ComboType {
  TWO_OF_A_KIND = "two_of_a_kind",
  THREE_OF_A_KIND = "three_of_a_kind",
  FIVE_DIFFERENT = "five_different",
}

// Helper to get all cat card types
export const CAT_CARD_TYPES = [
  CardType.TACO_CAT,
  CardType.HAIRY_POTATO_CAT,
  CardType.CATTERMELON,
  CardType.RAINBOW_RALPHING_CAT,
  CardType.BEARD_CAT,
  CardType.FERAL_CAT,
];

// Helper to check if a card is a cat card
export function isCatCard(type: CardType): boolean {
  return CAT_CARD_TYPES.includes(type);
}

// Helper to check if a card can be noped
export function canBeNoped(type: CardType): boolean {
  const nonNopeable = [
    CardType.EXPLODING_KITTEN,
    CardType.IMPLODING_KITTEN,
    CardType.DEFUSE,
  ];
  return !nonNopeable.includes(type);
}
