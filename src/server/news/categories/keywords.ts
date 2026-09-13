import { TAXONOMY_SEED } from "@/lib/data/categories-seed";
import type { CategoryNode } from "@/types/category";

export interface CategoryRule {
  id: string;
  slug: string;
  name: string;
  level: 1 | 2 | 3;
  parentId: string | null;
  rootId: string;
  keywords: string[];
  exactPhrases?: string[];
}

/**
 * Flattens the hierarchical category tree and provides instant ancestor mapping.
 */
export interface TaxonomyIndex {
  categoryMap: Map<string, CategoryRule>;
  slugMap: Map<string, CategoryRule>;
  rules: CategoryRule[];
}

// Hand-curated high-precision domain keywords mapped by slug
const CATEGORY_KEYWORDS: Record<string, { keywords: string[]; exactPhrases?: string[] }> = {
  // 1. Technology
  technology: {
    keywords: ["technology", "tech", "digital", "silicon", "computing", "cyber", "software", "hardware"],
    exactPhrases: ["high tech", "tech industry", "big tech"],
  },
  "technology-ai": {
    keywords: ["ai", "artificial intelligence", "machine learning", "deep learning", "neural", "llm", "llms", "gpt", "openai", "anthropic", "gemini", "claude", "agentic", "inference"],
    exactPhrases: ["artificial intelligence", "machine learning", "deep learning", "foundation model"],
  },
  "ai-models": {
    keywords: ["gpt-4", "gpt-5", "claude", "gemini", "llama", "deepseek", "mistral", "multimodal", "reasoning model", "frontier model"],
    exactPhrases: ["ai model", "ai models", "large language model", "language model", "reasoning model"],
  },
  "generative-ai": {
    keywords: ["generative", "genai", "diffusion", "synthetic media", "sora", "midjourney", "runway", "dall-e", "voice clone"],
    exactPhrases: ["generative ai", "image generation", "video generation", "synthetic voice"],
  },
  "ai-agents": {
    keywords: ["agent", "agents", "agentic", "autonomous agent", "copilot", "tool orchestration", "coding agent"],
    exactPhrases: ["ai agent", "ai agents", "autonomous agents", "agentic workflow"],
  },
  "ai-infrastructure": {
    keywords: ["gpu cluster", "training cluster", "supercomputer", "h100", "b200", "blackwell", "tensor core", "inference scaling"],
    exactPhrases: ["ai infrastructure", "gpu cluster", "data center power", "ai compute"],
  },
  "ai-applications": {
    keywords: ["enterprise ai", "consumer ai", "ai assistant", "smart assistant", "ai workflow"],
    exactPhrases: ["ai application", "ai applications", "enterprise ai"],
  },
  "technology-software": {
    keywords: ["software", "code", "coding", "developer", "platform", "api", "framework", "library"],
    exactPhrases: ["software engineering", "software development"],
  },
  programming: {
    keywords: ["typescript", "python", "rust", "golang", "javascript", "c++", "compiler", "runtime"],
    exactPhrases: ["programming language", "programming languages"],
  },
  "developer-tools": {
    keywords: ["ide", "debugger", "ci/cd", "github", "git", "vscode", "devops", "docker", "terminal"],
    exactPhrases: ["developer tools", "dev tools", "build system"],
  },
  "cloud-computing": {
    keywords: ["cloud", "aws", "azure", "gcp", "kubernetes", "serverless", "distributed", "datacenter"],
    exactPhrases: ["cloud computing", "cloud infrastructure"],
  },
  "open-source": {
    keywords: ["open-source", "foss", "linux", "kernel", "mit license", "apache license", "github repo"],
    exactPhrases: ["open source", "open-source software"],
  },
  "technology-hardware": {
    keywords: ["hardware", "silicon", "chip", "chips", "device", "gadget", "electronics"],
    exactPhrases: ["hardware engineering", "consumer hardware"],
  },
  semiconductors: {
    keywords: ["semiconductor", "semiconductors", "tsmc", "asml", "lithography", "euv", "fab", "foundry", "wafer", "packaging"],
    exactPhrases: ["semiconductor industry", "chip fab", "chip packaging"],
  },
  cpus: {
    keywords: ["cpu", "cpus", "processor", "processors", "intel", "amd", "arm", "risc-v", "x86"],
    exactPhrases: ["central processing unit", "arm architecture"],
  },
  gpus: {
    keywords: ["gpu", "gpus", "nvidia", "geforce", "radeon", "cuda", "graphics card", "accelerator"],
    exactPhrases: ["graphics processing unit"],
  },
  networking: {
    keywords: ["networking", "infiniband", "ethernet", "router", "optical interconnect", "bandwidth", "switch"],
    exactPhrases: ["datacenter network", "high-speed networking"],
  },

  // 2. Business & Economy
  "business-economy": {
    keywords: ["business", "economy", "commerce", "corporate", "enterprise", "merger", "acquisition"],
    exactPhrases: ["global economy", "corporate strategy"],
  },
  "business-macroeconomics": {
    keywords: ["macroeconomics", "macro", "central bank", "federal reserve", "gdp", "recession", "economic growth"],
    exactPhrases: ["central bank", "economic growth", "interest rates"],
  },
  "interest-rates": {
    keywords: ["interest rate", "rate cut", "rate hike", "basis points", "powell", "ecb", "monetary policy", "yield curve"],
    exactPhrases: ["interest rates", "federal reserve", "rate cut", "rate hike"],
  },
  "inflation-wages": {
    keywords: ["inflation", "cpi", "deflation", "purchasing power", "wages", "labor market", "unemployment", "cost of living"],
    exactPhrases: ["consumer price index", "inflation rate", "cost of living"],
  },
  "global-trade": {
    keywords: ["tariff", "tariffs", "trade war", "exports", "imports", "supply chain", "freight", "wto", "customs"],
    exactPhrases: ["global trade", "supply chains", "trade agreement"],
  },
  "business-vc": {
    keywords: ["venture capital", "vc", "startup", "funding round", "series a", "seed round", "valuation", "term sheet"],
    exactPhrases: ["venture capital", "startup funding", "seed round", "series a"],
  },
  "early-stage": {
    keywords: ["early-stage", "incubator", "y combinator", "angel investor", "pre-seed", "bootstrap"],
    exactPhrases: ["early-stage startup", "early stage startups"],
  },
  "ipos-ma": {
    keywords: ["ipo", "ipos", "acquisition", "merger", "takeover", "buyout", "nasdaq listing", "public listing"],
    exactPhrases: ["initial public offering", "mergers and acquisitions", "public listing"],
  },

  // 3. Finance & Markets
  "finance-markets": {
    keywords: ["finance", "financial", "markets", "stocks", "wall street", "banking", "treasury"],
    exactPhrases: ["financial markets", "wall street"],
  },
  "finance-stock-markets": {
    keywords: ["stock", "stocks", "equities", "equity", "earnings", "revenue", "quarterly", "s&p 500", "nasdaq", "dow jones", "bull market", "bear market"],
    exactPhrases: ["stock market", "stock markets", "corporate earnings", "quarterly earnings", "record revenue"],
  },
  "us-equities": {
    keywords: ["s&p", "nasdaq", "nyse", "apple stock", "microsoft stock", "nvidia stock", "mega-cap", "wall street", "earnings"],
    exactPhrases: ["us equities", "s&p 500", "nasdaq 100", "wall street"],
  },
  "global-indices": {
    keywords: ["nikkei", "ftse", "dax", "hang seng", "shanghai composite", "msci"],
    exactPhrases: ["global indices", "asian markets", "european markets"],
  },
  "finance-crypto": {
    keywords: ["crypto", "cryptocurrency", "blockchain", "defi", "web3", "token", "wallet", "ledger"],
    exactPhrases: ["digital assets", "crypto market"],
  },
  bitcoin: {
    keywords: ["bitcoin", "btc", "satoshi", "halving", "hashrate", "spot etf", "lightning network"],
    exactPhrases: ["bitcoin etf", "bitcoin price"],
  },
  "ethereum-l2": {
    keywords: ["ethereum", "eth", "vitalik", "smart contract", "rollup", "arbitrum", "optimism", "solana"],
    exactPhrases: ["smart contracts", "layer 2", "ethereum network"],
  },

  // 4. Science
  science: {
    keywords: ["science", "scientific", "research", "experiment", "discovery", "physicist", "laboratory"],
    exactPhrases: ["scientific discovery", "scientific research"],
  },
  "science-space": {
    keywords: ["space", "astronomy", "astrophysics", "telescope", "nasa", "spacex", "orbit", "planet", "galaxy"],
    exactPhrases: ["space exploration", "outer space"],
  },
  spaceflight: {
    keywords: ["rocket", "starship", "falcon", "artemis", "astronaut", "satellite", "orbital", "launch vehicle"],
    exactPhrases: ["rocket launch", "space mission", "moon mission"],
  },
  cosmology: {
    keywords: ["jwst", "james webb", "dark matter", "dark energy", "black hole", "exoplanet", "supernova"],
    exactPhrases: ["james webb", "dark matter", "cosmic expansion"],
  },

  // 5. Health
  health: {
    keywords: ["health", "healthcare", "medical", "hospital", "patient", "wellness", "doctor"],
    exactPhrases: ["public health", "health care"],
  },
  "health-medicine": {
    keywords: ["medicine", "clinical", "therapeutic", "drug", "fda", "pharma", "pharmaceutical", "vaccine"],
    exactPhrases: ["clinical trial", "clinical trials", "medical breakthrough"],
  },
  oncology: {
    keywords: ["cancer", "oncology", "tumor", "car-t", "immunotherapy", "chemotherapy", "remission", "biopsy"],
    exactPhrases: ["cancer treatment", "cancer research", "early detection"],
  },
  longevity: {
    keywords: ["longevity", "aging", "lifespan", "metabolism", "cellular", "rejuvenation", "biomarker"],
    exactPhrases: ["healthy lifespan", "anti-aging research"],
  },

  // 6. Politics & Government
  "politics-government": {
    keywords: ["politics", "political", "government", "congress", "senate", "white house", "president", "parliament"],
    exactPhrases: ["supreme court", "white house", "capitol hill"],
  },
  "politics-policy": {
    keywords: ["legislation", "bill", "statute", "regulation", "regulator", "antitrust", "ftc", "sec"],
    exactPhrases: ["public policy", "executive order"],
  },
  "tech-regulation": {
    keywords: ["antitrust", "monopoly", "ai safety", "ai governance", "gdpr", "privacy law", "doj antitrust"],
    exactPhrases: ["tech regulation", "ai regulation", "antitrust lawsuit"],
  },
  elections: {
    keywords: ["election", "elections", "voter", "voting", "ballot", "poll", "debate", "campaign", "primary"],
    exactPhrases: ["presidential election", "midterm election", "voting rights"],
  },

  // 7. World
  world: {
    keywords: ["world", "international", "global", "diplomacy", "treaty", "united nations", "summit", "foreign policy"],
    exactPhrases: ["foreign affairs", "united nations", "world news"],
  },
  "world-geopolitics": {
    keywords: ["geopolitics", "nato", "defense", "military", "alliance", "sanctions", "border", "brics"],
    exactPhrases: ["foreign policy", "national security", "strategic alliance"],
  },
  "asia-pacific": {
    keywords: ["china", "japan", "taiwan", "india", "korea", "indo-pacific", "beijing", "tokyo", "modi"],
    exactPhrases: ["asia pacific", "south china sea"],
  },
  "europe-affairs": {
    keywords: ["europe", "european union", "eu", "brussels", "germany", "france", "uk", "brexit"],
    exactPhrases: ["european union", "european commission"],
  },

  // 8. Environment & Climate
  "environment-climate": {
    keywords: ["environment", "climate", "carbon", "emissions", "global warming", "planet", "ecology"],
    exactPhrases: ["climate change", "clean energy", "carbon emissions"],
  },
  "environment-energy": {
    keywords: ["clean energy", "renewable", "solar", "wind", "nuclear", "battery", "grid", "ev"],
    exactPhrases: ["renewable energy", "clean energy", "electric vehicle"],
  },
  "solar-wind": {
    keywords: ["solar panel", "photovoltaic", "wind turbine", "offshore wind", "renewable capacity"],
    exactPhrases: ["solar power", "wind energy", "solar energy"],
  },
  "nuclear-energy": {
    keywords: ["nuclear", "reactor", "smr", "fission", "fusion", "uranium", "iter"],
    exactPhrases: ["nuclear power", "nuclear energy", "nuclear fusion"],
  },

  // 9. Education
  education: {
    keywords: ["education", "school", "university", "college", "student", "learning", "teacher", "academic"],
    exactPhrases: ["higher education", "public education"],
  },
  "education-edtech": {
    keywords: ["edtech", "e-learning", "online course", "digital classroom", "curriculum", "khan"],
    exactPhrases: ["educational technology", "online learning"],
  },
  "ai-tutoring": {
    keywords: ["ai tutor", "ai tutoring", "adaptive learning", "personalized learning", "khanmigo"],
    exactPhrases: ["ai tutor", "ai tutoring", "ai in education"],
  },

  // 10. Jobs & Careers
  "jobs-careers": {
    keywords: ["jobs", "careers", "career", "employment", "hiring", "workplace", "resume", "recruiter"],
    exactPhrases: ["job market", "career growth"],
  },
  "jobs-future-of-work": {
    keywords: ["future of work", "workplace", "automation", "hybrid work", "freelance", "workforce"],
    exactPhrases: ["future of work", "return to office"],
  },
  "remote-work": {
    keywords: ["remote work", "work from home", "wfh", "digital nomad", "distributed team"],
    exactPhrases: ["remote work", "work from home", "distributed workforce"],
  },
  "tech-compensation": {
    keywords: ["salary", "compensation", "rsu", "equity grant", "bonus", "tech pay", "levels.fyi"],
    exactPhrases: ["tech salary", "software engineer salary", "stock options"],
  },

  // 11. Sports
  sports: {
    keywords: ["sports", "athlete", "championship", "tournament", "league", "coach", "stadium"],
    exactPhrases: ["sports news", "world championship"],
  },
  "sports-major-leagues": {
    keywords: ["nfl", "nba", "premier league", "uefa", "mlb", "fifa", "formula 1", "f1"],
    exactPhrases: ["champions league", "premier league", "world cup"],
  },
  "motorsports-f1": {
    keywords: ["f1", "formula 1", "grand prix", "verstappen", "ferrari", "mercedes f1", "paddock"],
    exactPhrases: ["formula one", "grand prix", "formula 1"],
  },
  "football-soccer": {
    keywords: ["soccer", "football", "fifa", "uefa", "real madrid", "barcelona", "striker", "penalty"],
    exactPhrases: ["champions league", "world cup", "global football"],
  },

  // 12. Entertainment & Culture
  "entertainment-culture": {
    keywords: ["entertainment", "culture", "movie", "film", "cinema", "music", "art", "streaming"],
    exactPhrases: ["pop culture", "box office"],
  },
  "entertainment-gaming": {
    keywords: ["gaming", "video games", "esports", "playstation", "xbox", "nintendo", "steam", "gamer"],
    exactPhrases: ["video game", "video games", "game industry"],
  },
  "game-engines": {
    keywords: ["unreal engine", "unity engine", "godot", "rendering", "ray tracing", "shaders"],
    exactPhrases: ["unreal engine", "game engine"],
  },

  // 13. Lifestyle
  lifestyle: {
    keywords: ["lifestyle", "wellness", "fitness", "mindfulness", "routine", "living"],
    exactPhrases: ["healthy lifestyle", "daily routine"],
  },
  "lifestyle-productivity": {
    keywords: ["productivity", "habits", "notion", "time management", "workflow", "focus", "journaling"],
    exactPhrases: ["personal productivity", "time management"],
  },
  "deep-work": {
    keywords: ["deep work", "cognitive focus", "distraction-free", "cal newport", "flow state"],
    exactPhrases: ["deep work", "flow state"],
  },

  // 14. Travel
  travel: {
    keywords: ["travel", "destination", "hotel", "resort", "tourism", "vacation", "trip"],
    exactPhrases: ["travel guide", "travel industry"],
  },
  "travel-aviation": {
    keywords: ["airline", "aviation", "boeing", "airbus", "flight", "airport", "aircraft"],
    exactPhrases: ["commercial aviation", "air travel"],
  },
  "commercial-aviation": {
    keywords: ["airliner", "runway", "carrier", "tsa", "cabin crew", "jet fuel", "airfare"],
    exactPhrases: ["commercial airline", "airline route"],
  },

  // 15. Food
  food: {
    keywords: ["food", "dining", "restaurant", "chef", "recipe", "cuisine", "culinary"],
    exactPhrases: ["food industry", "culinary arts"],
  },
  "food-technology": {
    keywords: ["agtech", "food tech", "cultivated meat", "alternative protein", "fermentation"],
    exactPhrases: ["food technology", "lab grown meat"],
  },
  "vertical-farming": {
    keywords: ["vertical farming", "hydroponics", "aeroponics", "indoor farm", "controlled agriculture"],
    exactPhrases: ["vertical farm", "vertical farming", "indoor farming"],
  },
};

