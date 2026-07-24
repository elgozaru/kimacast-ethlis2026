export interface SourceArticle {
  url: string;
  title: string;
  section: string;
  rawText: string;
  publishedAt?: string;
}

export interface SplitStory {
  hook: string;
  freeTeaser: string;
  paidBody: string;
  cta: string;
}

export interface StoredPaidContent {
  rootHash: string;
  txHash: string;
  storageUri: string;
}

export interface PaywallQuote {
  priceUsd: number;
  payToAddress: string;
  network: "hedera";
  asset: string;
  resourceId: string;
}

export interface InstagramPost {
  id: string;
  sourceUrl: string;
  section: string;
  caption: string;
  hashtags: string[];
  paidContentUri: string;
  priceUsd: number;
}
