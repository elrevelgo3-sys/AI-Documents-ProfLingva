import React, { useState, useEffect } from 'react';
import { X, Save, Network, Globe } from 'lucide-react';

interface SettingsModalProps {
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const [proxyUrl, setProxyUrl] = useState('');

  useEffect(() => {
    const savedProxy = localStorage.getItem('gemini_proxy_url');
    if (savedProxy) setProxyUrl(savedProxy);
  }, []);

  const handleSave = () => {
    if (proxyUrl.trim()) {
      // Remove trailing slash if present for consistency
      const cleanUrl = proxyUrl.trim().replace(/\/$/, "");
      localStorage.setItem('gemini_proxy_url', cleanUrl);
    } else {
      localStorage.removeItem('gemini_proxy_url');
    }
    // Reload to apply changes to the singleton Gemini client
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl animate-[scaleIn_0.2s_ease-out] overflow-hidden">
        
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-brand-50 text-brand-600 rounded-lg">
                    <Network size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Network Settings</h3>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition"><X size={20} /></button>
        </div>

        <div className="p-6 space-y-6">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Proxy Base URL</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                        <Globe size={16} />
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
                    Use this to bypass regional restrictions (e.g., from Russia). 
                    Requests will be routed through the specified custom domain instead of Google's default API.
                </p>
            </div>

            <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <p className="text-xs text-blue-800 leading-relaxed">
                    <strong>Tip:</strong> If you are hosting this on Vercel, you can use <code>/api/proxy</code> as the base URL to route requests through your own backend.
                </p>
            </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
            <button 
                onClick={handleSave}
                className="bg-brand-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:bg-brand-700 transition flex items-center gap-2 shadow-lg shadow-brand-600/20"
            >
                <Save size={16} />
                Save Configuration
            </button>
        </div>

      </div>
    </div>
  );
};

export default SettingsModal;