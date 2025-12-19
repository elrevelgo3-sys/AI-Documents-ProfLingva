
import React, { useState, useEffect, useCallback } from 'react';
import { ArrowRightLeft, Copy, Check, Sparkles, Loader2, Globe2, Book, Briefcase, Plus, Trash2, AlertTriangle, CheckCircle2, Search } from 'lucide-react';
import { translateText } from '../services/geminiService';
import { useLanguage } from '../contexts/LanguageContext';

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

const DOMAINS = ['General', 'Legal', 'Medical', 'Technical', 'Marketing', 'Financial', 'Academic'];
const TONES = ['Professional', 'Formal', 'Casual', 'Persuasive', 'Diplomatic', 'Creative'];

interface GlossaryTerm {
    term: string;
    translation: string;
}

interface QAStatus {
    term: string;
    foundInSource: boolean;
    foundInTarget: boolean; // Only relevant if foundInSource is true
}

const Translator: React.FC = () => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  
  // Translation Config
  const [sourceLang, setSourceLang] = useState('Detect Language');
  const [targetLang, setTargetLang] = useState('English');
  const [domain, setDomain] = useState('General');
  const [tone, setTone] = useState('Professional');
  
  // Glossary State
  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [newTerm, setNewTerm] = useState('');
  const [newTrans, setNewTrans] = useState('');
  const [showGlossary, setShowGlossary] = useState(true); // Default open for Pro users

  // QA State
  const [qaReport, setQaReport] = useState<QAStatus[]>([]);

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { t } = useLanguage();

  // --- QA & Analysis Logic ---

  // Check which glossary terms are present in the source text
  const analyzeGlossaryMatches = useCallback(() => {
    if (!sourceText) {
        setQaReport([]);
        return;
    }

    const report: QAStatus[] = glossary.map(g => {
        // Simple case-insensitive match for MVP. 
        // In real CAT, we'd need fuzzy matching for plural forms etc.
        const sourceRegex = new RegExp(`\\b${escapeRegExp(g.term)}\\b`, 'i');
        const foundSource = sourceRegex.test(sourceText);
        
        let foundTarget = false;
        if (foundSource && translatedText) {
             const targetRegex = new RegExp(escapeRegExp(g.translation), 'i');
             foundTarget = targetRegex.test(translatedText);
        }

        return {
            term: g.term,
            foundInSource: foundSource,
            foundInTarget: foundTarget
        };
    });
    setQaReport(report);
  }, [sourceText, translatedText, glossary]);

  useEffect(() => {
    analyzeGlossaryMatches();
  }, [sourceText, translatedText, glossary, analyzeGlossaryMatches]);

  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
  };

  // --- Handlers ---

  const handleTranslate = async () => {
    if (!sourceText.trim()) return;
    setLoading(true);
    setTranslatedText(''); // Clear previous to reset QA
    try {
      const src = sourceLang === 'Detect Language' ? 'the source language' : sourceLang;
      const result = await translateText(sourceText, {
          sourceLang: src,
          targetLang: targetLang,
          domain,
          tone,
          glossary
      });
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

  const addGlossaryTerm = () => {
      if (newTerm.trim() && newTrans.trim()) {
          // Prevent duplicates
          if (!glossary.some(g => g.term.toLowerCase() === newTerm.trim().toLowerCase())) {
            setGlossary([...glossary, { term: newTerm.trim(), translation: newTrans.trim() }]);
          }
          setNewTerm('');
          setNewTrans('');
      }
  };

  const removeGlossaryTerm = (idx: number) => {
      setGlossary(glossary.filter((_, i) => i !== idx));
  };

  // UX: Capture text selection to quick-add to glossary
  const handleSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
          // Only if selection is within the source textarea (simple approximation)
          // Ideally we check activeElement, but for this UI, global selection is okayish if filtered length
          const text = selection.toString().trim();
          if (text.length < 50) { // Limit to reasonable term length
              setNewTerm(text);
              // Open glossary if closed so user sees where it went
              if (!showGlossary) setShowGlossary(true);
          }
      }
  };

  // Stats for QA Badge
  const activeTermsCount = qaReport.filter(r => r.foundInSource).length;
  const missingTermsCount = qaReport.filter(r => r.foundInSource && translatedText && !r.foundInTarget).length;
  const qaStatusColor = missingTermsCount > 0 ? 'text-red-500' : activeTermsCount > 0 ? 'text-green-500' : 'text-slate-400';

  return (
    <div className="max-w-7xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <header className="mb-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
           <div className="p-3 bg-slate-900 text-white rounded-xl shadow-lg shadow-slate-900/20">
              <Globe2 size={28} strokeWidth={1.5} />
           </div>
           <div>
             <h2 className="text-3xl font-bold text-slate-900 tracking-tight">{t('neuralEngine')}</h2>
             <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] font-bold uppercase tracking-wider rounded border border-brand-100">{t('contextAware')}</span>
                <span className="text-slate-400 text-sm">|</span>
                <div className="flex items-center gap-1.5 text-sm font-medium">
                    <span className={qaStatusColor}>
                        {missingTermsCount > 0 ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                    </span>
                    <span className="text-slate-500">QA: {activeTermsCount > 0 ? `${activeTermsCount - missingTermsCount}/${activeTermsCount} Terms Verified` : 'No Active Terms'}</span>
                </div>
             </div>
           </div>
        </div>
        
        <button 
            onClick={() => setShowGlossary(!showGlossary)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${showGlossary ? 'bg-brand-50 text-brand-700 border border-brand-200' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}
        >
            <Book size={16} />
            Terminology Base
            {glossary.length > 0 && <span className="bg-brand-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{glossary.length}</span>}
        </button>
      </header>

      <div className="flex-1 flex gap-6 overflow-hidden">
        {/* Left Column: CAT Tools (Settings & Glossary) */}
        <div className={`w-80 flex flex-col gap-4 transition-all duration-300 ${showGlossary ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 hidden'}`}>
             
             {/* Context Settings */}
             <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                <div className="flex items-center gap-2 mb-4 text-slate-800 font-bold text-sm uppercase tracking-wide">
                    <Briefcase size={16} className="text-brand-500" />
                    Translation Context
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Industry Domain</label>
                        <select 
                            value={domain}
                            onChange={(e) => setDomain(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-slate-500 block mb-1.5">Tone of Voice</label>
                        <select 
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
                        >
                            {TONES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                </div>
             </div>

             {/* Glossary Manager */}
             <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2 text-slate-800 font-bold text-sm uppercase tracking-wide">
                        <Book size={16} className="text-brand-500" />
                        Glossary
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded">
                        {activeTermsCount} ACTIVE
                    </div>
                </div>

                <div className="flex flex-col gap-2 mb-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Quick Add</div>
                    <div className="flex gap-2">
                        <input 
                            className="w-1/2 p-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-brand-500"
                            placeholder="Term"
                            value={newTerm}
                            onChange={e => setNewTerm(e.target.value)}
                        />
                        <input 
                            className="w-1/2 p-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-brand-500"
                            placeholder="Translation"
                            value={newTrans}
                            onChange={e => setNewTrans(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addGlossaryTerm()}
                        />
                    </div>
                    <button 
                        onClick={addGlossaryTerm}
                        disabled={!newTerm || !newTrans}
                        className="w-full py-1.5 bg-brand-600 text-white rounded text-xs font-bold hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                        <Plus size={12} /> Add Rule
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {glossary.length === 0 ? (
                        <div className="text-center py-8">
                            <Search className="mx-auto text-slate-200 mb-2" size={24} />
                            <p className="text-xs text-slate-400 italic px-4">
                                Select text in the source box to Quick Add, or type manually.
                            </p>
                        </div>
                    ) : (
                        qaReport.map((item, idx) => {
                            // Determine style based on QA status
                            let borderClass = 'border-slate-100';
                            let bgClass = 'bg-white';
                            let statusIcon = null;

                            if (item.foundInSource) {
                                bgClass = 'bg-green-50';
                                borderClass = 'border-green-200';
                                if (translatedText) {
                                    if (item.foundInTarget) {
                                        statusIcon = <Check size={12} className="text-green-600" />;
                                    } else {
                                        bgClass = 'bg-red-50';
                                        borderClass = 'border-red-200';
                                        statusIcon = <AlertTriangle size={12} className="text-red-500" />;
                                    }
                                } else {
                                     // Found in source, waiting for translation
                                     statusIcon = <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />;
                                }
                            }

                            const translation = glossary.find(g => g.term === item.term)?.translation || '';

                            return (
                                <div key={idx} className={`flex justify-between items-center p-2.5 rounded-lg border ${borderClass} ${bgClass} group transition-all`}>
                                    <div className="text-xs flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <span className="font-bold text-slate-800 truncate">{item.term}</span>
                                            {statusIcon}
                                        </div>
                                        <div className="flex items-center text-slate-500">
                                            <span className="text-[10px] mr-1">→</span>
                                            <span className="font-medium text-brand-700 truncate">{translation}</span>
                                        </div>
                                    </div>
                                    <button onClick={() => removeGlossaryTerm(idx)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition p-1">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
             </div>
        </div>

        {/* Main Editor Area */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="bg-slate-50 border-b border-slate-200 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <select 
                        value={sourceLang}
                        onChange={(e) => setSourceLang(e.target.value)}
                        className="bg-white border border-slate-300 rounded-md text-sm py-1.5 px-3 font-semibold text-slate-700 hover:border-brand-400 focus:outline-none focus:border-brand-500"
                    >
                        <option>{t('detectLanguage')}</option>
                        {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
                    </select>

                    <button 
                        onClick={swapLanguages}
                        disabled={sourceLang === 'Detect Language'}
                        className="p-1.5 text-slate-400 hover:text-brand-600 rounded-full transition disabled:opacity-30"
                    >
                        <ArrowRightLeft size={16} />
                    </button>

                    <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="bg-white border border-slate-300 rounded-md text-sm py-1.5 px-3 font-semibold text-slate-700 hover:border-brand-400 focus:outline-none focus:border-brand-500"
                    >
                        {LANGUAGES.map(l => <option key={l.code} value={l.name}>{l.name}</option>)}
                    </select>
                </div>

                <div className="flex items-center gap-3">
                     {!showGlossary && (
                         <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-white px-3 py-1.5 rounded-full border border-slate-200">
                            <span>{domain}</span>
                            <span className="text-slate-300">|</span>
                            <span>{tone}</span>
                         </div>
                     )}
                     <button
                        onClick={handleTranslate}
                        disabled={loading || !sourceText}
                        className="bg-brand-600 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-md hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all active:scale-95"
                        >
                        {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        {loading ? t('processing') : t('translateBtn')}
                    </button>
                </div>
            </div>

            {/* Split View */}
            <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-200 h-full relative">
                
                {/* Source Pane */}
                <div className="flex-1 relative flex flex-col group">
                    <textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        onSelect={handleSelection} // QUICK ADD TRIGGER
                        placeholder={t('enterText')}
                        className="flex-1 w-full h-full p-6 resize-none focus:outline-none focus:bg-brand-50/5 transition text-base leading-relaxed text-slate-800 placeholder-slate-300 font-serif"
                        style={{ fontFamily: 'Inter, serif' }}
                    />
                    <div className="absolute bottom-2 right-4 text-[10px] text-slate-300 font-mono pointer-events-none">
                        SOURCE
                    </div>
                </div>

                {/* Target Pane */}
                <div className="flex-1 relative flex flex-col bg-slate-50/30">
                    {loading ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                            <Loader2 className="animate-spin mb-2 text-brand-500" size={24} />
                            <p className="text-xs font-bold uppercase tracking-widest text-brand-900/40">Translating...</p>
                        </div>
                    ) : (
                        <>
                            <textarea
                                readOnly
                                value={translatedText}
                                placeholder="..."
                                className="flex-1 w-full h-full p-6 resize-none focus:outline-none bg-transparent text-base leading-relaxed text-slate-900 font-serif"
                                style={{ fontFamily: 'Inter, serif' }}
                            />
                            
                            {/* QA Warning Overlay if terms missing */}
                            {missingTermsCount > 0 && translatedText && (
                                <div className="absolute bottom-8 left-6 right-6 bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3 animate-[slideIn_0.3s_ease-out]">
                                    <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
                                    <div>
                                        <div className="text-xs font-bold text-red-800 mb-1">QA WARNING: Missing Glossary Terms</div>
                                        <div className="flex flex-wrap gap-1">
                                            {qaReport.filter(r => r.foundInSource && !r.foundInTarget).map((r, i) => (
                                                <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] rounded font-medium border border-red-200">
                                                    {r.term}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                    
                    {translatedText && (
                        <div className="absolute top-2 right-2">
                            <button 
                                onClick={handleCopy}
                                className={`p-2 rounded-lg transition-all ${copied ? 'text-green-600 bg-green-50' : 'text-slate-400 hover:text-brand-600 hover:bg-white'}`}
                                title={t('copy')}
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                            </button>
                        </div>
                    )}
                    <div className="absolute bottom-2 right-4 text-[10px] text-brand-200 font-mono pointer-events-none">
                        TARGET
                    </div>
                </div>
            </div>
            
            {/* Footer Stats */}
            <div className="bg-white border-t border-slate-100 p-2 flex justify-between items-center text-[10px] text-slate-400 font-mono px-4">
               <div>Ln 1, Col 1</div>
               <div>{sourceText.length} Chars</div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Translator;
