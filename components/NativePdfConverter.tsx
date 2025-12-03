import React, { useState, useRef } from 'react';
import { Upload, FileText, Zap, Loader2, CheckCircle2, AlertCircle, X, Trash2 } from 'lucide-react';
import { convertNativePdfToDocx } from '../utils/nativePdfToDocx';

interface Job {
  id: string;
  file: File;
  status: 'idle' | 'processing' | 'completed' | 'error';
  message: string;
}

const NativePdfConverter: React.FC = () => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newJobs: Job[] = Array.from(files).map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      file: f,
      status: 'idle',
      message: 'Ready'
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

    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'processing', message: 'Extracting...' } : j));

    try {
      await convertNativePdfToDocx(job.file, (msg) => {
        setJobs(prev => prev.map(j => j.id === id ? { ...j, message: msg } : j));
      });
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'completed', message: 'Downloaded' } : j));
    } catch (e) {
      setJobs(prev => prev.map(j => j.id === id ? { ...j, status: 'error', message: 'Failed' } : j));
    }
  };

  const processAll = async () => {
    const idle = jobs.filter(j => j.status === 'idle');
    await Promise.all(idle.map(j => processJob(j.id)));
  };

  return (
    <div className="max-w-4xl mx-auto">
       <header className="mb-10 flex items-center gap-3">
           <div className="p-3 bg-amber-400 text-white rounded-xl shadow-lg shadow-amber-400/30">
              <Zap size={28} strokeWidth={2} fill="currentColor" />
           </div>
           <div>
             <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Instant Native PDF</h2>
             <p className="text-sm text-slate-500 font-medium">Lightning-fast text extraction without AI. Best for digital documents.</p>
           </div>
       </header>

       <div 
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-300 rounded-2xl p-10 flex flex-col items-center justify-center text-center hover:border-amber-400 hover:bg-amber-50/30 transition cursor-pointer bg-white mb-8"
        >
          <div className="p-4 bg-amber-50 text-amber-500 rounded-full mb-3">
             <Upload size={24} />
          </div>
          <h3 className="font-bold text-slate-900">Upload Native PDFs</h3>
          <p className="text-xs text-slate-400 mt-1">Select clean, digital PDF files (not scans)</p>
          <input type="file" multiple accept=".pdf" className="hidden" ref={fileInputRef} onChange={e => handleFiles(e.target.files)} />
        </div>

        <div className="space-y-3">
           {jobs.map(job => (
             <div key={job.id} className="relative bg-white border border-slate-200 p-4 rounded-xl flex items-center justify-between shadow-sm group">
                
                {/* Dismiss Button for Completed Jobs */}
                {job.status === 'completed' && (
                  <button 
                      onClick={() => removeJob(job.id)}
                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                      title="Dismiss"
                  >
                      <X size={16} />
                  </button>
                )}

                <div className="flex items-center gap-4">
                   <div className="p-2 bg-slate-100 rounded text-slate-500">
                      <FileText size={20} />
                   </div>
                   <div>
                      <div className="font-bold text-sm text-slate-900">{job.file.name}</div>
                      <div className="text-[10px] text-slate-400">{(job.file.size / 1024).toFixed(1)} KB</div>
                   </div>
                </div>
                
                <div className="flex items-center gap-4 pr-6">
                   <span className={`text-xs font-bold uppercase px-2 py-1 rounded 
                      ${job.status === 'completed' ? 'bg-green-100 text-green-700' : 
                        job.status === 'error' ? 'bg-red-100 text-red-700' : 
                        job.status === 'processing' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                      {job.message}
                   </span>
                   
                   {job.status === 'idle' && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => processJob(job.id)} className="p-2 bg-slate-900 text-white rounded hover:bg-black transition" title="Process">
                            <Zap size={16} />
                        </button>
                        <button onClick={() => removeJob(job.id)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition" title="Remove">
                            <Trash2 size={16} />
                        </button>
                      </div>
                   )}
                   
                   {job.status === 'processing' && <Loader2 size={20} className="animate-spin text-amber-500" />}
                   {job.status === 'completed' && <CheckCircle2 size={20} className="text-green-500" />}
                   {job.status === 'error' && <AlertCircle size={20} className="text-red-500" />}
                </div>
             </div>
           ))}
        </div>
        
        {jobs.some(j => j.status === 'idle') && (
            <div className="mt-8 text-center">
               <button onClick={processAll} className="px-8 py-3 bg-amber-500 text-white font-bold rounded-lg shadow-lg shadow-amber-500/30 hover:bg-amber-600 transition">
                  Convert All Instantly
               </button>
            </div>
        )}
    </div>
  );
};

export default NativePdfConverter;