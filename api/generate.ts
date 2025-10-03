
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from "@google/genai";
import type {
    RecruiterAnalysisResult,
    PreliminaryDecisionResult,
    ConsistencyAnalysisResult,
    RewrittenResumeResult,
} from '../types';

// O serviço real do Gemini que agora roda no backend
const geminiService = {
    analyzeForRecruiter: async (payload: any): Promise<RecruiterAnalysisResult> => {
        const { jobInput, resumeInput, language } = payload;
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const jobPart = buildContentPart(jobInput);
        const resumePart = buildContentPart(resumeInput);

        const promptParts = [
            { text: `You are an expert HR recruiter analyzing a resume against a job description. Your output must be in JSON and conform to the provided schema. The analysis language should be: ${language}.` },
            { text: "Job Description:" },
            jobPart,
            { text: "Candidate's Resume:" },
            resumePart,
            { text: `Analyze the resume against the job description and provide a detailed analysis.` }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: promptParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: recruiterAnalysisSchema,
            },
        });

        return JSON.parse(response.text.trim()) as RecruiterAnalysisResult;
    },

    generatePreliminaryDecision: async (payload: any): Promise<PreliminaryDecisionResult> => {
        const { analysisResult, language } = payload;
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

        const prompt = `Based on the following recruitment analysis, make a preliminary decision. The decision should be either "Recommended for Interview" or "Not Recommended". Provide pros, cons, and an explanation. The response language must be ${language}. Your output must be in JSON and conform to the provided schema. Analysis: ${JSON.stringify(analysisResult, null, 2)}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: preliminaryDecisionSchema,
            },
        });

        return JSON.parse(response.text.trim()) as PreliminaryDecisionResult;
    },

    analyzeInterviewConsistency: async (payload: any): Promise<ConsistencyAnalysisResult> => {
        const { jobInput, resumeInput, interviewTranscript, compatibilityGaps, language } = payload;
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        
        const jobPart = buildContentPart(jobInput);
        const resumePart = buildContentPart(resumeInput);

        const promptParts = [
            { text: `You are an expert HR analyst assessing consistency. Your output must be in JSON and conform to the provided schema. The analysis language should be: ${language}.` },
            { text: "Job Description:" },
            jobPart,
            { text: "Candidate's Resume:" },
            resumePart,
            { text: `Interview Transcript:\n${interviewTranscript}` },
            { text: `Previously identified compatibility gaps:\n- ${compatibilityGaps.join('\n- ')}` },
            { text: `Analyze the interview transcript.` }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: promptParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: consistencyAnalysisSchema,
            },
        });

        return JSON.parse(response.text.trim()) as ConsistencyAnalysisResult;
    },

    rewriteResumeForJob: async (payload: any): Promise<RewrittenResumeResult> => {
        const { jobInput, resumeInput, language } = payload;
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        
        const jobPart = buildContentPart(jobInput);
        const resumePart = buildContentPart(resumeInput);

        const promptParts = [
            { text: `You are an expert resume writer. Rewrite a resume to better align with a specific job description, without fabricating information. Use Markdown formatting. The output language should be: ${language}. Your output must be in JSON and conform to the provided schema.` },
            { text: "Original Resume:" },
            resumePart,
            { text: "Target Job Description:" },
            jobPart,
            { text: `Rewrite the resume.` }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: promptParts },
            config: {
                responseMimeType: "application/json",
                responseSchema: rewrittenResumeSchema,
            },
        });

        return JSON.parse(response.text.trim()) as RewrittenResumeResult;
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    if (!process.env.API_KEY) {
        return res.status(500).json({ message: 'API key is not configured on the server.' });
    }

    const { type, payload } = req.body;

    try {
        let result;
        switch (type) {
            case 'analyzeForRecruiter':
                result = await geminiService.analyzeForRecruiter(payload);
                break;
            case 'generatePreliminaryDecision':
                result = await geminiService.generatePreliminaryDecision(payload);
                break;
            case 'analyzeInterviewConsistency':
                result = await geminiService.analyzeInterviewConsistency(payload);
                break;
            case 'rewriteResumeForJob':
                result = await geminiService.rewriteResumeForJob(payload);
                break;
            default:
                return res.status(400).json({ message: 'Invalid analysis type' });
        }
        res.status(200).json(result);
    } catch (error) {
        console.error('Error processing request:', error);
        res.status(500).json({ message: error instanceof Error ? error.message : 'An internal server error occurred' });
    }
}

// --- Helper and Schemas (Copied from original geminiService.ts) ---
const buildContentPart = (input: any) => {
    if (input.format === 'file' && typeof input.content !== 'string') {
        return { inlineData: input.content };
    }
    return { text: input.content as string };
};

const matchedItemSchema = { type: Type.OBJECT, properties: { item: { type: Type.STRING }, status: { type: Type.STRING, enum: ['Match', 'Partial', 'No Match'] }, explanation: { type: Type.STRING } }, required: ['item', 'status', 'explanation'] };
const sectionMatchSchema = { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: matchedItemSchema }, score: { type: Type.NUMBER } }, required: ['items', 'score'] };
const analysisWithScoreSchema = { type: Type.OBJECT, properties: { analysis: { type: Type.STRING }, score: { type: Type.NUMBER } }, required: ['analysis', 'score'] };
const recruiterAnalysisSchema = { type: Type.OBJECT, properties: { jobTitle: { type: Type.STRING }, summary: { type: Type.STRING }, keyResponsibilitiesMatch: sectionMatchSchema, requiredSkillsMatch: sectionMatchSchema, niceToHaveSkillsMatch: sectionMatchSchema, companyCultureFit: analysisWithScoreSchema, salaryAndBenefits: { type: Type.STRING }, redFlags: { type: Type.ARRAY, items: { type: Type.STRING } }, interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING } }, overallFitScore: { type: Type.NUMBER }, fitExplanation: { type: Type.STRING }, compatibilityGaps: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: [ 'jobTitle', 'summary', 'keyResponsibilitiesMatch', 'requiredSkillsMatch', 'niceToHaveSkillsMatch', 'companyCultureFit', 'salaryAndBenefits', 'redFlags', 'interviewQuestions', 'overallFitScore', 'fitExplanation', 'compatibilityGaps' ] };
const preliminaryDecisionSchema = { type: Type.OBJECT, properties: { decision: { type: Type.STRING, enum: ['Recommended for Interview', 'Not Recommended'] }, pros: { type: Type.ARRAY, items: { type: Type.STRING } }, cons: { type: Type.ARRAY, items: { type: Type.STRING } }, explanation: { type: Type.STRING } }, required: ['decision', 'pros', 'cons', 'explanation'] };
const consistencySectionStringSchema = { type: Type.OBJECT, properties: { items: { type: Type.STRING }, score: { type: Type.NUMBER } }, required: ['items', 'score'] };
const consistencySectionStringArraySchema = { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: { type: Type.STRING } }, score: { type: Type.NUMBER } }, required: ['items', 'score'] };
const gapResolutionItemSchema = { type: Type.OBJECT, properties: { gap: { type: Type.STRING }, resolution: { type: Type.STRING }, isResolved: { type: Type.BOOLEAN } }, required: ['gap', 'resolution', 'isResolved'] };
const gapResolutionSectionSchema = { type: Type.OBJECT, properties: { items: { type: Type.ARRAY, items: gapResolutionItemSchema }, score: { type: Type.NUMBER } }, required: ['items', 'score'] };
const consistencyAnalysisSchema = { type: Type.OBJECT, properties: { consistencyScore: { type: Type.NUMBER }, summary: { type: Type.STRING }, recommendation: { type: Type.STRING, enum: ['Strong Fit', 'Partial Fit', 'Weak Fit'] }, softSkillsAnalysis: consistencySectionStringSchema, inconsistencies: consistencySectionStringArraySchema, missingFromInterview: consistencySectionStringArraySchema, newInInterview: consistencySectionStringArraySchema, gapResolutions: gapResolutionSectionSchema, prosForHiring: { type: Type.ARRAY, items: { type: Type.STRING } }, consForHiring: { type: Type.ARRAY, items: { type: Type.STRING } }, updatedOverallFitScore: { type: Type.NUMBER }, hiringDecision: { type: Type.STRING, enum: ['Recommended for Hire', 'Not Recommended'] } }, required: [ 'consistencyScore', 'summary', 'recommendation', 'softSkillsAnalysis', 'inconsistencies', 'missingFromInterview', 'newInInterview', 'gapResolutions', 'prosForHiring', 'consForHiring', 'updatedOverallFitScore', 'hiringDecision' ] };
const rewrittenResumeSchema = { type: Type.OBJECT, properties: { rewrittenResume: { type: Type.STRING } }, required: ['rewrittenResume'] };
