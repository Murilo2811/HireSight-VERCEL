import { GoogleGenAI, Type } from "@google/genai";
import {
    RecruiterAnalysisResult,
    PreliminaryDecisionResult,
    ConsistencyAnalysisResult,
    RewrittenResumeResult,
} from '../types';

// Gemini API client setup
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

/**
 * Defines the structure for inputs passed to Gemini, supporting both raw text and file data.
 */
type GeminiInput = {
    content: string | { data: string; mimeType: string };
    format: 'text' | 'file';
};

/**
 * Helper to build a content part for the Gemini API, handling both text and file data.
 */
const buildContentPart = (input: GeminiInput) => {
    if (input.format === 'file' && typeof input.content !== 'string') {
        // This is for file-based input, like PDFs.
        return { inlineData: input.content };
    }
    // This is for text-based input.
    return { text: input.content as string };
};

// --- Schemas for JSON output ---

const matchedItemSchema = {
    type: Type.OBJECT,
    properties: {
        item: { type: Type.STRING, description: "The specific responsibility or skill from the job description." },
        status: { type: Type.STRING, enum: ['Match', 'Partial', 'No Match'], description: "The match status." },
        explanation: { type: Type.STRING, description: "A brief explanation of why this status was given, referencing the resume." },
    },
    required: ['item', 'status', 'explanation']
};

const sectionMatchSchema = {
    type: Type.OBJECT,
    properties: {
        items: {
            type: Type.ARRAY,
            items: matchedItemSchema
        },
        score: { type: Type.NUMBER, description: "A score from 0 to 100 representing the match for this section." },
    },
    required: ['items', 'score']
};

const analysisWithScoreSchema = {
    type: Type.OBJECT,
    properties: {
        analysis: { type: Type.STRING, description: "The detailed analysis text." },
        score: { type: Type.NUMBER, description: "A score from 0 to 100 for this analysis." },
    },
    required: ['analysis', 'score']
};

const recruiterAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        jobTitle: { type: Type.STRING, description: "The job title from the job description." },
        summary: { type: Type.STRING, description: "A concise summary of the candidate's fit for the role." },
        keyResponsibilitiesMatch: sectionMatchSchema,
        requiredSkillsMatch: sectionMatchSchema,
        niceToHaveSkillsMatch: sectionMatchSchema,
        companyCultureFit: analysisWithScoreSchema,
        salaryAndBenefits: { type: Type.STRING, description: "Analysis of salary expectations and benefits, if mentioned." },
        redFlags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Any potential red flags or concerns." },
        interviewQuestions: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of suggested interview questions for this candidate." },
        overallFitScore: { type: Type.NUMBER, description: "An overall fit score from 0 to 100." },
        fitExplanation: { type: Type.STRING, description: "An explanation for the overall fit score." },
        compatibilityGaps: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of specific gaps between the resume and job description." },
    },
    required: [
        'jobTitle', 'summary', 'keyResponsibilitiesMatch', 'requiredSkillsMatch',
        'niceToHaveSkillsMatch', 'companyCultureFit', 'salaryAndBenefits', 'redFlags',
        'interviewQuestions', 'overallFitScore', 'fitExplanation', 'compatibilityGaps'
    ]
};

const preliminaryDecisionSchema = {
    type: Type.OBJECT,
    properties: {
        decision: { type: Type.STRING, enum: ['Recommended for Interview', 'Not Recommended'] },
        pros: { type: Type.ARRAY, items: { type: Type.STRING } },
        cons: { type: Type.ARRAY, items: { type: Type.STRING } },
        explanation: { type: Type.STRING }
    },
    required: ['decision', 'pros', 'cons', 'explanation']
};


const consistencySectionStringSchema = {
    type: Type.OBJECT,
    properties: {
        items: { type: Type.STRING },
        score: { type: Type.NUMBER },
    },
    required: ['items', 'score']
};

const consistencySectionStringArraySchema = {
    type: Type.OBJECT,
    properties: {
        items: { type: Type.ARRAY, items: { type: Type.STRING } },
        score: { type: Type.NUMBER },
    },
    required: ['items', 'score']
};

const gapResolutionItemSchema = {
    type: Type.OBJECT,
    properties: {
        gap: { type: Type.STRING, description: "The specific compatibility gap identified before the interview." },
        resolution: { type: Type.STRING, description: "The candidate's response or clarification from the interview transcript that addresses this gap. If the gap was not addressed, explain why." },
        isResolved: { type: Type.BOOLEAN, description: "Set to true if the candidate's response satisfactorily resolves the gap. Set to false if the response is insufficient, evasive, or if the gap was not addressed at all." }
    },
    required: ['gap', 'resolution', 'isResolved']
};

const gapResolutionSectionSchema = {
    type: Type.OBJECT,
    properties: {
        items: { type: Type.ARRAY, items: gapResolutionItemSchema },
        score: { type: Type.NUMBER },
    },
    required: ['items', 'score']
};

const consistencyAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        consistencyScore: { type: Type.NUMBER },
        summary: { type: Type.STRING },
        recommendation: { type: Type.STRING, enum: ['Strong Fit', 'Partial Fit', 'Weak Fit'] },
        softSkillsAnalysis: consistencySectionStringSchema,
        inconsistencies: consistencySectionStringArraySchema,
        missingFromInterview: consistencySectionStringArraySchema,
        newInInterview: consistencySectionStringArraySchema,
        gapResolutions: gapResolutionSectionSchema,
        prosForHiring: { type: Type.ARRAY, items: { type: Type.STRING } },
        consForHiring: { type: Type.ARRAY, items: { type: Type.STRING } },
        updatedOverallFitScore: { type: Type.NUMBER },
        hiringDecision: { type: Type.STRING, enum: ['Recommended for Hire', 'Not Recommended'] },
    },
    required: [
        'consistencyScore', 'summary', 'recommendation', 'softSkillsAnalysis', 'inconsistencies',
        'missingFromInterview', 'newInInterview', 'gapResolutions', 'prosForHiring', 'consForHiring',
        'updatedOverallFitScore', 'hiringDecision'
    ]
};

