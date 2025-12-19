
import React, { useState, useEffect } from 'react';
import { Coffee, Trophy, RefreshCw, BrainCircuit } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface Card {
  id: number;
  emoji: string;
  isFlipped: boolean;
  isMatched: boolean;
}

const EMOJIS = ['🚀', '💎', '🤖', '🧠', '⚡', '🎨', '🎼', '🌍'];

const MiniGame: React.FC = () => {
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const [won, setWon] = useState(false);
  const { t } = useLanguage();

  const initializeGame = () => {
    const shuffled = [...EMOJIS, ...EMOJIS]
      .sort(() => Math.random() - 0.5)
      .map((emoji, index) => ({
        id: index,
        emoji,
        isFlipped: false,
        isMatched: false,
      }));
    
    setCards(shuffled);
    setFlippedCards([]);
    setMoves(0);
    setMatches(0);
    setWon(false);
  };

  useEffect(() => {
    initializeGame();
  }, []);

  const handleCardClick = (id: number) => {
    if (flippedCards.length === 2) return; 
    if (cards.find(c => c.id === id)?.isMatched) return; 
    if (flippedCards.includes(id)) return; 

    const newCards = cards.map(card => 
      card.id === id ? { ...card, isFlipped: true } : card
    );
    setCards(newCards);
    
    const newFlipped = [...flippedCards, id];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      checkForMatch(newFlipped, newCards);
    }
  };

  const checkForMatch = (flippedIds: number[], currentCards: Card[]) => {
    const [first, second] = flippedIds;
    const card1 = currentCards.find(c => c.id === first);
    const card2 = currentCards.find(c => c.id === second);

    if (card1 && card2 && card1.emoji === card2.emoji) {
      setTimeout(() => {
        setCards(prev => prev.map(card => 
          card.id === first || card.id === second 
            ? { ...card, isMatched: true, isFlipped: true } 
            : card
        ));
        setFlippedCards([]);
        setMatches(m => {
            const newM = m + 1;
            if (newM === EMOJIS.length) setWon(true);
            return newM;
        });
      }, 500);
    } else {
      setTimeout(() => {
        setCards(prev => prev.map(card => 
          card.id === first || card.id === second 
            ? { ...card, isFlipped: false } 
            : card
        ));
        setFlippedCards([]);
      }, 1000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto text-center pb-20">
      <header className="mb-12">
        <div className="inline-flex items-center justify-center p-4 bg-slate-900 rounded-full text-white mb-4 shadow-xl shadow-slate-900/20">
          <Coffee size={32} strokeWidth={1.5} />
        </div>
        <h2 className="text-4xl font-bold text-slate-900 tracking-tight">{t('loungeTitle')}</h2>
        <p className="text-slate-500 mt-2 font-medium">{t('loungeDesc')}</p>
      </header>

      <div className="flex justify-between items-center max-w-md mx-auto mb-8 bg-white px-6 py-4 rounded-2xl shadow-sm border border-slate-200">
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('moves')} <span className="text-slate-900 text-base ml-1">{moves}</span></div>
        <button 
          onClick={initializeGame}
          className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-brand-600 transition"
          title="Reset Simulation"
        >
          <RefreshCw size={20} />
        </button>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('matches')} <span className="text-brand-600 text-base ml-1">{matches}/{EMOJIS.length}</span></div>
      </div>

      <div className="grid grid-cols-4 gap-4 max-w-md mx-auto [perspective:1000px]">
        {cards.map(card => (
          <div
            key={card.id}
            onClick={() => handleCardClick(card.id)}
            className={`aspect-square relative cursor-pointer transition-all duration-500 [transform-style:preserve-3d]
              ${card.isFlipped ? '[transform:rotateY(180deg)]' : ''}
              ${card.isMatched ? 'opacity-40 scale-95 grayscale' : 'hover:scale-105 hover:shadow-lg'}
            `}
          >
            {/* Front (Hidden - Brain Circuit) */}
            <div 
              className="absolute inset-0 bg-slate-900 rounded-xl shadow-sm flex items-center justify-center [backface-visibility:hidden] border border-slate-700"
            >
              <BrainCircuit className="text-slate-500" size={28} />
            </div>

            {/* Back (Shown - Emoji) */}
            <div 
              className="absolute inset-0 bg-white border-2 border-brand-500 rounded-xl shadow-md flex items-center justify-center text-4xl [backface-visibility:hidden] [transform:rotateY(180deg)]"
            >
              {card.emoji}
            </div>
          </div>
        ))}
      </div>

      {won && (
        <div className="mt-10 animate-bounce">
          <div className="inline-flex items-center gap-3 bg-slate-900 text-white px-8 py-4 rounded-full font-bold shadow-2xl shadow-slate-900/30 border border-slate-800">
            <Trophy size={20} className="text-yellow-400" />
            <span>{t('complete')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MiniGame;
