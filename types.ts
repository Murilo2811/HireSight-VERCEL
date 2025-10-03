export type MatchStatus = 'Match' | 'Partial' | 'No Match';

export type MatchedItem = {
  item: string;
  status: MatchStatus;
  explanation: string;
};

export type SectionMatch<T> = {
  items: T[];
  score: number;
};

export type AnalysisWithScore = {
  analysis: string;
  score: number;
};

export type RecruiterAnalysisResult = {
  jobTitle: string;
  summary: string;
  keyResponsibilitiesMatch: SectionMatch<MatchedItem>;
  requiredSkillsMatch: SectionMatch<MatchedItem>;
  niceToHaveSkillsMatch: SectionMatch<MatchedItem>;
  companyCultureFit: AnalysisWithScore;
  salaryAndBenefits: string;
  redFlags: string[];
  interviewQuestions: string[];
  overallFitScore: number;
  fitExplanation: string;
  compatibilityGaps: string[];
};

export type PreliminaryDecisionResult = {
    decision: 'Recommended for Interview' | 'Not Recommended';
    pros: string[];
    cons: string[];
    explanation: string;
};

export type ConsistencySection<T> = {
  items: T;
  score: number;
};

export type GapResolutionItem = {
    gap: string;
    resolution: string;
    isResolved: boolean;
};

export type ConsistencyAnalysisResult = {
  consistencyScore: number;
  summary: string;
  recommendation: 'Strong Fit' | 'Partial Fit' | 'Weak Fit';
  softSkillsAnalysis: ConsistencySection<string>;
  inconsistencies: ConsistencySection<string[]>;
  missingFromInterview: ConsistencySection<string[]>;
  newInInterview: ConsistencySection<string[]>;
  gapResolutions: ConsistencySection<GapResolutionItem[]>;
  prosForHiring: string[];
  consForHiring: string[];
  updatedOverallFitScore: number;
  hiringDecision: 'Recommended for Hire' | 'Not Recommended';
};

export type RewrittenResumeResult = {
  rewrittenResume: string;
};
