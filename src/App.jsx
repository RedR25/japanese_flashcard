import './App.css'
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Shuffle, RotateCcw, Settings, Check, X } from 'lucide-react';

const HIRAGANA_DATA = [
  { char: 'あ', romaji: 'a' }, { char: 'い', romaji: 'i' }, { char: 'う', romaji: 'u' }, { char: 'え', romaji: 'e' }, { char: 'お', romaji: 'o' },
  { char: 'か', romaji: 'ka' }, { char: 'き', romaji: 'ki' }, { char: 'く', romaji: 'ku' }, { char: 'け', romaji: 'ke' }, { char: 'こ', romaji: 'ko' },
  { char: 'が', romaji: 'ga' }, { char: 'ぎ', romaji: 'gi' }, { char: 'ぐ', romaji: 'gu' }, { char: 'げ', romaji: 'ge' }, { char: 'ご', romaji: 'go' },
  { char: 'さ', romaji: 'sa' }, { char: 'し', romaji: 'shi' }, { char: 'す', romaji: 'su' }, { char: 'せ', romaji: 'se' }, { char: 'そ', romaji: 'so' },
  { char: 'ざ', romaji: 'za' }, { char: 'じ', romaji: 'ji' }, { char: 'ず', romaji: 'zu' }, { char: 'ぜ', romaji: 'ze' }, { char: 'ぞ', romaji: 'zo' },
  { char: 'た', romaji: 'ta' }, { char: 'ち', romaji: 'chi' }, { char: 'つ', romaji: 'tsu' }, { char: 'て', romaji: 'te' }, { char: 'と', romaji: 'to' },
  { char: 'だ', romaji: 'da' }, { char: 'ぢ', romaji: 'di' }, { char: 'づ', romaji: 'du' }, { char: 'で', romaji: 'de' }, { char: 'ど', romaji: 'do' },
  { char: 'な', romaji: 'na' }, { char: 'に', romaji: 'ni' }, { char: 'ぬ', romaji: 'nu' }, { char: 'ね', romaji: 'ne' }, { char: 'の', romaji: 'no' },
  { char: 'は', romaji: 'ha' }, { char: 'ひ', romaji: 'hi' }, { char: 'ふ', romaji: 'fu' }, { char: 'へ', romaji: 'he' }, { char: 'ほ', romaji: 'ho' },
  { char: 'ば', romaji: 'ba' }, { char: 'び', romaji: 'bi' }, { char: 'ぶ', romaji: 'bu' }, { char: 'べ', romaji: 'be' }, { char: 'ぼ', romaji: 'bo' },
  { char: 'ぱ', romaji: 'pa' }, { char: 'ぴ', romaji: 'pi' }, { char: 'ぷ', romaji: 'pu' }, { char: 'ぺ', romaji: 'pe' }, { char: 'ぽ', romaji: 'po' },
  { char: 'ま', romaji: 'ma' }, { char: 'み', romaji: 'mi' }, { char: 'む', romaji: 'mu' }, { char: 'め', romaji: 'me' }, { char: 'も', romaji: 'mo' },
  { char: 'や', romaji: 'ya' }, { char: 'ゆ', romaji: 'yu' }, { char: 'よ', romaji: 'yo' },
  { char: 'ら', romaji: 'ra' }, { char: 'り', romaji: 'ri' }, { char: 'る', romaji: 'ru' }, { char: 'れ', romaji: 're' }, { char: 'ろ', romaji: 'ro' },
  { char: 'わ', romaji: 'wa' }, { char: 'を', romaji: 'wo' }, { char: 'ん', romaji: 'n' }
];

