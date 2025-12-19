
import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Zap, Loader2, CheckCircle2, AlertCircle, X, Trash2, Settings2, Globe2, ScanLine } from 'lucide-react';
import { convertPdfToDocx, OCR_LANGUAGES } from '../services/convertApiService';
import { useLanguage } from '../contexts/LanguageContext';

interface Job {
  id: string;
  file: File;
  status: 'idle' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  message: string;
}

const NativePdfConverter: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isScanMode, setIsScanMode] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('english');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();

  // Check for key in Env vars (Build time / Vercel Env)
  const hasApiKey = !!process.env.CONVERT_API_SECRET;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newJobs: Job[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'idle',
      progress: 0,
      message: t('statusIdle')
    }));
    setJobs(prev => [...prev, ...newJobs]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeJob = (id: string) => {
    setJobs(prev => prev.filter(j => j.id !== id));
  };

  const processJob = async (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'uploading', message: t('uploading'), progress: 10 } : j));

    try {
      await convertPdfToDocx(job.file, {
        enableOcr: isScanMode,
        language: selectedLanguage,
        onProgress: (p) => {
            // Map 0-100 upload progress to 0-50 total progress
            // After upload (50%), we simulate processing progress until completion
            setJobs(prev => prev.map(j => j.id === id ? { 
                ...j, 
                progress: p,
                status: p < 50 ? 'uploading' : 'processing',
                message: p < 50 ? t('uploading') : t('convertingCloud')
            } : j));
        }
      });
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'completed', message: t('downloaded'), progress: 100 } : j));
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Unknown Error';
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'error', message: errMsg } : j));
    }
  };

  const processAll = async () => {
    const idle = jobs.filter(j => j.status === 'idle');
    const chunks = [];
    for (let i = 0; i < idle.length; i += 3) {
        chunks.push(idle.slice(i, i + 3));
    }

    for (const chunk of chunks) {
        await Promise.all(chunk.map(j => processJob(j.id)));
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
       <header className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
           <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-400 text-white rounded-xl shadow-lg shadow-amber-400/30">
                    <Zap size={28} strokeWidth={2} fill="currentColor" />
                </div>
                <div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('convertApiTitle')}</h2>
                    <p className="text-sm text-slate-500 font-medium">{t('convertApiDesc')}</p>
                </div>
           </div>

           {/* Configuration Panel */}
           <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-3 md:min-w-[320px]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                        <ScanLine size={16} />
                        <span>{t('ocrMode')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" checked={isScanMode} onChange={e => setIsScanMode(e.target.checked)} className="sr-only peer" />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-100 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                </div>

                {isScanMode && (
                    <div className="pt-3 border-t border-slate-100 animate-[fadeIn_0.3s_ease-out]">
                        <div className="flex items-center gap-2 text-slate-500 text-xs font-bold uppercase tracking-wider mb-1.5">
                            <Globe2 size={12} />
                            {t('docLanguage')}
                        </div>
                        <select 
                            value={selectedLanguage}
                            onChange={(e) => setSelectedLanguage(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-amber-500 focus:border-amber-500 block p-2"
                        >
                            {OCR_LANGUAGES.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.name}</option>
                            ))}
                        </select>
                    </div>
                )}
           </div>
       </header>

       {!hasApiKey && (
         <div className="mb-6 bg-red-50 border border-red-200 p-4 rounded-xl flex items-start gap-3">
            <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
            <div>
                <h4 className="font-bold text-red-800 text-sm">{t('missingKeyTitle')}</h4>
                <p className="text-red-600 text-xs mt-1">
                    {t('missingKeyDesc')}
                </p>
            </div>
         </div>
       )}

       <div 
          onClick={() => fileInputRef.current?.click()}
          className="group border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:border-amber-400 hover:bg-amber-50/30 transition cursor-pointer bg-white mb-8 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(#f59e0b_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"></div>
          <div className="p-4 bg-amber-50 text-amber-500 rounded-full mb-3 z-10 group-hover:scale-110 transition-transform">
             <Upload size={24} />
          </div>
          <h3 className="font-bold text-slate-900 z-10">{t('uploadPdf')}</h3>
          <p className="text-xs text-slate-400 mt-1 z-10">{t('supportsNative')}</p>
          <input type="file" multiple accept=".pdf" className="hidden" ref={fileInputRef} onChange={e => handleFiles(e.target.files)} />
        </div>

        <div className="space-y-3">
           {jobs.map(job => (
             <div key={job.id} className="relative bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm group overflow-hidden">
                {/* Progress Bar Background */}
                {(job.status === 'uploading' || job.status === 'processing') && (
                    <div className="absolute bottom-0 left-0 h-1 bg-amber-100 w-full">
                        <div 
                            className="h-full bg-amber-500 transition-all duration-300"
                            style={{ width: `${job.progress}%` }}
                        ></div>
                    </div>
                )}

                {/* Dismiss Button */}
                {job.status === 'completed' && (
                  <button 
                      onClick={() => removeJob(job.id)}
                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all z-10"
                  >
                      <X size={16} />
                  </button>
                )}

                <div className="flex items-center gap-4 z-10">
                   <div className={`p-2.5 rounded-lg text-white shadow-md transition-colors ${
                       job.status === 'error' ? 'bg-red-500 shadow-red-500/20' : 
                       job.status === 'completed' ? 'bg-green-500 shadow-green-500/20' : 
                       'bg-slate-800'
                   }`}>
                      <FileText size={20} />
                   </div>
                   <div>
                      <div className="font-bold text-sm text-slate-900">{job.file.name}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <span>{(job.file.size / 1024).toFixed(0)} KB</span>
                        {job.status === 'error' && <span className="text-red-500 font-bold">• {job.message}</span>}
                      </div>
                   </div>
                </div>
                
                <div className="flex items-center gap-4 pr-6 z-10">
                   <div className="text-right mr-2 hidden sm:block">
                       <div className="text-xs font-bold text-slate-700">{job.message}</div>
                       {(job.status === 'uploading' || job.status === 'processing') && (
                           <div className="text-[10px] text-amber-600 font-mono">{Math.round(job.progress)}%</div>
                       )}
                   </div>
                   
                   {job.status === 'idle' && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => processJob(job.id)} className="p-2 bg-slate-900 text-white rounded hover:bg-black transition" title="Start Conversion">
                            <Zap size={16} />
                        </button>
                        <button onClick={() => removeJob(job.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition" title={t('dismiss')}>
                            <Trash2 size={16} />
                        </button>
                      </div>
                   )}
                   
                   {(job.status === 'uploading' || job.status === 'processing') && <Loader2 size={20} className="animate-spin text-amber-500" />}
                   {job.status === 'completed' && <CheckCircle2 size={24} className="text-green-500" />}
                   {job.status === 'error' && <AlertCircle size={24} className="text-red-500" />}
                </div>
             </div>
           ))}
        </div>
        
        {jobs.some(j => j.status === 'idle') && (
            <div className="mt-8 text-center">
               <button 
                  onClick={processAll} 
                  disabled={!hasApiKey}
                  className="px-8 py-4 bg-amber-500 text-white font-bold rounded-full shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center gap-2 mx-auto"
               >
                  <Zap fill="currentColor" size={18} />
                  {t('convertAll')}
               </button>
            </div>
        )}
    </div>
  );
};

export default NativePdfConverter;
