import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslations } from './contexts/LanguageContext';
import { analyzeForRecruiter, analyzeInterviewConsistency, generatePreliminaryDecision, rewriteResumeForJob } from './services/geminiService';
import { parseDocumentFile, parseUrlContent, downloadFile } from './utils/parsers';
import { RecruiterAnalysisResult, ConsistencyAnalysisResult, MatchStatus, PreliminaryDecisionResult, RewrittenResumeResult } from './types';
import LoadingSpinner from './components/LoadingSpinner';
import Card from './components/Card';
import { FileTextIcon, GlobeIcon, UploadIcon, DownloadIcon, SunIcon, MoonIcon, InfoIcon } from './components/icons';

type JobInputType = 'text' | 'url' | 'file';
type ResumeInputType = 'text' | 'file';
type ResultTab = 'recruiter' | 'decision' | 'rewrite' | 'consistency';

const App: React.FC = () => {
  const { t, language, setLanguage } = useTranslations();
  
  const [jobInputType, setJobInputType] = useState<JobInputType>('text');
  const [resumeInputType, setResumeInputType] = useState<ResumeInputType>('text');

  const [jobDescriptionText, setJobDescriptionText] = useState('');
  const [jobDescriptionUrl, setJobDescriptionUrl] = useState('');
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);

  const [resumeText, setResumeText] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  
  const [interviewTranscript, setInterviewTranscript] = useState('');

  const [analysisResult, setAnalysisResult] = useState<RecruiterAnalysisResult | null>(null);
  const [preliminaryDecision, setPreliminaryDecision] = useState<PreliminaryDecisionResult | null>(null);
  const [consistencyResult, setConsistencyResult] = useState<ConsistencyAnalysisResult | null>(null);
  const [rewrittenResume, setRewrittenResume] = useState<RewrittenResumeResult | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingDecision, setIsGeneratingDecision] = useState(false);
  const [isAnalyzingConsistency, setIsAnalyzingConsistency] = useState(false);
  const [isRewritingResume, setIsRewritingResume] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [consistencyError, setConsistencyError] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const [activeResultTab, setActiveResultTab] = useState<ResultTab>('recruiter');

  const jobDescriptionFileRef = useRef<HTMLInputElement>(null);
  const resumeFileRef = useRef<HTMLInputElement>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as 'light' | 'dark';
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };
  
  const isAnalyzeDisabled = useMemo(() => {
    if (isLoading) return true;
    const isJobInputMissing = 
        (jobInputType === 'text' && !jobDescriptionText) ||
        (jobInputType === 'url' && !jobDescriptionUrl) ||
        (jobInputType === 'file' && !jobDescriptionFile);
    const isResumeInputMissing = 
        (resumeInputType === 'text' && !resumeText) ||
        (resumeInputType === 'file' && !resumeFile);
    return isJobInputMissing || isResumeInputMissing;
  }, [isLoading, jobInputType, jobDescriptionText, jobDescriptionUrl, jobDescriptionFile, resumeInputType, resumeText, resumeFile]);

  const getJobInput = async () => {
    if (jobInputType === 'text') {
      return { content: jobDescriptionText, format: 'text' as const };
    } else if (jobInputType === 'url') {
      const content = await parseUrlContent(jobDescriptionUrl);
      return { content, format: 'text' as const };
    } else if (jobInputType === 'file' && jobDescriptionFile) {
      return parseDocumentFile(jobDescriptionFile);
    }
    throw new Error(t('error.jobDescriptionMissing'));
  };

  const getResumeInput = async () => {
    if (resumeInputType === 'text') {
      return { content: resumeText, format: 'text' as const };
    } else if (resumeInputType === 'file' && resumeFile) {
      return parseDocumentFile(resumeFile);
    }
    throw new Error(t('error.resumeMissing'));
  };

  const handleAnalyze = async () => {
    if (isAnalyzeDisabled) return;

    setIsLoading(true);
    handleGlobalReset(true); // Soft reset

    try {
      const jobInput = await getJobInput();
      const resumeInput = await getResumeInput();
      const result = await analyzeForRecruiter(jobInput, resumeInput, language);
      setAnalysisResult(result);
      setActiveResultTab('recruiter');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : t('error.unknown');
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDecision = async () => {
      if (!analysisResult) return;
      setIsGeneratingDecision(true);
      setDecisionError(null);
      setPreliminaryDecision(null);
      try {
          const decision = await generatePreliminaryDecision(analysisResult, language);
          setPreliminaryDecision(decision);
          setActiveResultTab('decision');
      } catch (e) {
          const errorMessage = e instanceof Error ? e.message : t('error.unknown');
          setDecisionError(errorMessage);
      } finally {
          setIsGeneratingDecision(false);
      }
  };

  const handleAnalyzeConsistency = async () => {
    if (!interviewTranscript || !analysisResult) return;

    setIsAnalyzingConsistency(true);
    setConsistencyResult(null);
    setConsistencyError(null);

    try {
        const jobInput = await getJobInput();
        const resumeInput = await getResumeInput();

        const result = await analyzeInterviewConsistency(jobInput, resumeInput, interviewTranscript, analysisResult.compatibilityGaps, language);
        setConsistencyResult(result);
        setActiveResultTab('consistency');
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : t('error.unknownConsistency');
        setConsistencyError(errorMessage);
    } finally {
        setIsAnalyzingConsistency(false);
    }
  };

  const handleRewriteResume = async () => {
    if (!analysisResult) return;
    setIsRewritingResume(true);
    setRewriteError(null);
    setRewrittenResume(null);
    try {
        const jobInput = await getJobInput();
        const resumeInput = await getResumeInput();
        const result = await rewriteResumeForJob(jobInput, resumeInput, language);
        setRewrittenResume(result);
        setActiveResultTab('rewrite');
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : t('error.unknownRewrite');
        setRewriteError(errorMessage);
    } finally {
        setIsRewritingResume(false);
    }
  };

  const handleClearJobDescription = () => {
    setJobDescriptionText('');
    setJobDescriptionUrl('');
    setJobDescriptionFile(null);
    if (jobDescriptionFileRef.current) {
      jobDescriptionFileRef.current.value = '';
    }
  };

  const handleClearResume = () => {
    setResumeText('');
    setResumeFile(null);
    if (resumeFileRef.current) {
      resumeFileRef.current.value = '';
    }
  };
  
  const handleGlobalReset = (isSoftReset = false) => {
    // Reset results and errors
    setAnalysisResult(null);
    setPreliminaryDecision(null);
    setConsistencyResult(null);
    setRewrittenResume(null);
    setError(null);
    setDecisionError(null);
    setConsistencyError(null);
    setRewriteError(null);
    
    // Reset loading states
    if (!isSoftReset) setIsLoading(false);
    setIsGeneratingDecision(false);
    setIsAnalyzingConsistency(false);
    setIsRewritingResume(false);

    if (!isSoftReset) {
      // Full reset also clears inputs
      setJobInputType('text');
      setResumeInputType('text');
      setJobDescriptionText('');
      setJobDescriptionUrl('');
      setJobDescriptionFile(null);
      setResumeText('');
      setResumeFile(null);
      setInterviewTranscript('');

      if (jobDescriptionFileRef.current) {
        jobDescriptionFileRef.current.value = '';
      }
      if (resumeFileRef.current) {
        resumeFileRef.current.value = '';
      }
    }
  };

  const InputTabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        active
          ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white border-b-2 border-cyan-500'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  );

  const ResultTabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; }> = ({ active, onClick, children, disabled }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
        active
          ? 'bg-cyan-600 text-white'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  );

  
  const ResetIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
      <path d="M3 3v5h5"/>
    </svg>
  );
  
  const ClearIcon = (props: React.SVGProps<SVGSVGElement>) => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
  );

  return (
    <div className="bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white min-h-screen font-sans transition-colors duration-300">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <header className="flex justify-between items-center mb-8">
            <h1 className="text-4xl font-bold text-cyan-500 dark:text-cyan-400">{t('appTitle')}</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleGlobalReset(false)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title={t('buttons.resetApp')}
                >
                  <ResetIcon />
                  <span className="hidden sm:inline">{t('buttons.resetApp')}</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex items-center justify-center w-9 h-8 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                >
                  {theme === 'light' ? <MoonIcon className="w-5 h-5 text-gray-700" /> : <SunIcon className="w-5 h-5 text-gray-200" />}
                </button>
              </div>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 hidden sm:block"></div>
              <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                <button onClick={() => setLanguage('en')} className={`px-3 py-1 text-sm rounded-md transition-colors ${language === 'en' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>EN</button>
                <button onClick={() => setLanguage('pt')} className={`px-3 py-1 text-sm rounded-md transition-colors ${language === 'pt' ? 'bg-white dark:bg-gray-600 shadow-sm' : 'hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>PT</button>
              </div>
            </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-5 lg:gap-8">
          <div className="lg:col-span-2 lg:sticky lg:top-8 self-start flex flex-col gap-6">
            <Card title={t('jobDescription.title')} actions={
              <button onClick={handleClearJobDescription} className="flex items-center gap-1.5 px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                  <ClearIcon />
                  {t('buttons.clear')}
              </button>}>
                <div className="border-b border-gray-200 dark:border-gray-600 mb-4">
                    <div className="flex -mb-px">
                        <InputTabButton active={jobInputType === 'text'} onClick={() => setJobInputType('text')}><FileTextIcon className="w-4 h-4" /> {t('jobDescription.pasteText')}</InputTabButton>
                        <InputTabButton active={jobInputType === 'url'} onClick={() => setJobInputType('url')}><GlobeIcon className="w-4 h-4" /> {t('jobDescription.fromUrl')}</InputTabButton>
                        <InputTabButton active={jobInputType === 'file'} onClick={() => setJobInputType('file')}><UploadIcon className="w-4 h-4" /> {t('jobDescription.uploadFile')}</InputTabButton>
                    </div>
                </div>
                {jobInputType === 'text' && <textarea value={jobDescriptionText} onChange={e => setJobDescriptionText(e.target.value)} placeholder={t('jobDescription.textPlaceholder')} className="w-full h-40 p-3 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition" />}
                {jobInputType === 'url' && <input type="url" value={jobDescriptionUrl} onChange={e => setJobDescriptionUrl(e.target.value)} placeholder={t('jobDescription.urlPlaceholder')} className="w-full p-3 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition" />}
                {jobInputType === 'file' && <input ref={jobDescriptionFileRef} type="file" onChange={e => setJobDescriptionFile(e.target.files ? e.target.files[0] : null)} accept=".pdf,.docx" className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700" />}
            </Card>

            <Card title={t('resume.title')} actions={
               <button onClick={handleClearResume} className="flex items-center gap-1.5 px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                  <ClearIcon />
                  {t('buttons.clear')}
                </button>}>
                <div className="border-b border-gray-200 dark:border-gray-600 mb-4">
                    <div className="flex -mb-px">
                        <InputTabButton active={resumeInputType === 'text'} onClick={() => setResumeInputType('text')}><FileTextIcon className="w-4 h-4" /> {t('resume.pasteText')}</InputTabButton>
                        <InputTabButton active={resumeInputType === 'file'} onClick={() => setResumeInputType('file')}><UploadIcon className="w-4 h-4" /> {t('resume.uploadFile')}</InputTabButton>
                    </div>
                </div>
                {resumeInputType === 'text' && <textarea value={resumeText} onChange={e => setResumeText(e.target.value)} placeholder={t('resume.textPlaceholder')} className="w-full h-40 p-3 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition" />}
                {resumeInputType === 'file' && <input ref={resumeFileRef} type="file" onChange={e => setResumeFile(e.target.files ? e.target.files[0] : null)} accept=".pdf,.docx" className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-cyan-600 file:text-white hover:file:bg-cyan-700" />}
            </Card>
            
            <button onClick={handleAnalyze} disabled={isAnalyzeDisabled} className="w-full bg-cyan-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-cyan-700 transition-transform transform active:scale-95 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-lg">
              {isLoading ? <><LoadingSpinner /> {t('buttons.analyzing')}</> : t('buttons.analyze')}
            </button>
          </div>
          
          <div className="lg:col-span-3 mt-8 lg:mt-0">
            <Card className="min-h-[600px]">
              {isLoading && <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400"><LoadingSpinner /><p className="mt-4">{t('analysis.loading')}</p></div>}
              {error && <div className="p-6"><div className="bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-200 px-4 py-3 rounded-lg"><p className="font-bold">{t('error.title')}</p><p>{error}</p></div></div>}
              {!isLoading && !error && !analysisResult && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400 p-6">
                      <InfoIcon className="w-12 h-12 mb-4 text-gray-400 dark:text-gray-500"/>
                      <h3 className="text-xl font-semibold mb-2">{t('analysis.placeholderTitle')}</h3>
                      <p className="max-w-sm">{t('analysis.placeholder')}</p>
                  </div>
              )}
              {analysisResult && (
                <>
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 flex-wrap">
                        <ResultTabButton active={activeResultTab === 'recruiter'} onClick={() => setActiveResultTab('recruiter')}>{t('tabs.recruiterAnalysis')}</ResultTabButton>
                        <ResultTabButton active={activeResultTab === 'decision'} onClick={() => setActiveResultTab('decision')} disabled={!preliminaryDecision && !isGeneratingDecision}>{t('tabs.preliminaryDecision')}</ResultTabButton>
                        <ResultTabButton active={activeResultTab === 'rewrite'} onClick={() => setActiveResultTab('rewrite')} disabled={!rewrittenResume && !isRewritingResume}>{t('tabs.rewrittenResume')}</ResultTabButton>
                        <ResultTabButton active={activeResultTab === 'consistency'} onClick={() => setActiveResultTab('consistency')} disabled={!consistencyResult && !isAnalyzingConsistency}>{t('tabs.consistencyAnalysis')}</ResultTabButton>
                    </div>
                  </div>
                  <div className="p-6">
                    {activeResultTab === 'recruiter' && (
                        <div>
                            <RecruiterAnalysisResultDisplay result={analysisResult} />
                            <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6 flex flex-col sm:flex-row gap-4">
                                <button onClick={handleGenerateDecision} disabled={isGeneratingDecision} className="flex-1 bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                                  {isGeneratingDecision ? <><LoadingSpinner /> {t('buttons.generatingDecision')}</> : t('buttons.generateDecision')}
                                </button>
                                <button onClick={handleRewriteResume} disabled={isRewritingResume} className="flex-1 bg-purple-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                                    {isRewritingResume ? <><LoadingSpinner /> {t('buttons.rewritingResume')}</> : t('buttons.rewriteResume')}
                                </button>
                            </div>
                             {decisionError && <div className="mt-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-200 px-4 py-3 rounded-lg"><p className="font-bold">{t('error.title')}</p><p>{decisionError}</p></div>}
                             {rewriteError && <div className="mt-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-200 px-4 py-3 rounded-lg"><p className="font-bold">{t('error.title')}</p><p>{rewriteError}</p></div>}
                        </div>
                    )}
                     {activeResultTab === 'decision' && preliminaryDecision && <PreliminaryDecisionDisplay result={preliminaryDecision} />}
                     {activeResultTab === 'rewrite' && rewrittenResume && <RewrittenResumeDisplay result={rewrittenResume} />}
                     {activeResultTab === 'consistency' && (
                        <div>
                            <Card className="!shadow-none !border-0 !p-0">
                                <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">{t('consistency.title')}</h3>
                                <textarea 
                                    value={interviewTranscript} 
                                    onChange={e => setInterviewTranscript(e.target.value)} 
                                    placeholder={t('consistency.placeholder')} 
                                    className="w-full h-32 p-3 bg-gray-100 dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition mb-4" 
                                />
                                <button 
                                    onClick={handleAnalyzeConsistency} 
                                    disabled={!interviewTranscript || isAnalyzingConsistency} 
                                    className="w-full bg-teal-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-teal-700 transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                                >
                                    {isAnalyzingConsistency ? <><LoadingSpinner /> {t('buttons.analyzingConsistency')}</> : t('buttons.analyzeConsistency')}
                                </button>
                                {isAnalyzingConsistency && <div className="flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 mt-4"><LoadingSpinner /><p className="mt-2">{t('consistency.loading')}</p></div>}
                                {consistencyError && <div className="mt-4 bg-red-100 border border-red-400 text-red-700 dark:bg-red-900/50 dark:border-red-500 dark:text-red-200 px-4 py-3 rounded-lg"><p className="font-bold">{t('error.title')}</p><p>{consistencyError}</p></div>}
                                {consistencyResult && <ConsistencyResultDisplay result={consistencyResult} />}
                             </Card>
                        </div>
                     )}
                  </div>
                </>
              )}
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
};

const getScoreColor = (score: number) => {
    if (score >= 80) return { text: 'text-green-500 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-500/20', border: 'border-green-500' };
    if (score >= 60) return { text: 'text-yellow-500 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-500/20', border: 'border-yellow-500' };
    return { text: 'text-red-500 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/20', border: 'border-red-500' };
};

const getHiringDecisionStyle = (decision: string) => {
    if (decision === 'Recommended for Hire' || decision === 'Recommended for Interview') {
        return 'bg-green-600 text-green-100';
    }
    return 'bg-red-600 text-red-100';
};

const ScoreBadge: React.FC<{ score: number }> = ({ score }) => {
    const { text, bg } = getScoreColor(score);
    return (
        <span className={`px-2.5 py-1 text-xs font-bold ${text} ${bg} rounded-full`}>
            {score}
        </span>
    );
};

const MatchStatusBadge: React.FC<{ status: MatchStatus }> = ({ status }) => {
    const { t } = useTranslations();
    const styles = {
        'Match': { bg: 'bg-green-100 dark:bg-green-500/20', text: 'text-green-700 dark:text-green-300' },
        'Partial': { bg: 'bg-yellow-100 dark:bg-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-300' },
        'No Match': { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-700 dark:text-red-400' },
    };
    const style = styles[status] || styles['Partial'];
    const statusKey = `status.${status.toLowerCase().replace(' ', '')}`;
    
    return (
        <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md ${style.bg} ${style.text}`}>
            {t(statusKey)}
        </span>
    );
};

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 inline-block flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
);

const XIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 inline-block flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
);

const formatRecruiterAnalysisForDownload = (result: RecruiterAnalysisResult, t: (key: string) => string): string => {
    let content = `${t('analysis.title')}: ${result.jobTitle}\n`;
    content += `==================================================\n\n`;
    content += `${t('analysis.overallFit')}: ${result.overallFitScore}%\n`;
    content += `--------------------------------------------------\n\n`;
    
    content += `[ ${t('analysis.summary')} ]\n${result.summary}\n\n`;
    content += `[ ${t('analysis.fitExplanation')} ]\n${result.fitExplanation}\n\n`;

    if (result.compatibilityGaps?.length > 0) {
        content += `[ ${t('analysis.compatibilityGaps')} ]\n`;
        result.compatibilityGaps.forEach(gap => content += `- ${gap}\n`);
        content += '\n';
    }
    
    const formatSection = (title: string, section: RecruiterAnalysisResult['keyResponsibilitiesMatch']) => {
        if (!section || !section.items || section.items.length === 0) return '';
        let sectionContent = `[ ${title} (Score: ${section.score}) ]\n`;
        section.items.forEach(item => {
            sectionContent += `- ${item.item} [${t(`status.${item.status.toLowerCase().replace(' ', '')}`)}]\n`;
            sectionContent += `  - ${t('decision.explanation')}: ${item.explanation}\n`;
        });
        return sectionContent + '\n';
    };

    content += formatSection(t('analysis.keyResponsibilities'), result.keyResponsibilitiesMatch);
    content += formatSection(t('analysis.requiredSkills'), result.requiredSkillsMatch);
    content += formatSection(t('analysis.niceToHaveSkills'), result.niceToHaveSkillsMatch);

    if (result.companyCultureFit) {
        content += `[ ${t('analysis.companyCulture')} (Score: ${result.companyCultureFit.score}) ]\n${result.companyCultureFit.analysis}\n\n`;
    }

    if (result.salaryAndBenefits) {
        content += `[ ${t('analysis.salaryAndBenefits')} ]\n${result.salaryAndBenefits}\n\n`;
    }

    if (result.redFlags?.length > 0) {
        content += `[ ${t('analysis.redFlags')} ]\n`;
        result.redFlags.forEach(flag => content += `- ${flag}\n`);
        content += '\n';
    }

    if (result.interviewQuestions?.length > 0) {
        content += `[ ${t('analysis.interviewQuestions')} ]\n`;
        result.interviewQuestions.forEach((q, i) => content += `${i + 1}. ${q}\n`);
        content += '\n';
    }

    return content;
};


const RecruiterAnalysisResultDisplay: React.FC<{ result: RecruiterAnalysisResult }> = ({ result }) => {
  const { t } = useTranslations();
  const [isHighlightingEnabled, setIsHighlightingEnabled] = useState(true);

  const scoreColors = getScoreColor(result.overallFitScore);

  // Memoize the keyword list for performance
  const keywords = useMemo(() => {
    const allKeywords = [
      ...(result.requiredSkillsMatch?.items.map(i => i.item) || []),
      ...(result.niceToHaveSkillsMatch?.items.map(i => i.item) || []),
    ];
    
    // Extract individual words from skill phrases, clean them up, and remove duplicates.
    const processedKeywords = allKeywords
      .flatMap(skill => skill.split(/[\s,./()]+/)) // Split by common delimiters
      .map(word => word.trim().replace(/[.,;:]$/, '')) // Trim and remove trailing punctuation
      .filter(word => word && word.length > 2); // Filter out empty strings and short words

    return [...new Set(processedKeywords)];
  }, [result.requiredSkillsMatch, result.niceToHaveSkillsMatch]);

  // Function to highlight keywords in a given text
  const highlightKeywords = (text: string | undefined) => {
    if (!isHighlightingEnabled || !text || !keywords.length) {
      return text;
    }

    // Escape special characters in keywords for safe regex creation
    const escapedKeywords = keywords.map(kw => kw.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
    const regex = new RegExp(`\\b(${escapedKeywords.join('|')})\\b`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, index) => {
          const isKeyword = keywords.some(kw => kw.toLowerCase() === part.toLowerCase());
          return isKeyword ? (
            <mark key={index} className="bg-yellow-300/70 dark:bg-yellow-400/80 text-gray-900 font-semibold px-1 py-0.5 rounded-sm">
              {part}
            </mark>
          ) : (
            <React.Fragment key={index}>{part}</React.Fragment>
          );
        })}
      </>
    );
  };

  const handleDownload = () => {
    const content = formatRecruiterAnalysisForDownload(result, t);
    const filename = `${result.jobTitle.replace(/[^a-z0-9]/gi, '_')}_Analysis.txt`;
    downloadFile(content, filename, 'text/plain;charset=utf-8');
  };

  return (
    <div className="space-y-6 text-gray-700 dark:text-gray-300">
      <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
        <div className="flex justify-between items-start">
            <h3 className="text-xl font-bold text-cyan-500 dark:text-cyan-400">{result.jobTitle}</h3>
            <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" title={t('buttons.download')}>
                <DownloadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{t('buttons.download')}</span>
            </button>
        </div>
        
        <div className="flex items-center justify-center mt-4 text-center">
            <div>
                 <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('analysis.overallFit')}</p>
                 <p className={`text-4xl font-bold ${scoreColors.text}`}>{result.overallFitScore}<span className="text-2xl">%</span></p>
            </div>
        </div>
         <div className="flex items-center justify-center mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
            <button
                onClick={() => setIsHighlightingEnabled(prev => !prev)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    isHighlightingEnabled
                    ? 'bg-yellow-400 text-gray-900 hover:bg-yellow-500'
                    : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500'
                }`}
            >
                {isHighlightingEnabled ? t('highlight.disable') : t('highlight.enable')}
            </button>
        </div>
      </div>
      
      <ResultSection title={t('analysis.summary')}>
        <p>{highlightKeywords(result.summary)}</p>
      </ResultSection>

      <ResultSection title={t('analysis.fitExplanation')}>
        <p>{highlightKeywords(result.fitExplanation)}</p>
      </ResultSection>

      {result.compatibilityGaps && result.compatibilityGaps.length > 0 && (
        <ResultSection title={t('analysis.compatibilityGaps')}>
            <ul className="list-disc list-inside space-y-1 text-yellow-600 dark:text-yellow-300">
                {result.compatibilityGaps?.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
        </ResultSection>
      )}

      <ResultSection title={t('analysis.keyResponsibilities')} score={result.keyResponsibilitiesMatch?.score}>
        <ul className="space-y-4">
          {result.keyResponsibilitiesMatch?.items.map((matchedItem, index) => (
            <li key={index} className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <MatchStatusBadge status={matchedItem.status} />
                <span className="font-semibold text-gray-800 dark:text-gray-200">{matchedItem.item}</span>
              </div>
              <p className="pl-4 text-sm text-gray-500 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-700 ml-2">{matchedItem.explanation}</p>
            </li>
          ))}
        </ul>
      </ResultSection>

      <ResultSection title={t('analysis.requiredSkills')} score={result.requiredSkillsMatch?.score}>
        <ul className="space-y-4">
          {result.requiredSkillsMatch?.items.map((matchedItem, index) => (
            <li key={index} className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <MatchStatusBadge status={matchedItem.status} />
                <span className="font-semibold text-gray-800 dark:text-gray-200">{matchedItem.item}</span>
              </div>
              <p className="pl-4 text-sm text-gray-500 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-700 ml-2">{matchedItem.explanation}</p>
            </li>
          ))}
        </ul>
      </ResultSection>

      {result.niceToHaveSkillsMatch?.items && result.niceToHaveSkillsMatch.items.length > 0 && (
        <ResultSection title={t('analysis.niceToHaveSkills')} score={result.niceToHaveSkillsMatch?.score}>
            <ul className="space-y-4">
              {result.niceToHaveSkillsMatch?.items.map((matchedItem, index) => (
                <li key={index} className="flex flex-col">
                  <div className="flex items-center gap-2 mb-1">
                    <MatchStatusBadge status={matchedItem.status} />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{matchedItem.item}</span>
                  </div>
                  <p className="pl-4 text-sm text-gray-500 dark:text-gray-400 border-l-2 border-gray-200 dark:border-gray-700 ml-2">{matchedItem.explanation}</p>
                </li>
              ))}
            </ul>
        </ResultSection>
      )}

      {result.redFlags && result.redFlags.length > 0 && (
          <ResultSection title={t('analysis.redFlags')}>
            <ul className="list-disc list-inside space-y-1 text-yellow-600 dark:text-yellow-300">
              {result.redFlags?.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </ResultSection>
      )}

      <ResultSection title={t('analysis.interviewQuestions')}>
        <ul className="list-decimal list-inside space-y-2">
          {result.interviewQuestions?.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      </ResultSection>
      
      {result.companyCultureFit?.analysis && (
          <ResultSection title={t('analysis.companyCulture')} score={result.companyCultureFit.score}>
            <p>{result.companyCultureFit.analysis}</p>
          </ResultSection>
      )}

      {result.salaryAndBenefits && (
          <ResultSection title={t('analysis.salaryAndBenefits')}>
            <p>{result.salaryAndBenefits}</p>
          </ResultSection>
      )}
    </div>
  );
};


const PreliminaryDecisionDisplay: React.FC<{ result: PreliminaryDecisionResult }> = ({ result }) => {
    const { t } = useTranslations();
    const isRecommended = result.decision === 'Recommended for Interview';
    return (
        <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg space-y-4">
            <ResultSection title={t('decision.title')}>
                <div className="text-center mb-4">
                    <span className={`px-4 py-2 text-base font-bold rounded-full ${getHiringDecisionStyle(result.decision)}`}>
                        {t(isRecommended ? 'decision.recommended' : 'decision.notRecommended')}
                    </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {result.pros && result.pros.length > 0 && (
                        <div>
                             <h5 className="font-semibold text-green-600 dark:text-green-400 mb-2">{t('decision.pros')}</h5>
                            <ul className="space-y-2">
                                {result.pros.map((item, index) => 
                                    <li key={index} className="flex items-start text-green-700 dark:text-green-300">
                                        <CheckIcon />
                                        <span>{item}</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                    {result.cons && result.cons.length > 0 && (
                        <div>
                             <h5 className="font-semibold text-red-600 dark:text-red-400 mb-2">{t('decision.cons')}</h5>
                            <ul className="space-y-2">
                                {result.cons.map((item, index) => 
                                    <li key={index} className="flex items-start text-red-700 dark:text-red-400">
                                        <XIcon />
                                        <span>{item}</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
                <div className="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                     <h5 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">{t('decision.explanation')}</h5>
                     <p className="text-gray-700 dark:text-gray-300">{result.explanation}</p>
                </div>
            </ResultSection>
        </div>
    );
};

const RewrittenResumeDisplay: React.FC<{ result: RewrittenResumeResult }> = ({ result }) => {
    const { t } = useTranslations();
    const handleDownload = () => {
        downloadFile(result.rewrittenResume, 'Rewritten-Resume.md', 'text/markdown;charset=utf-8');
    };
    return (
        <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-600 pb-2 mb-3">
                <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{t('rewrite.title')}</h4>
                <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" title={t('buttons.downloadResume')}>
                    <DownloadIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('buttons.downloadResume')}</span>
                </button>
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm bg-gray-100/50 dark:bg-gray-900/50 p-4 rounded-md border border-gray-200 dark:border-gray-600">
                {result.rewrittenResume}
            </pre>
        </div>
    );
};

const formatConsistencyAnalysisForDownload = (result: ConsistencyAnalysisResult, t: (key: string) => string): string => {
    let content = `${t('consistency.title')}\n`;
    content += `==================================================\n\n`;
    content += `${t('consistency.hiringDecision')}: ${result.hiringDecision}\n`;
    content += `${t('consistency.updatedOverallFit')}: ${result.updatedOverallFitScore}%\n`;
    content += `${t('consistency.consistencyScore')}: ${result.consistencyScore}%\n`;
    content += `${t('consistency.recommendation')}: ${result.recommendation}\n`;
    content += `--------------------------------------------------\n\n`;
    
    content += `[ ${t('consistency.summary')} ]\n${result.summary}\n\n`;

    const formatList = (title: string, items: string[] | undefined) => {
        if (!items || items.length === 0) return `[ ${title} ]\n${t('consistency.none')}\n\n`;
        let listContent = `[ ${title} ]\n`;
        items.forEach(item => listContent += `- ${item}\n`);
        return listContent + '\n';
    };
    
    content += formatList(t('consistency.prosForHiring'), result.prosForHiring);
    content += formatList(t('consistency.consForHiring'), result.consForHiring);
    
    if (result.gapResolutions && result.gapResolutions.items.length > 0) {
        content += `[ ${t('consistency.gapResolutions')} (Score: ${result.gapResolutions.score}) ]\n`;
        result.gapResolutions.items.forEach(item => {
            content += `- ${t('consistency.gapLabel')}: ${item.gap}\n`;
            content += `  - Resolução: ${item.resolution}\n`;
        });
        content += '\n';
    }

    content += `[ ${t('consistency.softSkillsAnalysis')} (Score: ${result.softSkillsAnalysis.score}) ]\n${result.softSkillsAnalysis.items}\n\n`;
    
    content += formatList(t('consistency.inconsistencies'), result.inconsistencies?.items);
    content += formatList(t('consistency.missingFromInterview'), result.missingFromInterview?.items);
    content += formatList(t('consistency.newInInterview'), result.newInInterview?.items);

    return content;
};


const ConsistencyResultDisplay: React.FC<{ result: ConsistencyAnalysisResult }> = ({ result }) => {
    const { t } = useTranslations();
    const {text: consistencyScoreColor} = getScoreColor(result.consistencyScore);
    const {text: updatedFitScoreColor} = getScoreColor(result.updatedOverallFitScore);

    const getRecommendationStyle = (recommendation: string) => {
        switch (recommendation) {
            case 'Strong Fit': return 'bg-green-600 text-green-100';
            case 'Partial Fit': return 'bg-yellow-600 text-yellow-100';
            case 'Weak Fit': return 'bg-red-600 text-red-100';
            default: return 'bg-gray-600 text-gray-100';
        }
    };

    const handleDownload = () => {
        const content = formatConsistencyAnalysisForDownload(result, t);
        downloadFile(content, 'Consistency-Analysis-Report.txt', 'text/plain;charset=utf-8');
    };
    
    return (
        <div className="space-y-6 text-gray-700 dark:text-gray-300 mt-4">
             <div className="p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg space-y-4">
                <div className="flex justify-end -mt-2 -mr-2 mb-2">
                     <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors" title={t('buttons.download')}>
                        <DownloadIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">{t('buttons.download')}</span>
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('consistency.updatedOverallFit')}</p>
                        <p className={`text-3xl font-bold ${updatedFitScoreColor}`}>{result.updatedOverallFitScore}<span className="text-xl">%</span></p>
                    </div>
                     <div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('consistency.hiringDecision')}</p>
                        <span className={`px-4 py-2 text-base font-bold rounded-full ${getHiringDecisionStyle(result.hiringDecision)}`}>
                            {t(result.hiringDecision === 'Recommended for Hire' ? 'consistency.recommended' : 'consistency.notRecommended')}
                        </span>
                    </div>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-4 flex justify-between items-center text-sm">
                    <div className="flex items-baseline gap-2">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">{t('consistency.consistencyScore')}:</p>
                        <p className={`font-bold ${consistencyScoreColor}`}>{result.consistencyScore}%</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <p className="font-semibold text-gray-800 dark:text-gray-200">{t('consistency.recommendation')}:</p>
                         <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${getRecommendationStyle(result.recommendation)}`}>
                            {result.recommendation}
                        </span>
                    </div>
                </div>
            </div>

            <ResultSection title={t('consistency.summary')}>
                <p>{result.summary}</p>
            </ResultSection>

            {result.gapResolutions && result.gapResolutions.items.length > 0 && (
                <ResultSection title={t('consistency.gapResolutions')} score={result.gapResolutions.score}>
                    <ul className="space-y-4">
                        {result.gapResolutions.items.map((item, index) => (
                            <li key={index} className="p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg">
                                <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-300 mb-2">{t('consistency.gapLabel')}: <span className="font-normal">{item.gap}</span></p>
                                <p className={`text-sm pl-3 border-l-2 ${
                                    item.isResolved
                                    ? 'text-green-700 dark:text-green-300 border-green-400 dark:border-green-500'
                                    : 'text-red-700 dark:text-red-400 border-red-400 dark:border-red-500'
                                }`}>
                                    {item.resolution}
                                </p>
                            </li>
                        ))}
                    </ul>
                </ResultSection>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 {result.prosForHiring && result.prosForHiring.length > 0 && (
                    <ResultSection title={t('consistency.prosForHiring')}>
                        <ul className="space-y-2">
                            {result.prosForHiring.map((item, index) => 
                                <li key={index} className="flex items-start text-green-700 dark:text-green-300">
                                    <CheckIcon />
                                    <span>{item}</span>
                                </li>
                            )}
                        </ul>
                    </ResultSection>
                )}

                {result.consForHiring && result.consForHiring.length > 0 && (
                    <ResultSection title={t('consistency.consForHiring')}>
                        <ul className="space-y-2">
                            {result.consForHiring.map((item, index) => 
                                <li key={index} className="flex items-start text-red-700 dark:text-red-400">
                                    <XIcon />
                                    <span>{item}</span>
                                </li>
                            )}
                        </ul>
                    </ResultSection>
                )}
            </div>

            <ResultSection title={t('consistency.softSkillsAnalysis')} score={result.softSkillsAnalysis.score}>
                <p>{result.softSkillsAnalysis.items}</p>
            </ResultSection>
            
            {result.inconsistencies && result.inconsistencies.items.length > 0 && (
                <ResultSection title={t('consistency.inconsistencies')} score={result.inconsistencies.score}>
                    <ul className="list-disc list-inside space-y-1 text-red-700 dark:text-red-400">
                        {result.inconsistencies.items.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                </ResultSection>
            )}

            <ResultSection title={t('consistency.missingFromInterview')} score={result.missingFromInterview.score}>
                {result.missingFromInterview?.items.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-yellow-600 dark:text-yellow-300">
                        {result.missingFromInterview?.items.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400">{t('consistency.none')}</p>
                )}
            </ResultSection>

            <ResultSection title={t('consistency.newInInterview')} score={result.newInInterview.score}>
                 {result.newInInterview?.items.length > 0 ? (
                    <ul className="list-disc list-inside space-y-1 text-green-600 dark:text-green-400">
                        {result.newInInterview?.items.map((item, index) => <li key={index}>{item}</li>)}
                    </ul>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400">{t('consistency.none')}</p>
                )}
            </ResultSection>
        </div>
    );
};


const ResultSection: React.FC<{title: string; score?: number; children: React.ReactNode}> = ({ title, score, children }) => (
    <div>
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-600 pb-2 mb-3">
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-100">{title}</h4>
            {score !== undefined && <ScoreBadge score={score} />}
        </div>
        {children}
    </div>
);


export default App;
