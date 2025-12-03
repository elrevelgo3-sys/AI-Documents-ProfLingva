import React, { useState } from 'react';
import DocAnalyzer from './components/DocAnalyzer';
import Sidebar from './components/Sidebar';
import Translator from './components/Translator';
// Убрали битые импорты MiniGame и других, пока они пустые
// Если они у тебя есть и не пустые - раскомментируй
// import MiniGame from './components/MiniGame'; 
import NativePdfConverter from './components/NativePdfConverter';
import { AppMode } from './types';
import { CheckCircle2, X } from 'lucide-react';

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DOCUMENT);
  const [notification, setNotification] = useState<{show: boolean, message: string}>({ show: false, message: '' });

  const handleProcessingComplete = () => {
    setNotification({ show: true, message: "Batch processing successfully completed." });
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 5000);
  };

  return (
    <div className="flex h-screen bg-[#F8FAFC] text-slate-900 font-sans overflow-hidden">
      <Sidebar currentMode={mode} setMode={setMode} />
      <main className="flex-1 h-full overflow-y-auto relative flex flex-col">
        <header className="px-8 py-6 flex items-center justify-between bg-white/80 backdrop-blur-md sticky top-0 z-20 border-b border-slate-200/60">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">ProfLingva AI Suite</h1>
            <p className="text-sm text-slate-500 mt-1">Enterprise Document Processing System</p>
          </div>
        </header>

        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          {mode === AppMode.DOCUMENT && <DocAnalyzer onProcessingComplete={handleProcessingComplete} />}
          {mode === AppMode.NATIVE && <NativePdfConverter />}
          {mode === AppMode.TRANSLATE && <Translator />}
          {/* {mode === AppMode.GAME && <MiniGame />} */}
        </div>

        {notification.show && (
          <div className="absolute top-24 right-8 z-50 animate-[slideIn_0.3s_ease-out]">
            <div className="bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 border border-slate-700/50 backdrop-blur-xl">
              <div className="font-medium">{notification.message}</div>
              <button onClick={() => setNotification(prev => ({ ...prev, show: false }))}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
