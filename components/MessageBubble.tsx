import React, { useState, useRef } from 'react';
import type { Message, FileData } from '../types';
import { UserIcon, BotIcon, TranslateIcon, XIcon, VolumeUpIcon, StopCircleIcon } from './Icons';
import { GoogleGenAI, Modality } from "@google/genai";
import { tr } from '../locales/tr';
import SourcesPreview from './SourcesPreview';

// --- TTS Helper Functions ---
function decode(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}
  
async function decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number,
): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
}


interface MessageBubbleProps {
  message: Message;
  isCallActive?: boolean;
  userAvatar: string | null;
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

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isCallActive = false, userAvatar }) => {
  const isUser = message.role === 'user';

  const [translatedText, setTranslatedText] = useState<string | null>(null);
  const [targetLanguageName, setTargetLanguageName] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [showLanguageSelector, setShowLanguageSelector] = useState(false);

  // TTS State
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle');
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
      setTranslationError(tr.translation.error);
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

  const handleStopAudio = () => {
    if (audioSourceRef.current) {
        audioSourceRef.current.onended = null; // Prevent onended from firing on manual stop
        audioSourceRef.current.stop();
        audioSourceRef.current = null;
    }
    setTtsState('idle');
  };

  const handlePlayAudio = async () => {
    setTtsState('loading');
    try {
        if (!process.env.API_KEY) throw new Error("API key not found.");
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: message.text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) throw new Error("No audio data received.");

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;
        await audioContext.resume(); // Ensure context is running

        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);

        audioSourceRef.current = source;
        source.onended = () => {
            setTtsState('idle');
            audioSourceRef.current = null;
        };
        source.start();
        setTtsState('playing');

    } catch (e) {
        console.error("TTS Error:", e);
        setTtsState('error');
        setTimeout(() => setTtsState('idle'), 3000); // Reset after a while
    }
  };

  const togglePlayback = () => {
    if (ttsState === 'playing') {
        handleStopAudio();
    } else if (ttsState === 'idle' || ttsState === 'error') {
        handlePlayAudio();
    }
  };

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
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center overflow-hidden ${isUser ? 'bg-red-600' : 'bg-red-950'}`}>
        {isUser ? (
            userAvatar ? (
                <img src={`data:image/png;base64,${userAvatar}`} alt={tr.profile.avatar} className="w-full h-full object-cover" />
            ) : (
                <UserIcon className="w-5 h-5" />
            )
        ) : (
            <BotIcon className="w-5 h-5 text-white" />
        )}
      </div>
      <div className="relative group flex flex-col items-start">
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

              {/* Web Search Sources */}
              {message.sources && message.sources.length > 0 && (
                <SourcesPreview sources={message.sources} />
              )}

              {/* Translation Section */}
              {(isTranslating || translatedText || translationError) && (
                  <div className="mt-3 pt-3 border-t border-white/20">
                      {isTranslating && <p className="text-xs italic text-gray-400">{tr.translation.translating}</p>}
                      {translationError && <p className="text-xs text-red-400">{translationError}</p>}
                      {translatedText && (
                          <div>
                              <div className="flex justify-between items-center mb-1">
                                  <p className="text-xs text-gray-400">{targetLanguageName} çevirisi:</p>
                                  <button onClick={resetTranslation} className="text-gray-500 hover:text-white" aria-label={tr.translation.originalText}>
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

        {/* Action Buttons: Translate, TTS */}
        {message.text && !isUser && (
            <div className="mt-2 flex items-center gap-2 transition-opacity opacity-50 group-hover:opacity-100">
                {/* TTS Button */}
                <button
                    onClick={togglePlayback}
                    disabled={ttsState === 'loading'}
                    className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white disabled:cursor-wait"
                    aria-label={ttsState === 'playing' ? tr.tts.stop : tr.tts.play}
                >
                    {ttsState === 'loading' && <div className="w-5 h-5 border-2 border-t-transparent border-gray-400 rounded-full animate-spin"></div>}
                    {ttsState === 'playing' && <StopCircleIcon className="w-5 h-5 text-red-400"/>}
                    {(ttsState === 'idle' || ttsState === 'error') && <VolumeUpIcon className="w-5 h-5" />}
                </button>
                
                {/* Translate Button & Popover */}
                {!message.text.startsWith('```') && (
                    <div className="relative">
                        <button
                            onClick={() => setShowLanguageSelector(prev => !prev)}
                            className="p-1.5 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white"
                            aria-label={tr.translation.translate}
                        >
                            <TranslateIcon className="w-5 h-5" />
                        </button>
                        {showLanguageSelector && (
                            <div className={`absolute top-full mt-1 bg-gray-800 rounded-md shadow-lg z-20 p-1 whitespace-nowrap ${isUser ? 'right-0' : 'left-0'}`}>
                                {Object.entries(tr.translation.languages).map(([code, name]) => (
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
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;