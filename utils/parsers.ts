// @ts-nocheck
// This file uses globally available libraries that will be loaded dynamically,
// so we declare them here to satisfy TypeScript.
declare const mammoth: any;
declare const Readability: any;

// Helper to load a script dynamically and return a promise
const loadedScripts: { [src: string]: Promise<void> } = {};
const loadScript = (src: string): Promise<void> => {
    if (!loadedScripts[src]) {
        loadedScripts[src] = new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve();
            script.onerror = () => {
                delete loadedScripts[src]; // Allow retrying
                reject(new Error(`Failed to load script: ${src}`));
            };
            document.head.appendChild(script);
        });
    }
    return loadedScripts[src];
};

const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

export const parseDocumentFile = async (file: File): Promise<{ content: string | { data: string; mimeType: string }, format: 'text' | 'file' }> => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'pdf') {
        const base64Data = await fileToBase64(file);
        return {
            content: {
                data: base64Data,
                mimeType: file.type || 'application/pdf',
            },
            format: 'file',
        };
    } else if (fileExtension === 'docx') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return {
            content: result.value,
            format: 'text',
        };
    } else {
        throw new Error('Unsupported file format. Please use PDF or DOCX.');
    }
};

export const parseUrlContent = async (url: string): Promise<string> => {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch from URL with status: ${response.status}`);
    }

    const data = await response.json();
    const htmlContent = data.contents;
    
    if (!htmlContent) {
        throw new Error('Could not retrieve content from the URL.');
    }

    const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
    const article = new Readability(doc).parse();

    if (!article || !article.textContent) {
        throw new Error('Could not extract main content using Readability.');
    }

    // Start of cleanup logic
    let cleanedText = article.textContent;

    // 1. Normalize whitespace and newlines
    cleanedText = cleanedText
        .replace(/\t/g, ' ') // Replace tabs with spaces
        .replace(/ +/g, ' ') // Collapse multiple spaces into one
        .replace(/\n{3,}/g, '\n\n'); // Collapse 3+ newlines into 2

    // 2. Filter out common boilerplate lines
    const lines = cleanedText.split('\n');
    const cleanedLines: string[] = [];
    const boilerplatePatterns = [
        'share this job', 'apply now', 'report this job', 'similar jobs',
        'privacy policy', 'terms of service', 'cookie settings', 'all rights reserved',
        'back to top', 'view all jobs', 'powered by', 'log in', 'sign up',
        /©\s*\d{4}/i, // Copyright symbol + year
        /^voltar$/, // "Back" in portuguese
        /^compartilhar vaga$/ // "Share job" in portuguese
    ];

    const boilerplateRegex = new RegExp(boilerplatePatterns.map(p => typeof p === 'string' ? p.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : p.source).join('|'), 'i');

    for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Skip empty lines, short lines (likely noise), and lines matching boilerplate
        if (trimmedLine === '' || trimmedLine.length < 5 || boilerplateRegex.test(trimmedLine)) {
            continue;
        }

        cleanedLines.push(trimmedLine);
    }

    // 3. Reassemble the text and return
    return cleanedLines.join('\n').trim();
};

export const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};