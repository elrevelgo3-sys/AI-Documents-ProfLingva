
import React from 'react';
import { AppMode } from '../types';
import { FileText, Languages, Coffee, Zap, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface SidebarProps {
  currentMode: AppMode;
  setMode: (mode: AppMode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentMode, setMode }) => {
  const { t } = useLanguage();

  const navItems = [
    // Smart Digitization hidden per request
    { 
      mode: AppMode.NATIVE, 
      label: t('instantNativePdf'), 
      icon: Zap, 
      desc: t('instantNativePdfDesc') 
    },
    { 
      mode: AppMode.TRANSLATE, 
      label: t('neuralTranslation'), 
      icon: Languages, 
      desc: t('neuralTranslationDesc') 
    },
    { 
      mode: AppMode.GAME, 
      label: t('executiveLounge'), 
      icon: Coffee, 
      desc: t('executiveLoungeDesc') 
    },
  ];

  return (
    <div className="w-72 bg-white border-r border-slate-200 h-screen flex flex-col fixed left-0 top-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
      {/* Header / Logo */}
      <div className="p-8 border-b border-slate-100">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-brand-500 rounded-md flex items-center justify-center text-white font-display font-bold text-xl">P</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Prof<span className="text-brand-500">Lingva</span>
            </h1>
          </div>
          <p className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">Professional Linguistics</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-6 space-y-3 overflow-y-auto">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">{t('moduleSelection')}</div>
        {navItems.map((item) => {
          const isActive = currentMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => setMode(item.mode)}
              className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-300 group text-left relative overflow-hidden
                ${isActive 
                  ? 'bg-brand-50 text-brand-900 shadow-md shadow-brand-500/10' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                }`}
            >
              {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500"></div>}
              
              <div className={`p-2.5 rounded-lg transition-colors ${isActive ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30' : 'bg-slate-100 text-slate-500 group-hover:bg-white group-hover:shadow-sm'}`}>
                <item.icon size={20} strokeWidth={2} />
              </div>
              <div>
                <div className={`font-bold text-sm ${isActive ? 'text-brand-900' : 'text-slate-700'}`}>{item.label}</div>
                <div className="text-[10px] text-slate-400 font-medium tracking-wide">{item.desc}</div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Trust / Footer */}
      <div className="p-6 mt-auto">
        <div className="bg-slate-900 rounded-xl p-4 text-white relative overflow-hidden group cursor-default">
           {/* Gradient Overlay */}
           <div className="absolute inset-0 bg-gradient-to-br from-brand-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
           
           <div className="flex items-start justify-between mb-3">
             <div className="bg-brand-500/20 p-1.5 rounded border border-brand-500/30">
               <ShieldCheck size={16} className="text-brand-400" />
             </div>
             <span className="text-[10px] font-bold bg-white/10 px-2 py-1 rounded text-white/80">PRO</span>
           </div>
           
           <div className="relative z-10">
             <p className="text-xs font-bold text-slate-200 mb-0.5">{t('itResident')}</p>
             <p className="text-lg font-display font-bold tracking-wide text-white">Skolkovo</p>
           </div>
        </div>

        <div className="mt-6 flex items-center justify-between text-[10px] text-slate-400 font-medium border-t border-slate-100 pt-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
            {t('systemOperational')}
          </div>
          <span>v2.7.0 Enterprise</span>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
