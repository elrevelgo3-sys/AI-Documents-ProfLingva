
import React, { useState, useEffect } from 'react';
import { X, Save, Network, Globe, KeyRound } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [proxyUrl, setProxyUrl] = useState('');
  const [convertKey, setConvertKey] = useState('');

  useEffect(() => {
    const savedProxy = localStorage.getItem('gemini_proxy_url');
    if (savedProxy) setProxyUrl(savedProxy);

    const savedKey = localStorage.getItem('convert_api_secret');
    if (savedKey) setConvertKey(savedKey);
  }, []);

  const handleSave = () => {
    if (proxyUrl.trim()) {
      const cleanUrl = proxyUrl.trim().replace(/\/$/, "");
      localStorage.setItem('gemini_proxy_url', cleanUrl);
    } else {
      localStorage.removeItem('gemini_proxy_url');
    }

    if (convertKey.trim()) {
      localStorage.setItem('convert_api_secret', convertKey.trim());
    } else {
      localStorage.removeItem('convert_api_secret');
    }

    // Reload to apply changes
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-[scaleIn_0.2s_ease-out] overflow-hidden">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
                    <Settings2 size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Application Settings</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
            
            {/* ConvertAPI Key Section */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">ConvertAPI Secret</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <KeyRound size={16} />
                    </div>
                    <input 
                        type="password" 
                        value={convertKey}
                        onChange={(e) => setConvertKey(e.target.value)}
                        placeholder="Enter your ConvertAPI Secret..."
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-sm font-mono text-slate-800 placeholder-slate-400"
                    />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                   Required for PDF to DOCX conversion. You can get this from <a href="https://convertapi.com" target="_blank" className="underline hover:text-amber-600">convertapi.com</a>.
                </p>
            </div>

            <hr className="border-slate-100" />

            {/* Proxy URL Section */}
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Proxy Base URL</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Network size={16} />
                    </div>
                    <input 
                        type="text" 
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        placeholder="https://your-app.vercel.app/api/proxy"
                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 outline-none text-sm font-mono text-slate-800 placeholder-slate-400"
                    />
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Custom proxy routing for regions with restricted API access.
                </p>
            </div>

        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button 
                onClick={handleSave}
                className="bg-brand-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-brand-700 transition flex items-center gap-2 shadow-lg shadow-brand-600/20"
            >
                <Save size={16} />
                Save Changes
            </button>
        </div>

      </div>
    </div>
  );
};

// Helper icon import needed since I changed Settings2 to Settings2Icon implicitly or just imported it
// Let's stick to the imports used above.
import { Settings2 } from 'lucide-react';

export default SettingsModal;
