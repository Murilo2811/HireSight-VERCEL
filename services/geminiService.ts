
import {
    RecruiterAnalysisResult,
    PreliminaryDecisionResult,
    ConsistencyAnalysisResult,
    RewrittenResumeResult,
} from '../types';

/**
 * Defines the structure for inputs passed to the backend, supporting both raw text and file data.
 */
type GeminiInput = {
    content: string | { data: string; mimeType: string };
    format: 'text' | 'file';
};

/**
 * Generic fetch handler for our backend API endpoint.
 * @param type - The type of analysis to perform.
 * @param payload - The data required for the analysis.
 * @returns The JSON result from the backend.
 */
const fetchFromApi = async (type: string, payload: unknown) => {
    const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, payload }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'An unknown API error occurred.' }));
        throw new Error(errorData.message || `API request failed with status ${response.status}`);
    }

    return response.json();
};

export const analyzeForRecruiter = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    language: string
): Promise<RecruiterAnalysisResult> => {
    return fetchFromApi('analyzeForRecruiter', { jobInput, resumeInput, language });
};

export const generatePreliminaryDecision = async (
    analysisResult: RecruiterAnalysisResult,
    language: string
): Promise<PreliminaryDecisionResult> => {
    return fetchFromApi('generatePreliminaryDecision', { analysisResult, language });
};

export const analyzeInterviewConsistency = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    interviewTranscript: string,
    compatibilityGaps: string[],
    language: string
): Promise<ConsistencyAnalysisResult> => {
    return fetchFromApi('analyzeInterviewConsistency', { jobInput, resumeInput, interviewTranscript, compatibilityGaps, language });
};

export const rewriteResumeForJob = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    language: string
): Promise<RewrittenResumeResult> => {
    return fetchFromApi('rewriteResumeForJob', { jobInput, resumeInput, language });
};
