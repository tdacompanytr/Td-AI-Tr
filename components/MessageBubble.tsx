
import React, { useState } from 'react';
import type { Message, FileData } from '../types';
import { UserIcon, BotIcon, TranslateIcon, XIcon } from './Icons';
import { GoogleGenAI } from "@google/genai";
import { tr } from '../locales/tr';

interface MessageBubbleProps {
  message: Message;
  isCallActive?: boolean;
}

const MediaPreview: React.FC<{ file: FileData }> = ({ file }) => {
  const src = `data:${file.mimeType};base64,${file.base64}`;
  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');

  return (
    <div className="mt-2 rounded-lg overflow-hidden">
      {isImage ? (
        <img src={src} alt="User upload" className="max-w-md max-h-[512px] object-contain" />
      ) : isVideo ? (
        <video src={src} controls className="max-w-md max-h-[512px]" />
      ) : isAudio ? (
        <audio src={src} controls className="w-full max-w-xs" />
      ) : null}
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isCallActive = false }) => {
  const isUser = message.role === 'user';

  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [targetLanguageName, setTargetLanguageName] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  const handleTranslate = async (langCode: string, langName: string) => {
    setShowLanguageSelector(false);
    setIsTranslating(true);
    setTranslatedText(null);
    setTranslationError(null);
    setTargetLanguageName(langName);

    try {
      if (!process.env.API_KEY) {
          throw new Error("API key not found.");
      }
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Translate the following Turkish text to ${langName}. Only return the translated text, without any additional comments, prefixes, or explanations:\n\n"${message.text}"`;
      
      const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
      });

      setTranslatedText(response.text);
    } catch (e) {
      console.error("Translation error:", e);
      setTranslationError(tr.translationError);
    } finally {
      setIsTranslating(false);
    }
  };

  const resetTranslation = () => {
    setTranslatedText(null);
    setTranslationError(null);
    setIsTranslating(false);
    setShowLanguageSelector(false);
    setTargetLanguageName(null);
  }

  const renderText = (text: string) => {
    const codeBlockRegex = /(\`\`\`[\s\S]*?\`\`\`)/g;
    const parts = text.split(codeBlockRegex);

    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).trim();
        return (
          <pre key={i} className="bg-gray-950 text-white p-3 rounded-md overflow-x-auto my-2 text-sm">
            <code>{code}</code>
          </pre>
        );
      }
      
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let lastIndex = 0;
      const elements = [];
      let match;

      while ((match = linkRegex.exec(part)) !== null) {
        // Add text before the link
        if (match.index > lastIndex) {
            elements.push(match.input.substring(lastIndex, match.index));
        }
        // Add the link
        const [fullMatch, linkText, url] = match;
        elements.push(<a href={url} key={`${i}-${lastIndex}`} target="_blank" rel="noopener noreferrer" className="text-red-400 underline hover:text-red-300">{linkText}</a>);
        lastIndex = match.index + fullMatch.length;
      }

      // Add any remaining text after the last link
      if (lastIndex < part.length) {
          elements.push(part.substring(lastIndex));
      }
      
      return elements.map((el, j) => 
        typeof el === 'string' 
        ? el.split('\n').map((line, k) => <p key={`${i}-${j}-${k}`}>{line}</p>) 
        : el
      );
    });
  };

  if (!message.text && message.role === 'model' && !message.file) {
      return null;
  }

  const userBubbleColor = isCallActive ? 'bg-red-700/80' : 'bg-red-700';
  const modelBubbleColor = isCallActive ? 'bg-red-950/80' : 'bg-red-950';

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-red-600' : 'bg-red-950'}`}>
        {isUser ? <UserIcon className="w-5 h-5" /> : <BotIcon className="w-5 h-5 text-white" />}
      </div>
      <div className="relative group">
        <div
          className={`max-w-xs md:max-w-md lg:max-w-2xl px-4 py-3 rounded-2xl ${
            isUser
              ? `${userBubbleColor} rounded-br-none`
              : `${modelBubbleColor} rounded-bl-none`
          }`}
        >
          <div className="prose prose-invert prose-sm text-white whitespace-pre-wrap break-words">
              {message.file && <MediaPreview file={message.file} />}
              {message.text && renderText(message.text)}

              {/* Translation Section */}
              {(isTranslating || translatedText || translationError) && (
                  <div className="mt-3 pt-3 border-t border-white/20">
                      {isTranslating && <p className="text-xs italic text-gray-400">{tr.translating}</p>}
                      {translationError && <p className="text-xs text-red-400">{translationError}</p>}
                      {translatedText && (
                          <div>
                              <div className="flex justify-between items-center mb-1">
                                  <p className="text-xs text-gray-400">{targetLanguageName} çevirisi:</p>
                                  <button onClick={resetTranslation} className="text-gray-500 hover:text-white" aria-label={tr.originalText}>
                                      <XIcon className="w-4 h-4"/>
                                  </button>
                              </div>
                              <div className="prose prose-invert prose-sm text-white whitespace-pre-wrap break-words">
                                  {renderText(translatedText)}
                              </div>
                          </div>
                      )}
                  </div>
              )}
          </div>
        </div>

        {/* Translate Button & Popover */}
        {message.text && !message.text.startsWith('```') && (
            <div className={`absolute top-1/2 -translate-y-1/2 transition-opacity opacity-0 group-hover:opacity-100 ${isUser ? 'left-0 -translate-x-full pr-2' : 'right-0 translate-x-full pl-2'}`}>
                <div className="relative">
                    <button
                        onClick={() => setShowLanguageSelector(prev => !prev)}
                        className="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white"
                        aria-label={tr.translate}
                    >
                        <TranslateIcon className="w-5 h-5" />
                    </button>
                    {showLanguageSelector && (
                        <div className={`absolute top-full mt-1 bg-gray-800 rounded-md shadow-lg z-20 p-1 whitespace-nowrap ${isUser ? 'right-0' : 'left-0'}`}>
                            {Object.entries(tr.languages).map(([code, name]) => (
                                <button
                                    key={code}
                                    onClick={() => handleTranslate(code, name as string)}
                                    className="block w-full text-left px-3 py-1 text-sm text-white hover:bg-red-600 rounded"
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;