/**
 * Builds an efficient indexed catalog of category rules from TAXONOMY_SEED.
 */
export function buildTaxonomyIndex(): TaxonomyIndex {
  const categoryMap = new Map<string, CategoryRule>();
  const slugMap = new Map<string, CategoryRule>();
  const rules: CategoryRule[] = [];

  const visitNode = (node: CategoryNode, parentId: string | null, rootId: string) => {
    const currentRoot = node.level === 1 ? node.id : rootId;
    const curated = CATEGORY_KEYWORDS[node.slug] || { keywords: [] };

    // Combine curated keywords with name tokens
    const combinedKeywords = new Set<string>();
    for (const kw of curated.keywords) {
      combinedKeywords.add(kw.toLowerCase().trim());
    }

    // Also include words from the name itself
    const nameWords = node.name.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
    for (const w of nameWords) {
      if (w.length > 2 && w !== "and" && w !== "the") {
        combinedKeywords.add(w);
      }
    }

    const rule: CategoryRule = {
      id: node.id,
      slug: node.slug,
      name: node.name,
      level: node.level as 1 | 2 | 3,
      parentId,
      rootId: currentRoot,
      keywords: Array.from(combinedKeywords),
      exactPhrases: curated.exactPhrases || [node.name.toLowerCase()],
    };

    categoryMap.set(rule.id, rule);
    slugMap.set(rule.slug, rule);
    rules.push(rule);

    if (node.children) {
      for (const child of node.children) {
        visitNode(child, node.id, currentRoot);
      }
    }
  };

  for (const root of TAXONOMY_SEED) {
    visitNode(root, null, root.id);
  }

  return { categoryMap, slugMap, rules };
}

let cachedTaxonomyIndex: TaxonomyIndex | null = null;

export function getTaxonomyIndex(): TaxonomyIndex {
  if (!cachedTaxonomyIndex) {
    cachedTaxonomyIndex = buildTaxonomyIndex();
  }
  return cachedTaxonomyIndex;
}
