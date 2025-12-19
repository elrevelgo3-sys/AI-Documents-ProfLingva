
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Table as TableIcon, Copy, Loader2, CheckCircle2, AlertCircle, Trash2, ArrowRight, ClipboardCopy } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { extractTableFromImage, TableExtractionResult } from '../services/geminiService';
// import { downloadDocx } from '../utils/docxGenerator'; // Disabled
import { ElementType, StructuredDocument } from '../types';

interface TableJob {
  id: string;
  file: File;
  previewUrl: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  result: TableExtractionResult | null;
  message: string;
  isCopied?: boolean;
}

const TableAnalyzer: React.FC = () => {
  const [jobs, setJobs] = useState<TableJob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  const processJob = useCallback(async (job: TableJob) => {
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing', message: t('extracting') } : j));
    try {
      const result = await extractTableFromImage(job.file);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed', result, message: t('tableReady') } : j));
    } catch (e) {
      console.error(e);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', message: 'Failed to recognize table' } : j));
    }
  }, [t]);

  const addFiles = useCallback((files: FileList | null | File[]) => {
    if (!files) return;
    const fileArray = files instanceof FileList ? Array.from(files) : files;
    
    const newJobs: TableJob[] = fileArray.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: 'idle',
      result: null,
      message: ''
    }));

    setJobs(prev => [...newJobs, ...prev]); 
    newJobs.forEach(job => processJob(job));
  }, [processJob]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) imageFiles.push(blob);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        addFiles(imageFiles);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addFiles]);

  const removeJob = (id: string) => {
    setJobs(prev => {
        const job = prev.find(j => j.id === id);
        if (job) URL.revokeObjectURL(job.previewUrl);
        return prev.filter(j => j.id !== id);
    });
  };

  const copyTableToClipboard = async (id: string, result: TableExtractionResult) => {
      if (!result) return;
      try {
          // MAGIC SAUCE FOR WORD:
          // 1. Add XML Namespaces for Office
          // 2. Wrap in specific html/head/body tags
          // 3. Use 'windowtext' for borders which maps to Word's default border color
          const wordHtmlWrapper = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <style>
                    table { border-collapse: collapse; width: 100%; mso-border-alt: solid windowtext .5pt; }
                    td, th { border: 1px solid windowtext; padding: 5px; mso-border-alt: solid windowtext .5pt; }
                </style>
            </head>
            <body>
                <!--StartFragment-->
                ${result.html}
                <!--EndFragment-->
            </body>
            </html>
          `;

          const blob = new Blob([wordHtmlWrapper], { type: 'text/html' });
          
          await navigator.clipboard.write([
              new ClipboardItem({ 
                  'text/html': blob
              })
          ]);

          setJobs(prev => prev.map(j => j.id === id ? { ...j, isCopied: true } : j));
          setTimeout(() => {
            setJobs(prev => prev.map(j => j.id === id ? { ...j, isCopied: false } : j));
          }, 2000);
      } catch (err) {
          console.error("Clipboard write failed", err);
          alert("Click 'Allow' to copy to clipboard.");
      }
  };

  return (
    <div className="max-w-7xl mx-auto pb-20">
       <header className="mb-8 flex items-center gap-4">
            <div className="p-3 bg-brand-500 text-white rounded-xl shadow-lg shadow-brand-500/30">
                <TableIcon size={28} strokeWidth={2} />
            </div>
            <div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('tableAnalyzerTitle')}</h2>
                <p className="text-sm text-slate-500 font-medium">{t('tableAnalyzerSubtitle')}</p>
            </div>
       </header>

       <div 
          onClick={() => fileInputRef.current?.click()}
          className="group border-2 border-dashed border-slate-300 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-brand-500 hover:bg-brand-50/10 transition cursor-pointer bg-white mb-8 relative overflow-hidden"
        >
          <div className="p-3 bg-slate-50 text-slate-400 group-hover:text-brand-500 group-hover:bg-brand-50 rounded-full mb-2 z-10 transition-colors">
             <ClipboardCopy size={20} />
          </div>
          <h3 className="font-bold text-slate-900 z-10">{t('uploadTables')}</h3>
          <input type="file" multiple accept="image/*" className="hidden" ref={fileInputRef} onChange={e => addFiles(e.target.files)} />
        </div>

        <div className="space-y-8">
           {jobs.map(job => (
             <div key={job.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col lg:flex-row h-auto min-h-[400px]">
                
                {/* Source Image */}
                <div className="w-full lg:w-1/3 bg-slate-100 relative group border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col">
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur z-10">
                        SOURCE
                    </div>
                    <div className="flex-1 p-4 flex items-center justify-center overflow-hidden">
                        <img src={job.previewUrl} className="max-w-full max-h-[500px] object-contain shadow-lg rounded-sm" alt="Source" />
                    </div>
                    <button 
                        onClick={() => removeJob(job.id)}
                        className="absolute top-2 right-2 p-1.5 bg-white/80 hover:bg-red-500 hover:text-white text-slate-500 rounded-full transition shadow-sm z-10"
                    >
                        <Trash2 size={14} />
                    </button>

                    {job.status === 'processing' && (
                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm z-20">
                            <div className="text-center">
                                <Loader2 size={32} className="animate-spin text-brand-500 mx-auto mb-2" />
                                <span className="text-xs font-bold text-slate-600">{t('extracting')}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="hidden lg:flex items-center justify-center w-12 bg-slate-50 border-r border-slate-200">
                    <ArrowRight size={20} className="text-slate-300" />
                </div>

                {/* Result Area */}
                <div className="flex-1 p-6 flex flex-col bg-slate-50/30">
                    <div className="flex justify-between items-center mb-4">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Reconstructed Table Preview
                        </div>
                        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1
                            ${job.status === 'completed' ? 'bg-green-100 text-green-700' : 
                              job.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                             {job.status === 'completed' && <CheckCircle2 size={12} />}
                             {job.message}
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="flex-1 overflow-auto border border-slate-300 bg-white shadow-sm p-8 min-h-[300px] rounded-sm custom-scrollbar relative">
                        {job.result ? (
                            <div 
                                className="
                                    font-serif text-black text-sm
                                    [&_table]:w-full [&_table]:border-collapse
                                    [&_td]:border [&_td]:border-black [&_td]:p-1 [&_td]:align-top
                                    [&_th]:border [&_th]:border-black [&_th]:p-1 [&_th]:bg-gray-100 [&_th]:font-bold
                                "
                                dangerouslySetInnerHTML={{ __html: job.result.html }} 
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                                {job.status === 'error' ? 'Failed to extract' : 'Waiting...'}
                            </div>
                        )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-200 flex justify-end gap-3">
                        {/* Download button removed due to generator issues */}
                        <button 
                            onClick={() => job.result && copyTableToClipboard(job.id, job.result)}
                            disabled={!job.result}
                            className={`
                                flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm shadow-md transition-all
                                ${job.isCopied 
                                    ? 'bg-green-600 text-white' 
                                    : 'bg-brand-600 text-white hover:bg-brand-700 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100'}
                            `}
                        >
                            {job.isCopied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                            {job.isCopied ? t('tableCopied') : t('copyTable')}
                        </button>
                    </div>
                </div>
             </div>
           ))}
        </div>
    </div>
  );
};

export default TableAnalyzer;
