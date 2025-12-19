
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileDown, Loader2, FileType, CheckCircle2, Play, Trash2, ScanLine, Eye, X } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { analyzeBatch } from '../services/geminiService';
import { downloadDocx, PageResult } from '../utils/docxGenerator';
import ComparisonPreview from './ComparisonPreview';
import { useLanguage } from '../contexts/LanguageContext';

// Set worker source to match package.json version 5.4.449
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

interface ProcessJob {
  id: string;
  file: File;
  previewUrl: string | null;
  status: 'idle' | 'loading_pdf' | 'analyzing' | 'completed' | 'error';
  progress: string;
  results: PageResult[];
  pagesBlob: Blob[];
  error?: string;
}

interface DocAnalyzerProps {
  onProcessingComplete?: () => void;
}

const DocAnalyzer: React.FC<DocAnalyzerProps> = ({ onProcessingComplete }) => {
  const [jobs, setJobs] = useState<ProcessJob[]>([]);
  const [globalProcessing, setGlobalProcessing] = useState(false);
  const [previewJob, setPreviewJob] = useState<ProcessJob | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  useEffect(() => {
    if (!globalProcessing) return;
    const isStillWorking = jobs.some(j => j.status === 'loading_pdf' || j.status === 'analyzing');
    
    if (!isStillWorking) {
      setGlobalProcessing(false);
      if (onProcessingComplete) {
        onProcessingComplete();
      }
    }
  }, [jobs, globalProcessing, onProcessingComplete]);

  // Cleanup function to revoke URLs when component unmounts to free memory
  useEffect(() => {
    return () => {
      jobs.forEach(job => {
        if (job.previewUrl) {
          URL.revokeObjectURL(job.previewUrl);
        }
      });
    };
  }, []); 

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const newJobs: ProcessJob[] = [];
    const currentCount = jobs.length;
    const maxFiles = 5;

    for (let i = 0; i < files.length; i++) {
      if (currentCount + i >= maxFiles) {
        alert(`Batch limit reached: ${maxFiles} files maximum.`);
        break;
      }
      const file = files[i];
      let preview = null;
      if (file.type.startsWith('image/')) {
        preview = URL.createObjectURL(file);
      }

      newJobs.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        previewUrl: preview,
        status: 'idle',
        progress: t('statusIdle'),
        results: [],
        pagesBlob: []
      });
    }
    setJobs(prev => [...prev, ...newJobs]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeJob = (id: string) => {
    setJobs(prev => {
      const jobToRemove = prev.find(j => j.id === id);
      if (jobToRemove && jobToRemove.previewUrl) {
        URL.revokeObjectURL(jobToRemove.previewUrl);
      }
      return prev.filter(j => j.id !== id);
    });
  };

  const convertPdfToImages = async (pdfFile: File, updateProgress: (msg: string) => void): Promise<Blob[]> => {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageBlobs: Blob[] = [];
    const totalPages = pdf.numPages;
    // UPDATED: Increased limit to 100 pages per document as requested
    const MAX_PAGES = 100; 

    for (let i = 1; i <= Math.min(totalPages, MAX_PAGES); i++) {
      updateProgress(`Rasterizing vector page ${i} / ${Math.min(totalPages, MAX_PAGES)}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 }); 
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        // Cast to any to avoid type mismatch in some pdfjs-dist versions
        await page.render({ canvasContext: context, viewport: viewport } as any).promise;
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
        if (blob) pageBlobs.push(blob);
      }
      canvas.width = 0;
      canvas.height = 0;
    }
    return pageBlobs;
  };

  const processJob = async (jobId: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'loading_pdf', progress: t('statusInitializing') } : j));
    
    const getJob = () => jobs.find(j => j.id === jobId);
    let currentJob = jobs.find(j => j.id === jobId);
    if (!currentJob) return;

    try {
      let pages: Blob[] = [];
      if (currentJob.file.type === 'application/pdf') {
        pages = await convertPdfToImages(currentJob.file, (msg) => {
            setJobs(prev => prev.map(j => j.id === jobId ? { ...j, progress: msg } : j));
        });
        if (pages.length > 0 && !currentJob.previewUrl) {
             const url = URL.createObjectURL(pages[0]);
             setJobs(prev => prev.map(j => j.id === jobId ? { ...j, previewUrl: url } : j));
        }
      } else {
        pages = [currentJob.file];
      }

      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'analyzing', pagesBlob: pages } : j));

      // BATCH CONFIGURATION
      const BATCH_SIZE = 3; // Processing 3 pages per request to save system prompts while avoiding output token limits
      const CONCURRENCY_LIMIT = 2; // Run 2 batches in parallel
      
      const totalPages = pages.length;
      let processedCount = 0;
      const finalResults: PageResult[] = [];

      // Create chunks
      const chunks: { blobs: Blob[], startIndex: number }[] = [];
      for (let i = 0; i < pages.length; i += BATCH_SIZE) {
          chunks.push({
              blobs: pages.slice(i, i + BATCH_SIZE),
              startIndex: i
          });
      }

      const processBatchChunk = async (chunk: { blobs: Blob[], startIndex: number }): Promise<void> => {
         try {
            // Send batch to AI
            const documents = await analyzeBatch(chunk.blobs);
            
            // Map results back to PageResult objects
            documents.forEach((doc, idx) => {
                finalResults.push({
                    data: doc,
                    source: chunk.blobs[idx],
                    pageNumber: chunk.startIndex + idx + 1
                });
            });

            processedCount += chunk.blobs.length;
            setJobs(prev => prev.map(j => j.id === jobId ? { 
                ...j, 
                progress: `${t('statusAnalyzing')} ${Math.min(100, Math.round((processedCount / totalPages) * 100))}%` 
            } : j));

         } catch (e) {
            console.error(`Batch starting at ${chunk.startIndex} failed`, e);
            // On failure, we try to allow partial success or just log it. 
            // In a pro app, we might retry individual pages here.
         }
      };

      // Execute batches with concurrency limit
      const active = new Set<Promise<void>>();
      for (const chunk of chunks) {
          const promise = processBatchChunk(chunk);
          active.add(promise);
          promise.then(() => active.delete(promise));
          
          if (active.size >= CONCURRENCY_LIMIT) {
              await Promise.race(active);
          }
      }
      await Promise.all(active);
      
      const sortedResults = finalResults.sort((a,b) => a.pageNumber - b.pageNumber);
      
      setJobs(prev => prev.map(j => j.id === jobId ? { 
          ...j, 
          status: 'completed', 
          progress: t('statusReady'), 
          results: sortedResults 
      } : j));

    } catch (err) {
      setJobs(prev => prev.map(j => j.id === jobId ? { 
          ...j, 
          status: 'error', 
          progress: t('statusFailed'), 
          error: err instanceof Error ? err.message : "Unknown error" 
      } : j));
    }
  };

  const handleProcessAll = async () => {
    setGlobalProcessing(true);
    const idleJobs = jobs.filter(j => j.status === 'idle' || j.status === 'error');
    // PARALLEL EXECUTION: Run all jobs simultaneously
    await Promise.all(idleJobs.map(job => processJob(job.id)));
  };

  const handleDownload = (job: ProcessJob) => {
    if (job.results.length > 0) {
      downloadDocx(job.results, job.file.name);
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24 relative">
      <header className="mb-10 flex justify-between items-end">
        <div className="flex items-center gap-3">
           <div className="p-3 bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-500/30">
              <ScanLine size={28} strokeWidth={2} />
           </div>
           <div>
             <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('smartCoreTitle')}</h2>
             <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded">{t('enterpriseEdition')}</span>
                <span className="text-slate-400 text-sm">|</span>
                <p className="text-sm text-slate-500 font-medium">{t('autoOcr')}</p>
             </div>
           </div>
        </div>
      </header>

      {/* Preview Modal */}
      {previewJob && previewJob.previewUrl && previewJob.results.length > 0 && (
          <ComparisonPreview 
             originalImage={previewJob.previewUrl} 
             data={previewJob.results[0].data} 
             fileName={previewJob.file.name}
             onClose={() => setPreviewJob(null)} 
          />
      )}

      {jobs.length < 5 && (
        <div 
          onClick={() => fileInputRef.current?.click()}
          className="group relative mb-8 border-2 border-dashed border-slate-300 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-brand-500 hover:bg-brand-50/30 transition-all duration-300 cursor-pointer bg-white"
        >
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-[radial-gradient(#e31e24_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]"></div>
          
          <div className="p-5 bg-slate-50 rounded-full mb-4 group-hover:scale-110 group-hover:bg-white group-hover:shadow-xl group-hover:shadow-brand-500/10 transition-all duration-300 z-10">
            <Upload className="w-8 h-8 text-slate-400 group-hover:text-brand-600" strokeWidth={2} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 z-10">{t('secureUpload')}</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto z-10">
            {t('dragDrop')}
            <span className="block text-xs text-slate-400 mt-2">{t('maxBatch')}</span>
          </p>
        </div>
      )}

      <input 
        type="file" 
        multiple
        ref={fileInputRef} 
        onChange={(e) => addFiles(e.target.files)} 
        accept="image/png, image/jpeg, image/jpg, application/pdf" 
        className="hidden" 
      />

      <div className="space-y-4">
        {jobs.map((job) => (
          <div key={job.id} className="relative bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row items-center gap-6 transition-all hover:shadow-lg hover:border-brand-200 group">
            
            {/* Dismiss Button for Completed Jobs */}
            {job.status === 'completed' && (
               <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    removeJob(job.id);
                  }}
                  className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all z-10"
                  title={t('dismiss')}
               >
                  <X size={18} />
               </button>
            )}

            {/* Thumbnail */}
            <div className="w-16 h-20 bg-slate-100 rounded-lg shrink-0 overflow-hidden border border-slate-200 relative flex items-center justify-center group-hover:border-brand-300 transition-colors">
               {job.previewUrl ? (
                 <img src={job.previewUrl} alt="Preview" className="w-full h-full object-cover opacity-90" />
               ) : (
                 <FileType className="text-slate-300" />
               )}
               {job.status === 'completed' && (
                 <div className="absolute inset-0 bg-green-500/20 backdrop-blur-[1px] flex items-center justify-center">
                   <CheckCircle2 className="text-white drop-shadow-md" size={24} />
                 </div>
               )}
            </div>

            {/* Info */}
            <div className="flex-1 w-full">
               <div className="flex justify-between items-start mb-3">
                 <div>
                    <h4 className="font-bold text-slate-900 truncate max-w-[300px] text-sm leading-tight">{job.file.name}</h4>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{(job.file.size / 1024 / 1024).toFixed(2)} MB • {job.file.type.split('/')[1].toUpperCase()}</p>
                 </div>
                 <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border 
                      ${job.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : 
                        job.status === 'error' ? 'bg-red-50 text-red-700 border-red-200' :
                        job.status === 'idle' ? 'bg-slate-50 text-slate-600 border-slate-200' : 
                        'bg-brand-50 text-brand-700 border-brand-200'}`}>
                      {job.progress}
                    </span>
                 </div>
               </div>

               {(job.status === 'loading_pdf' || job.status === 'analyzing') && (
                 <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-brand-500 h-full rounded-full animate-[loading_1s_ease-in-out_infinite] w-full origin-left"></div>
                 </div>
               )}
               
               {job.status === 'error' && (
                 <p className="text-xs text-red-600 mt-1 flex items-center gap-1 font-medium">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block"></span>
                    {job.error}
                 </p>
               )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {job.status === 'completed' ? (
                 <>
                    <button 
                       onClick={() => setPreviewJob(job)}
                       className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-200 flex items-center gap-2 transition"
                    >
                       <Eye size={16} /> {t('preview')}
                    </button>
                    <button 
                       onClick={() => handleDownload(job)}
                       className="px-5 py-2.5 bg-brand-900 text-white rounded-lg text-sm font-bold hover:bg-black shadow-lg shadow-slate-900/20 flex items-center gap-2 transition-all hover:-translate-y-0.5"
                    >
                       <FileDown size={16} /> {t('export')}
                    </button>
                 </>
              ) : (job.status === 'idle' || job.status === 'error') ? (
                 <button 
                   onClick={() => removeJob(job.id)}
                   className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition"
                   title={t('dismiss')}
                 >
                   <Trash2 size={18} />
                 </button>
              ) : null}
            </div>
          </div>
        ))}

        {jobs.length === 0 && (
          <div className="text-center py-16">
             <p className="text-sm text-slate-400 font-medium">{t('systemIdle')}</p>
          </div>
        )}
      </div>

      {jobs.length > 0 && jobs.some(j => j.status === 'idle' || j.status === 'error') && (
        <div className="fixed bottom-8 left-1/2 md:left-auto md:right-10 z-20 -translate-x-1/2 md:translate-x-0">
          <button
            onClick={handleProcessAll}
            disabled={globalProcessing}
            className="px-8 py-4 bg-brand-600 text-white rounded-full font-bold shadow-[0_8px_30px_rgb(227,30,36,0.4)] hover:bg-brand-500 hover:scale-105 transition-all duration-300 flex items-center gap-3 disabled:opacity-70 disabled:scale-100 border-4 border-white/20 backdrop-blur-sm"
          >
            {globalProcessing ? <Loader2 className="animate-spin" /> : <Play fill="currentColor" />}
            {globalProcessing ? t('processingQueue') : t('initiateBatch')}
          </button>
        </div>
      )}
    </div>
  );
};

export default DocAnalyzer;
