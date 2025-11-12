import React from 'react';

interface AIAvatarProps {
  isSpeaking: boolean;
}

const AIAvatar: React.FC<AIAvatarProps> = ({ isSpeaking }) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-black relative overflow-hidden">
      {/* Glowing background effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vmin] h-[60vmin] bg-red-900/40 rounded-full blur-3xl animate-[pulse_6s_cubic-bezier(0.4,0,0.6,1)_infinite]" />

      {/* The main SVG Avatar */}
      <div className="relative animate-[float_8s_ease-in-out_infinite]">
        <svg
          width="240"
          height="240"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="0.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-gray-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.3)]"
        >
          {/* --- HEAD --- */}
          <rect
            x="7"
            y="3"
            width="10"
            height="8"
            rx="1.5"
            className="fill-gray-900 stroke-gray-700"
            strokeWidth="0.5"
          />
          {/* Eyes */}
          <circle 
            cx="10" 
            cy="7" 
            r="1" 
            className={`fill-red-500 transition-all duration-200 ${isSpeaking ? 'animate-[eye-glow_0.7s_ease-in-out_infinite]' : ''}`}
          />
          <circle 
            cx="14" 
            cy="7" 
            r="1" 
            className={`fill-red-500 transition-all duration-200 ${isSpeaking ? 'animate-[eye-glow_0.7s_ease-in-out_infinite]' : ''}`}
            style={{ animationDelay: '0.1s' }}
          />

          {/* Mouth */}
          <rect 
            x="10" 
            y="9" 
            width="4" 
            height="0.5" 
            rx="0.25" 
            className={`fill-red-700 transition-transform duration-100 origin-bottom ${isSpeaking ? 'animate-[mouth-talk_0.5s_ease-in-out_infinite]' : 'scale-y-50'}`}
          />

          {/* --- NECK --- */}
          <rect x="11" y="11" width="2" height="2" className="fill-gray-800" />
          
          {/* --- TORSO --- */}
          <path
            d="M 6 13 L 5 19 Q 5 21 7 21 L 17 21 Q 19 21 19 19 L 18 13 Z"
            className="fill-gray-900 stroke-gray-700"
            strokeWidth="0.5"
          />
          
          {/* Power Core */}
          <circle 
            cx="12" 
            cy="16" 
            r="1.5" 
            className={`stroke-red-500 transition-all duration-300 ${isSpeaking ? 'animate-[core-glow_1.5s_ease-in-out_infinite]' : 'fill-gray-800 animate-[core-listen_4s_ease-in-out_infinite]'}`}
            strokeWidth="0.5"
          />

          {/* --- ANTENNA --- */}
          <path d="M 12 3 V 1" className="stroke-gray-600" strokeWidth="0.5" />
          <circle 
            cx="12" 
            cy="1" 
            r="0.5" 
            className={`stroke-red-500 fill-red-500 ${isSpeaking ? 'animate-[antenna-glow_1s_ease-in-out_infinite]' : ''}`}
          />
        </svg>
      </div>

      {/* Custom CSS animations for the avatar */}
      <style>{`
        @keyframes float {
          0% { transform: translateY(0px) rotate(-3deg); }
          50% { transform: translateY(-20px) rotate(3deg); }
          100% { transform: translateY(0px) rotate(-3deg); }
        }
        @keyframes eye-glow {
          0%, 100% { 
            filter: drop-shadow(0 0 2px #ef4444); 
          }
          50% { 
            filter: drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 10px #ef4444);
          }
        }
        @keyframes core-glow {
          0%, 100% { 
            fill: #ef4444;
            filter: drop-shadow(0 0 4px #ef4444); 
          }
          50% { 
            fill: #f87171;
            filter: drop-shadow(0 0 10px #ef4444) drop-shadow(0 0 15px #ef4444);
          }
        }
        @keyframes core-listen {
          0%, 100% { 
            fill-opacity: 0.5;
            filter: drop-shadow(0 0 2px #ef4444);
          }
          50% { 
            fill-opacity: 1;
            filter: drop-shadow(0 0 5px #ef4444);
          }
        }
        @keyframes antenna-glow {
            0%, 100% { 
                filter: drop-shadow(0 0 2px #ef4444); 
            }
            50% { 
                filter: drop-shadow(0 0 6px #ef4444) drop-shadow(0 0 10px #ef4444);
            }
        }
        @keyframes mouth-talk {
          0%, 100% { transform: scaleY(1); }
          25% { transform: scaleY(5); }
          50% { transform: scaleY(2.5); }
          75% { transform: scaleY(6); }
        }
      `}</style>
    </div>
  );
};

export default AIAvatar;
