
import React from 'react';
import { tr } from '../locales/tr';
import { CookieIcon } from './Icons';

interface CookieConsentBannerProps {
  onAccept: () => void;
  onDecline: () => void;
}

const CookieConsentBanner: React.FC<CookieConsentBannerProps> = ({ onAccept, onDecline }) => {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 sm:p-6 animate-[slide-up_0.5s_ease-out]">
      <div className="max-w-4xl mx-auto bg-gray-950/80 backdrop-blur-lg border border-gray-800 rounded-2xl shadow-2xl p-4 sm:p-6 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-shrink-0 text-red-500">
          <CookieIcon className="w-10 h-10 sm:w-12 sm:h-12" />
        </div>
        <div className="flex-grow text-center sm:text-left">
          <h3 className="text-lg font-bold text-white">{tr.cookie.title}</h3>
          <p className="text-sm text-gray-400 mt-1">
            {tr.cookie.text}
          </p>
        </div>
        <div className="flex-shrink-0 flex items-center gap-3 mt-4 sm:mt-0">
          <button
            onClick={onDecline}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
          >
            {tr.cookie.decline}
          </button>
          <button
            onClick={onAccept}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            {tr.cookie.accept}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slide-up {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default CookieConsentBanner;
