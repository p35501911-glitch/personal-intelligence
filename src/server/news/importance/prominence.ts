/**
 * High-Impact Event & Entity Prominence Detector
 *
 * Identifies key market-moving institutions, global heads of state,
 * mega-cap tech leaders, regulatory milestones, and urgent/breaking signals.
 */

export interface ProminenceMatch {
  score: number;
  signals: string[];
}

interface ProminenceRule {
  pattern: RegExp;
  label: string;
  weight: number;
}

const PROMINENCE_RULES: ProminenceRule[] = [
  // Urgent / Breaking News Indicators
  {
    pattern: /\b(breaking(\s+news)?|urgent|alert|crisis|emergency|developing\s+story)\b/i,
    label: "Breaking / Urgent Development",
    weight: 0.20,
  },

  // Central Banks & Monetary Shocks
  {
    pattern: /\b(federal\s+reserve|the\s+fed|jerome\s+powell|interest\s+rates?|rate\s+cut|rate\s+hike|ecb|european\s+central\s+bank|bank\s+of\s+japan|boj|inflation|cpi|recession|stagflation)\b/i,
    label: "Central Bank & Macro Policy",
    weight: 0.22,
  },

  // Global Governance, Geopolitics & Military
  {
    pattern: /\b(white\s+house|president\s+(biden|trump|xi|putin|zelenskyy|macron)|prime\s+minister|united\s+nations|un\s+security\s+council|nato|pentagon|supreme\s+court|congress|sanctions|ceasefire|peace\s+talks|treaty|martial\s+law)\b/i,
    label: "Global Governance & Geopolitics",
    weight: 0.22,
  },

  // Mega-Cap Tech & Frontier AI Milestones
  {
    pattern: /\b(openai|nvidia|tsmc|apple|microsoft|google|alphabet|meta|amazon|anthropic|sam\s+altman|jensen\s+huang|agi|frontier\s+model|quantum\s+computing)\b/i,
    label: "Frontier Tech & Industry Leader",
    weight: 0.18,
  },

  // Market Shocks, Legal & Corporate Seismic Events
  {
    pattern: /\b(antitrust|doj\s+lawsuit|sec\s+(charges|investigation|filing)|bankruptcy|bank\s+collapse|default|bailout|merger|acquisition|takeover|hostile\s+bid|all-time\s+high|market\s+crash)\b/i,
    label: "Market Shock or Regulatory Action",
    weight: 0.18,
  },

  // Cybersecurity, Infrastructure & Outages
  {
    pattern: /\b(global\s+outage|cyberattack|critical\s+vulnerability|zero-day|blackout|grid\s+failure)\b/i,
    label: "Infrastructure or Security Incident",
    weight: 0.16,
  },
];

/**
 * Evaluates the text of a story (title + summary) for prominent entities and high-impact events.
 */
export function evaluateEventProminence(title: string, summary?: string | null): ProminenceMatch {
  const combined = `${title} ${summary || ""}`.trim();
  if (!combined) {
    return { score: 0.2, signals: [] };
  }

  const matchedSignals: string[] = [];
  let totalBonus = 0;

  for (const rule of PROMINENCE_RULES) {
    if (rule.pattern.test(combined)) {
      matchedSignals.push(rule.label);
      totalBonus += rule.weight;
    }
  }

  // Base score 0.20, scaled with matched bonuses, capped at 1.00
  const finalScore = Math.min(1.0, 0.2 + totalBonus);

  return {
    score: Number(finalScore.toFixed(3)),
    signals: matchedSignals,
  };
}