const KATAKANA_DATA = [
  { char: 'ア', romaji: 'a' }, { char: 'イ', romaji: 'i' }, { char: 'ウ', romaji: 'u' }, { char: 'エ', romaji: 'e' }, { char: 'オ', romaji: 'o' },
  { char: 'カ', romaji: 'ka' }, { char: 'キ', romaji: 'ki' }, { char: 'ク', romaji: 'ku' }, { char: 'ケ', romaji: 'ke' }, { char: 'コ', romaji: 'ko' },
  { char: 'ガ', romaji: 'ga' }, { char: 'ギ', romaji: 'gi' }, { char: 'グ', romaji: 'gu' }, { char: 'ゲ', romaji: 'ge' }, { char: 'ゴ', romaji: 'go' },
  { char: 'サ', romaji: 'sa' }, { char: 'シ', romaji: 'shi' }, { char: 'ス', romaji: 'su' }, { char: 'セ', romaji: 'se' }, { char: 'ソ', romaji: 'so' },
  { char: 'ザ', romaji: 'za' }, { char: 'ジ', romaji: 'ji' }, { char: 'ズ', romaji: 'zu' }, { char: 'ゼ', romaji: 'ze' }, { char: 'ゾ', romaji: 'zo' },
  { char: 'タ', romaji: 'ta' }, { char: 'チ', romaji: 'chi' }, { char: 'ツ', romaji: 'tsu' }, { char: 'テ', romaji: 'te' }, { char: 'ト', romaji: 'to' },
  { char: 'ダ', romaji: 'da' }, { char: 'ヂ', romaji: 'di' }, { char: 'ヅ', romaji: 'du' }, { char: 'デ', romaji: 'de' }, { char: 'ド', romaji: 'do' },
  { char: 'ナ', romaji: 'na' }, { char: 'ニ', romaji: 'ni' }, { char: 'ヌ', romaji: 'nu' }, { char: 'ネ', romaji: 'ne' }, { char: 'ノ', romaji: 'no' },
  { char: 'ハ', romaji: 'ha' }, { char: 'ヒ', romaji: 'hi' }, { char: 'フ', romaji: 'fu' }, { char: 'ヘ', romaji: 'he' }, { char: 'ホ', romaji: 'ho' },
  { char: 'バ', romaji: 'ba' }, { char: 'ビ', romaji: 'bi' }, { char: 'ブ', romaji: 'bu' }, { char: 'ベ', romaji: 'be' }, { char: 'ボ', romaji: 'bo' },
  { char: 'パ', romaji: 'pa' }, { char: 'ピ', romaji: 'pi' }, { char: 'プ', romaji: 'pu' }, { char: 'ペ', romaji: 'pe' }, { char: 'ポ', romaji: 'po' },
  { char: 'マ', romaji: 'ma' }, { char: 'ミ', romaji: 'mi' }, { char: 'ム', romaji: 'mu' }, { char: 'メ', romaji: 'me' }, { char: 'モ', romaji: 'mo' },
  { char: 'ヤ', romaji: 'ya' }, { char: 'ユ', romaji: 'yu' }, { char: 'ヨ', romaji: 'yo' },
  { char: 'ラ', romaji: 'ra' }, { char: 'リ', romaji: 'ri' }, { char: 'ル', romaji: 'ru' }, { char: 'レ', romaji: 're' }, { char: 'ロ', romaji: 'ro' },
  { char: 'ワ', romaji: 'wa' }, { char: 'ヲ', romaji: 'wo' }, { char: 'ン', romaji: 'n' }
];

const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const getDataSet = (mode) => {
  switch (mode) {
    case 'hiragana': return HIRAGANA_DATA;
    case 'katakana': return KATAKANA_DATA;
    case 'mixed': return [...HIRAGANA_DATA, ...KATAKANA_DATA];
    default: return HIRAGANA_DATA;
  }
};

