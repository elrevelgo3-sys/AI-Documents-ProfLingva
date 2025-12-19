
import React, { useState } from 'react';
// import DocAnalyzer from './components/DocAnalyzer'; // Hidden for now
import Sidebar from './components/Sidebar';
import Translator from './components/Translator';
import MiniGame from './components/MiniGame';
import NativePdfConverter from './components/NativePdfConverter';
import { AppMode } from './types';
import { CheckCircle2, X } from 'lucide-react';
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
        
        {/* Language Switcher - Top Right */}
        <div className="absolute top-6 right-10 z-40 flex bg-white rounded-full p-1 shadow-sm border border-slate-200">
           <button 
             onClick={() => setLanguage('en')}
             className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${language === 'en' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
           >
             ENGLISH
           </button>
           <button 
             onClick={() => setLanguage('ru')}
             className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${language === 'ru' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:text-slate-900'}`}
           >
             РУССКИЙ
           </button>
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
