
import React, { useState } from 'react';
// import DocAnalyzer from './components/DocAnalyzer'; // Hidden for now
import Sidebar from './components/Sidebar';
import Translator from './components/Translator';
import MiniGame from './components/MiniGame';
import NativePdfConverter from './components/NativePdfConverter';
import TableAnalyzer from './components/TableAnalyzer';
import { AppMode } from './types';
import { CheckCircle2, X, Globe, ChevronDown } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';

// Simple gentle notification sound
const playGentleNotification = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); 
    oscillator.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.1); 
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.error("Audio play failed", e);
  }
};

const App: React.FC = () => {
  // Default to NATIVE since Smart Digitization is hidden
  const [mode, setMode] = useState<AppMode>(AppMode.NATIVE);
  const [notification, setNotification] = useState<{show: boolean, message: string}>({ show: false, message: '' });
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  const handleProcessingComplete = () => {
    playGentleNotification();
    setNotification({ show: true, message: t('batchComplete') });
    // Auto hide after 5 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      <Sidebar currentMode={mode} setMode={setMode} />
      <div className="flex-1 ml-72 relative">
        
        {/* Language Switcher - Compact Dropdown */}
        <div className="absolute top-6 right-8 z-40">
           <button 
             onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
             className="flex items-center gap-2 bg-white/90 backdrop-blur-sm hover:bg-white rounded-full pl-2 pr-3 py-1.5 shadow-sm border border-slate-200 hover:border-brand-300 transition-all text-slate-700 text-xs font-bold group"
           >
             <div className="p-1 bg-slate-100 rounded-full text-slate-400 group-hover:text-brand-500 group-hover:bg-brand-50 transition-colors">
                <Globe size={14} strokeWidth={2.5} />
             </div>
             <span className="uppercase tracking-wide mr-0.5">{language === 'en' ? 'EN' : 'RU'}</span>
             <ChevronDown size={12} className={`text-slate-400 transition-transform duration-300 ${isLangMenuOpen ? 'rotate-180' : ''}`} />
           </button>

           {isLangMenuOpen && (
             <>
                <div 
                    className="fixed inset-0 z-30" 
                    onClick={() => setIsLangMenuOpen(false)}
                />
                <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden py-1 z-40 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <button 
                        onClick={() => { setLanguage('en'); setIsLangMenuOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-between ${language === 'en' ? 'text-brand-600 bg-brand-50' : 'text-slate-600'}`}
                    >
                        <span>English</span>
                        {language === 'en' && <CheckCircle2 size={12} />}
                    </button>
                    <button 
                        onClick={() => { setLanguage('ru'); setIsLangMenuOpen(false); }}
                        className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 transition-colors flex items-center justify-between ${language === 'ru' ? 'text-brand-600 bg-brand-50' : 'text-slate-600'}`}
                    >
                        <span>Русский</span>
                        {language === 'ru' && <CheckCircle2 size={12} />}
                    </button>
                </div>
             </>
           )}
        </div>

        <div className="p-10 max-w-[1600px] mx-auto pt-20 md:pt-10">
          
          {/* 
          <div style={{ display: mode === AppMode.DOCUMENT ? 'block' : 'none' }}>
            <DocAnalyzer onProcessingComplete={handleProcessingComplete} />
          </div> 
          */}

          <div style={{ display: mode === AppMode.NATIVE ? 'block' : 'none' }}>
            <NativePdfConverter />
          </div>

          <div style={{ display: mode === AppMode.TABLE_ANALYZER ? 'block' : 'none' }}>
            <TableAnalyzer />
          </div>

          <div style={{ display: mode === AppMode.TRANSLATE ? 'block' : 'none' }}>
            <Translator />
          </div>

          <div style={{ display: mode === AppMode.GAME ? 'block' : 'none' }}>
            <MiniGame />
          </div>

        </div>

        {/* Corporate Notification Toast */}
        {notification.show && (
          <div className="fixed bottom-8 right-8 z-50 animate-[slideIn_0.4s_ease-out]">
            <div className="bg-slate-900 border border-slate-800 shadow-2xl shadow-black/20 rounded-lg p-5 flex items-start gap-4 max-w-sm pr-12 relative overflow-hidden">
              <div className="absolute inset-y-0 left-0 w-1 bg-brand-500"></div>
              <div className="bg-brand-500/10 p-2 rounded-full shrink-0 text-brand-500 border border-brand-500/20">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h4 className="font-bold text-white text-sm uppercase tracking-wide">{t('systemNotification')}</h4>
                <p className="text-sm text-slate-400 mt-1 leading-relaxed">{notification.message}</p>
              </div>
              <button 
                onClick={() => setNotification(prev => ({ ...prev, show: false }))}
                className="absolute top-3 right-3 p-1 text-slate-500 hover:text-white rounded-full hover:bg-white/10 transition"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