const SettingsModal = ({ isOpen, onClose, settings, onSettingsChange }) => {
  if (!isOpen) return null;

  const handleSettingChange = (key, value) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg p-6 w-80 max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Settings</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Mode</label>
            <select 
              value={settings.mode} 
              onChange={(e) => handleSettingChange('mode', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="hiragana">Hiragana</option>
              <option value="katakana">Katakana</option>
              <option value="mixed">Mixed</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Study Direction</label>
            <select 
              value={settings.direction} 
              onChange={(e) => handleSettingChange('direction', e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="char-to-romaji">Character → Romaji</option>
              <option value="romaji-to-char">Romaji → Character</option>
            </select>
          </div>
        </div>
        
        <div className="flex justify-end mt-6">
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

const Flashcard = ({ card, isFlipped, onFlip, direction }) => {
  const front = direction === 'char-to-romaji' ? card.char : card.romaji;
  const back = direction === 'char-to-romaji' ? card.romaji : card.char;
  
  return (
    <div 
      className="w-80 h-48 cursor-pointer perspective-1000"
      onClick={onFlip}
    >
      <div className={`relative w-full h-full transition-transform duration-500 transform-style-preserve-3d ${isFlipped ? 'rotate-y-180' : ''}`}>
        <div className="absolute w-full h-full backface-hidden bg-white border-2 border-gray-200 rounded-lg flex items-center justify-center shadow-lg">
          <span className="text-6xl font-bold text-gray-800">
            {front}
          </span>
        </div>

        <div className="absolute w-full h-full backface-hidden bg-blue-50 border-2 border-blue-200 rounded-lg flex items-center justify-center shadow-lg rotate-y-180">
          <span className="text-4xl font-semibold text-blue-800">
            {back}
          </span>
        </div>
      </div>
    </div>
  );
};

const Stats = ({ correct, total }) => {
  const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
  
  return (
    <div className="flex gap-4 text-center">
      <div className="bg-green-100 p-3 rounded-lg">
        <div className="text-lg font-bold text-green-700">{correct}</div>
        <div className="text-sm text-green-600">Correct</div>
      </div>
      <div className="bg-gray-100 p-3 rounded-lg">
        <div className="text-lg font-bold text-gray-700">{total}</div>
        <div className="text-sm text-gray-600">Total</div>
      </div>
      <div className="bg-blue-100 p-3 rounded-lg">
        <div className="text-lg font-bold text-blue-700">{percentage}%</div>
        <div className="text-sm text-blue-600">Accuracy</div>
      </div>
    </div>
  );
};

export default function HiraganaKatakanaApp() {
  const [settings, setSettings] = useState({
    mode: 'hiragana',
    direction: 'char-to-romaji'
  });
  
  const [showSettings, setShowSettings] = useState(false);
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState({ correct: 0, total: 0 });

  useEffect(() => {
    const dataSet = getDataSet(settings.mode);
    const shuffledCards = shuffleArray(dataSet);
    setCards(shuffledCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStats({ correct: 0, total: 0 }); // bugfix 15/06/2025 - shuffling didnt reset score
  }, [settings]);

  const currentCard = cards[currentIndex];
  
  const handleFlip = useCallback(() => {
    setIsFlipped(!isFlipped);
  }, [isFlipped]);

const handleAnswer = useCallback((isCorrect) => {
  setStats(prev => ({
    correct: prev.correct + (isCorrect ? 1 : 0),
    total: prev.total + 1
  }));

  setIsFlipped(false);
  
  setTimeout(() => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      const dataSet = getDataSet(settings.mode);
      const shuffledCards = shuffleArray(dataSet);
      setCards(shuffledCards);
      setCurrentIndex(0);
    }
  }, 300);
}, [currentIndex, cards.length, settings.mode]);

  const handleShuffle = useCallback(() => {
    const dataSet = getDataSet(settings.mode);
    const shuffledCards = shuffleArray(dataSet);
    setCards(shuffledCards);
    setCurrentIndex(0);
    setIsFlipped(false);
    setStats({ correct: 0, total: 0 }); // bugfix 15/06/2025 - shuffling didnt reset score
  }, [settings.mode]);

  const handleReset = useCallback(() => {
    setStats({ correct: 0, total: 0 });
    setCurrentIndex(0);
    setIsFlipped(false);
  }, []);

  // if (!currentCard) return <div>Loading...</div>;

  // newfeature 15/06/2025 - keyboard shortcuts

  const handleAnswerRef = useRef(handleAnswer);
  handleAnswerRef.current = handleAnswer;

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      }
      if ((e.key === '1' || e.key === '2') && isFlipped) {
        e.preventDefault();
        handleAnswerRef.current(e.key === '2');
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isFlipped]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {!currentCard ? (
      <div>Loading...</div>
    ) : (
      <div className="w-full max-w-md">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">
              Japanese Flashcards
            </h1>
            <img 
              src="/icon.png" 
              alt="App Icon" 
              className="w-8 h-8 bg-gray-100 rounded p-1"
            />
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 text-gray-600 hover:text-gray-800"
          >
            <Settings size={24} />
          </button>
        </div>

        <div className="mb-6">
          <Stats correct={stats.correct} total={stats.total} />
        </div>

        <div className="mb-6">
          <div className="text-sm text-gray-600 mb-2">
            Card {currentIndex + 1} of {cards.length}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="flex justify-center mb-6">
          <Flashcard 
            card={currentCard}
            isFlipped={isFlipped}
            onFlip={handleFlip}
            direction={settings.direction}
          />
        </div>

        {!isFlipped && (
          <div className="text-center text-gray-600 mb-4">
            Tap card to reveal answer
          </div>
        )}

        {isFlipped && (
          <div className="flex gap-4 justify-center mb-6">
            <button
              onClick={() => handleAnswer(false)}
              className="flex items-center gap-2 px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
            >
              <X size={20} />
              Incorrect
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="flex items-center gap-2 px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
            >
              <Check size={20} />
              Correct
            </button>
          </div>
        )}

        <div className="flex gap-4 justify-center">
          <button
            onClick={handleShuffle}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            <Shuffle size={18} />
            Shuffle
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
          >
            <RotateCcw size={18} />
            Reset Stats
          </button>
        </div>
      </div>)}

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}