
import React, { useState } from 'react';
import { Languages, ArrowRightLeft, Copy, Check, Sparkles, Loader2, Globe2 } from 'lucide-react';
import { translateText } from '../services/geminiService';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'ar', name: 'Arabic' },
];

const Translator: React.FC = () => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('Detect Language');
  const [targetLang, setTargetLang] = useState('English');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    setTranslatedText('');
    try {
      const src = sourceLang === 'Detect Language' ? 'the source language' : sourceLang;
      const result = await translateText(sourceText, src, targetLang);
      setTranslatedText(result);
    } catch (error) {
      console.error(error);
      setTranslatedText("Error: Could not complete translation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (translatedText) {
      navigator.clipboard.writeText(translatedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const swapLanguages = () => {
    if (sourceLang === 'Detect Language') return;
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
  };

  return (
    <div className="max-w-6xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
           <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/20">
              <Globe2 size={28} strokeWidth={1.5} />
           </div>
           <div>
             <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Neural Linguistic Engine</h2>
             <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider rounded border border-brand-100">Context Aware</span>
                <span className="text-slate-400 text-sm">|</span>
                <p className="text-sm text-slate-500 font-medium">Professional CAT System</p>
             </div>
           </div>
        </div>
      </header>

      {/* Controls Toolbar */}
      <div className="bg-white rounded-t-2xl border border-slate-200 p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm z-10 relative">
        <div className="flex items-center gap-4 flex-1">
          <div className="relative group">
            <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">From</label>
            <select 
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              className="w-48 p-3 bg-white border border-slate-300 rounded-lg text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none hover:border-slate-400 transition"
            >
              <option>Detect Language</option>
              {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
            </select>
          </div>

          <button 
            onClick={swapLanguages}
            disabled={sourceLang === 'Detect Language'}
            className="p-2.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-full transition disabled:opacity-30 border border-transparent hover:border-brand-100"
          >
            <ArrowRightLeft size={20} />
          </button>

          <div className="relative group">
            <label className="absolute -top-2 left-2 bg-white px-1 text-[10px] font-bold text-brand-500 uppercase tracking-wider">To</label>
            <select 
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="w-48 p-3 bg-brand-50/50 border border-brand-200 rounded-lg text-sm font-bold text-brand-800 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
            >
              {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <button
          onClick={handleTranslate}
          disabled={loading || !sourceText}
          className="bg-brand-600 text-white px-8 py-3 rounded-lg font-bold tracking-wide shadow-lg shadow-brand-600/20 hover:bg-brand-700 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95"
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
          {loading ? 'PROCESSING...' : 'TRANSLATE'}
        </button>
      </div>

      {/* Editor Area */}
      <div className="flex-1 flex flex-col md:flex-row bg-white border-x border-b border-slate-200 rounded-b-2xl shadow-sm overflow-hidden">
        
        {/* Source Pane */}
        <div className="flex-1 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 relative">
          <div className="absolute top-4 right-4 text-[10px] font-bold text-slate-300 uppercase tracking-widest select-none pointer-events-none">Original Source</div>
          <textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="Enter text for professional translation..."
            className="flex-1 w-full h-full p-8 resize-none focus:outline-none focus:bg-slate-50/30 transition text-lg leading-relaxed text-slate-800 placeholder-slate-300 font-serif"
            style={{ fontFamily: 'Inter, serif' }}
          />
          <div className="px-4 py-2 border-t border-slate-50 bg-white text-[10px] text-slate-400 font-mono flex justify-end">
             {sourceText.length} CHARS
          </div>
        </div>

        {/* Target Pane */}
        <div className="flex-1 flex flex-col bg-slate-50/40 relative">
           <div className="absolute top-4 right-4 text-[10px] font-bold text-brand-200 uppercase tracking-widest select-none pointer-events-none">Output</div>
          
           {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center text-brand-600 opacity-60">
                <Loader2 className="animate-spin mb-3" size={32} />
                <p className="text-xs font-bold uppercase tracking-widest">Neural Network Active</p>
             </div>
           ) : (
             <textarea
               readOnly
               value={translatedText}
               placeholder="Translation output..."
               className="flex-1 w-full h-full p-8 resize-none focus:outline-none bg-transparent text-lg leading-relaxed text-slate-900 font-serif"
               style={{ fontFamily: 'Inter, serif' }}
             />
           )}

           {/* Target Actions */}
           <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center bg-white/50">
              <span className="text-[10px] text-slate-400 font-mono">{translatedText.length} CHARS</span>
              {translatedText && (
                <button 
                  onClick={handleCopy}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition
                    ${copied ? 'bg-green-100 text-green-700' : 'bg-white border border-slate-200 text-slate-500 hover:border-brand-300 hover:text-brand-600'}`}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'COPIED' : 'COPY'}
                </button>
              )}
           </div>
        </div>

      </div>
    </div>
  );
};

export default Translator;
