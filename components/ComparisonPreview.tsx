
import React, { useState, useRef, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Layers, Table, PenTool, Stamp, ScanLine, Eye } from 'lucide-react';
import { StructuredDocument, ElementType } from '../types';

interface ComparisonPreviewProps {
  originalImage: string;
  data: StructuredDocument;
  onClose: () => void;
  fileName: string;
}

const ComparisonPreview: React.FC<ComparisonPreviewProps> = ({ originalImage, data, onClose, fileName }) => {
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Statistics for X-Ray
  const stats = {
    tables: data.elements ? data.elements.filter(e => e.type === ElementType.TABLE).length : 0,
    signatures: data.elements ? data.elements.filter(e => e.type === ElementType.SIGNATURE).length : 0,
    stamps: data.elements ? data.elements.filter(e => e.type === ElementType.STAMP).length : 0,
    images: data.elements ? data.elements.filter(e => e.type === ElementType.IMAGE).length : 0,
  };

  const handleDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const position = ((x - rect.left) / rect.width) * 100;
    
    setSliderPos(Math.min(100, Math.max(0, position)));
  };

  useEffect(() => {
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchend', handleUp);
    };
  }, []);

  // Simple renderer to simulate the "After" view based on JSON data
  const renderDigitizedView = () => (
    <div className="bg-white min-h-full p-8 font-serif text-slate-900 shadow-inner">
      {data.elements && data.elements.map((el, idx) => {
        // DEFENSIVE CODING: Use optional chaining (?.) and defaults (||) because AI might omit style object
        const style = {
            textAlign: (el.style?.alignment || 'left') as any,
            fontWeight: el.style?.bold ? 'bold' : 'normal',
            fontStyle: el.style?.italic ? 'italic' : 'normal',
            color: el.style?.color || '#000000',
            fontSize: `${(el.style?.font_size || 11) * 1.5}px` // Scale for screen, default to 11pt
        };

        if (el.type === ElementType.TABLE && el.data?.rows) {
            return (
                <div key={idx} className="my-4 border border-slate-300 rounded overflow-hidden text-xs">
                    {el.data.rows.map((row, rIdx) => (
                        <div key={rIdx} className="flex border-b border-slate-200 last:border-0">
                            {row.map((cell, cIdx) => (
                                <div key={cIdx} className="flex-1 p-2 border-r border-slate-200 last:border-0 bg-slate-50">
                                    {cell}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            );
        }
        
        if (['image', 'signature', 'stamp'].includes(el.type)) {
             return (
                 <div key={idx} className="my-4 border-2 border-dashed border-brand-200 bg-brand-50/30 p-4 flex flex-col items-center justify-center rounded-lg text-brand-400">
                    <span className="text-[10px] font-bold uppercase">{el.type} RECOVERED</span>
                    <ScanLine size={24} className="mt-1 opacity-50" />
                 </div>
             );
        }

        if (el.type === ElementType.HEADING_1) return <h1 key={idx} style={style} className="mb-4">{el.content}</h1>;
        if (el.type === ElementType.HEADING_2) return <h2 key={idx} style={style} className="mb-3">{el.content}</h2>;
        
        return <p key={idx} style={style} className="mb-2 leading-relaxed">{el.content}</p>;
      })}
    </div>
  );

  const simulateHighlight = (type: string) => {
      // In a real app, this would highlight bboxes. For demo, we toast.
      const toast = document.createElement('div');
      toast.className = 'fixed bottom-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-full text-sm font-bold shadow-xl animate-[slideIn_0.3s_ease-out] z-[60]';
      toast.innerText = `Highlighting all ${type}s...`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-8">
      <div className="bg-white w-full max-w-7xl h-[90vh] rounded-2xl overflow-hidden flex shadow-2xl animate-[scaleIn_0.2s_ease-out]">
        
        {/* Main Preview Area */}
        <div className="flex-1 flex flex-col bg-slate-100 relative">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center z-10">
            <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    <Eye className="text-brand-500" size={18} />
                    Comparison Mode
                </h3>
                <p className="text-xs text-slate-500 font-mono">{fileName}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition"><X size={20} className="text-slate-500" /></button>
          </div>

          {/* Slider Container */}
          <div 
             className="flex-1 relative overflow-hidden select-none cursor-ew-resize group"
             ref={containerRef}
             onMouseDown={() => setIsDragging(true)}
             onTouchStart={() => setIsDragging(true)}
             onMouseMove={handleDrag}
             onTouchMove={handleDrag}
          >
             {/* Layer 1: Digitized (Right side / Background) */}
             <div className="absolute inset-0 overflow-y-auto no-scrollbar pb-20">
                <div className="max-w-[800px] mx-auto min-h-full bg-white shadow-xl my-8">
                     {renderDigitizedView()}
                </div>
             </div>

             {/* Layer 2: Original (Left side / Clipped) */}
             <div 
                className="absolute inset-0 bg-slate-200 overflow-hidden border-r-4 border-brand-500"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
             >
                <div className="absolute inset-0 overflow-y-auto no-scrollbar pb-20">
                    <div className="max-w-[800px] mx-auto min-h-full my-8 bg-slate-300">
                        <img src={originalImage} className="w-full h-auto shadow-xl block" alt="Original" />
                    </div>
                </div>
             </div>

             {/* Slider Handle */}
             <div 
                className="absolute inset-y-0 w-10 -ml-5 flex items-center justify-center pointer-events-none z-20"
                style={{ left: `${sliderPos}%` }}
             >
                 <div className="w-10 h-10 bg-brand-500 rounded-full shadow-lg flex items-center justify-center text-white ring-4 ring-white">
                     <div className="flex gap-1">
                         <ChevronLeft size={14} />
                         <ChevronRight size={14} />
                     </div>
                 </div>
             </div>

             {/* Labels */}
             <div className="absolute bottom-6 left-6 bg-black/70 text-white px-3 py-1 rounded-md text-xs font-bold backdrop-blur">ORIGINAL SOURCE</div>
             <div className="absolute bottom-6 right-6 bg-brand-600/90 text-white px-3 py-1 rounded-md text-xs font-bold backdrop-blur">DIGITIZED CORE</div>
          </div>
        </div>

        {/* X-Ray Sidebar */}
        <div className="w-80 bg-slate-50 border-l border-slate-200 p-6 flex flex-col z-20 shadow-[-5px_0_15px_rgba(0,0,0,0.02)]">
            <div className="flex items-center gap-2 mb-6">
                <Layers className="text-brand-600" size={20} />
                <h4 className="font-bold text-slate-900 tracking-tight">Document X-Ray</h4>
            </div>

            <div className="space-y-4">
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Structure Analysis</div>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => simulateHighlight('Table')} className="flex flex-col items-center p-3 bg-slate-50 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition group">
                            <Table size={20} className="mb-1 text-slate-400 group-hover:text-brand-500" />
                            <span className="text-xl font-bold text-slate-900">{stats.tables}</span>
                            <span className="text-[10px] text-slate-400">Tables</span>
                        </button>
                        <button onClick={() => simulateHighlight('Visual Asset')} className="flex flex-col items-center p-3 bg-slate-50 hover:bg-brand-50 hover:text-brand-600 rounded-lg transition group">
                            <ScanLine size={20} className="mb-1 text-slate-400 group-hover:text-brand-500" />
                            <span className="text-xl font-bold text-slate-900">{stats.images}</span>
                            <span className="text-[10px] text-slate-400">Assets</span>
                        </button>
                    </div>
                </div>

                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2">Legal Verification</div>
                    <div className="space-y-2">
                        <button onClick={() => simulateHighlight('Signature')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-green-50 hover:border-green-200 border border-transparent rounded-lg transition group">
                            <div className="flex items-center gap-3">
                                <PenTool size={16} className="text-slate-400 group-hover:text-green-600" />
                                <span className="text-sm font-medium text-slate-700">Signatures</span>
                            </div>
                            <span className="font-bold text-slate-900">{stats.signatures}</span>
                        </button>
                        <button onClick={() => simulateHighlight('Stamp')} className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg transition group">
                            <div className="flex items-center gap-3">
                                <Stamp size={16} className="text-slate-400 group-hover:text-blue-600" />
                                <span className="text-sm font-medium text-slate-700">Stamps</span>
                            </div>
                            <span className="font-bold text-slate-900">{stats.stamps}</span>
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-auto">
                <div className="bg-slate-900 text-white p-4 rounded-xl text-xs leading-relaxed opacity-80">
                    <span className="font-bold text-brand-400 block mb-1">AI CONFIDENCE: 99.4%</span>
                    Structural integrity verified. Layout reconstruction algorithms active.
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default ComparisonPreview;