const rewrittenResumeSchema = {
    type: Type.OBJECT,
    properties: {
        rewrittenResume: { type: Type.STRING, description: "The full text of the rewritten resume." }
    },
    required: ['rewrittenResume']
};


// --- API Service Functions ---

export const analyzeForRecruiter = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    language: string
): Promise<RecruiterAnalysisResult> => {

    const jobPart = buildContentPart(jobInput);
    const resumePart = buildContentPart(resumeInput);

    const promptParts = [
        { text: `You are an expert HR recruiter analyzing a resume against a job description. Your output must be in JSON and conform to the provided schema. The analysis language should be: ${language}.` },
        { text: "Job Description:" },
        jobPart,
        { text: "Candidate's Resume:" },
        resumePart,
        { text: `
Analyze the resume against the job description and provide a detailed analysis.
- For each section (responsibilities, required skills, nice-to-have skills), list each item from the job description and evaluate how well the candidate's resume matches it.
- Provide an overall fit score and a detailed explanation.
- Identify specific compatibility gaps.
- Suggest relevant interview questions.
- Identify any red flags.` }
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: promptParts },
        config: {
            responseMimeType: "application/json",
            responseSchema: recruiterAnalysisSchema,
        },
    });

    const result = JSON.parse(response.text.trim());
    return result as RecruiterAnalysisResult;
};

export const generatePreliminaryDecision = async (
    analysisResult: RecruiterAnalysisResult,
    language: string
): Promise<PreliminaryDecisionResult> => {
    const prompt = `
Based on the following recruitment analysis, make a preliminary decision.
The decision should be either "Recommended for Interview" or "Not Recommended".
Provide a list of pros and cons, and a final explanation for your decision.
The response language must be ${language}.
Your output must be in JSON and conform to the provided schema.

Analysis:
${JSON.stringify(analysisResult, null, 2)}
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: preliminaryDecisionSchema,
        },
    });

    const result = JSON.parse(response.text.trim());
    return result as PreliminaryDecisionResult;
};

export const analyzeInterviewConsistency = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    interviewTranscript: string,
    compatibilityGaps: string[],
    language: string
): Promise<ConsistencyAnalysisResult> => {
    const jobPart = buildContentPart(jobInput);
    const resumePart = buildContentPart(resumeInput);

    const promptParts = [
        { text: `You are an expert HR analyst assessing the consistency between a candidate's resume, their interview, and the job description. Your output must be in JSON and conform to the provided schema. The analysis language should be: ${language}.` },
        { text: "Job Description:" },
        jobPart,
        { text: "Candidate's Resume:" },
        resumePart,
        { text: `Interview Transcript:\n${interviewTranscript}` },
        { text: `Previously identified compatibility gaps:\n- ${compatibilityGaps.join('\n- ')}` },
        { text: `
Analyze the interview transcript in the context of the resume, job description, and pre-identified gaps.
- For each compatibility gap, determine if the candidate's interview responses resolved it. The 'resolution' should quote or summarize the relevant part of the interview. The 'isResolved' flag must be set to 'true' only if the gap is fully and satisfactorily addressed. If not, set it to 'false' and explain why in the 'resolution' text.
- Assess overall consistency between their resume and interview answers.
- Identify any new information or skills that emerged during the interview.
- Identify key information from the resume that was not discussed.
- Analyze soft skills demonstrated.
- Provide a final hiring decision and an updated overall fit score.` }
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: promptParts },
        config: {
            responseMimeType: "application/json",
            responseSchema: consistencyAnalysisSchema,
        },
    });

    const result = JSON.parse(response.text.trim());
    return result as ConsistencyAnalysisResult;
};

export const rewriteResumeForJob = async (
    jobInput: GeminiInput,
    resumeInput: GeminiInput,
    language: string
): Promise<RewrittenResumeResult> => {
    const jobPart = buildContentPart(jobInput);
    const resumePart = buildContentPart(resumeInput);

    const promptParts = [
        { text: `You are an expert resume writer. Your task is to rewrite a resume to better align with a specific job description, without fabricating information. Maintain a professional tone. The output language should be: ${language}. Your output must be in JSON and conform to the provided schema.` },
        { text: "Original Resume:" },
        resumePart,
        { text: "Target Job Description:" },
        jobPart,
        { text: `
Rewrite the provided resume using **Markdown formatting**.
The goal is to emphasize skills and experiences from the original resume that are most relevant to the job description.

**Formatting Rules:**
- Use Markdown headings for sections (e.g., '## Professional Experience', '## Skills').
- Use bold for job titles (e.g., '**Senior Project Manager**').
- Use italics for company names and dates (e.g., '*Some Company | Jan 2020 - Present*').
- Use bullet points ('-') for responsibilities and achievements under each role.

**Content Rules:**
- Use keywords from the job description where appropriate and accurate.
- Rephrase bullet points to highlight achievements and impact.
- **CRITICAL: Do NOT add any new skills or experiences that are not present in the original resume. You must only use information provided in the original resume.**
- The output should be the complete, rewritten resume text in a single Markdown string.`}
    ];

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: promptParts },
        config: {
            responseMimeType: "application/json",
            responseSchema: rewrittenResumeSchema,
        },
    });

    const result = JSON.parse(response.text.trim());
    return result as RewrittenResumeResult;
};
