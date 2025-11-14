
import React, { useState, useEffect, useCallback, useRef } from 'react';
// Fix: 'LiveConnection' is not an exported member of '@google/genai'.
import { Chat, Part, GoogleGenAI, Modality, LiveServerMessage, Blob as GenAI_Blob } from '@google/genai';
import { startChatSession, resumeChatSession } from './services/geminiService';
import type { Message, FileData, ChatSession, UserProfile, User, Source } from './types';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import AIAvatar from './components/AIAvatar';
import { VideoIcon, VideoOffIcon, MicrophoneIcon, MicrophoneOffIcon, VolumeUpIcon, VolumeOffIcon, LogoutIcon, MenuIcon, UserIcon } from './components/Icons';
import { tr } from './locales/tr';
import AuthScreen from './components/AuthScreen';
import ChatHistorySidebar from './components/ChatHistorySidebar';
import ProfileModal from './components/ProfileModal';
import CookieConsentBanner from './components/CookieConsentBanner';


// Fix: Add missing Web Speech API type definitions to resolve compilation errors.
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
    // Fix: Add webkitAudioContext to window type definition for cross-browser compatibility.
    webkitAudioContext: typeof AudioContext;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  lang: string;
  interimResults: boolean;
  onresult: (event: SpeechRecognitionEvent) => void;
  onend: () => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly [index: number]: SpeechRecognitionResult;
  readonly length: number;
}

interface SpeechRecognitionResult {
  readonly [index: number]: SpeechRecognitionAlternative;
  readonly length: number;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
}

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = (reader.result as string).split(',')[1];
      resolve(result);
    };
    reader.onerror = (error) => reject(error);
  });

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = (reader.result as string).split(',')[1];
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
});

function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

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
  // Fix: Corrected typo from Int18Array to Int16Array for 16-bit audio data.
  const dataInt16 = new Int16Array(data.buffer);
  // Fix: Corrected typo from dataInt116 to dataInt16.
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

function createBlob(data: Float32Array): GenAI_Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

const FRAME_RATE = 1; // 1 frame per second
const JPEG_QUALITY = 0.7;

// --- Main App Component ---
const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // User Auth State
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [authStep, setAuthStep] = useState<'email' | 'code'>('email');
  const [verifyingEmail, setVerifyingEmail] = useState('');
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);
  const verificationCodeRef = useRef<string | null>(null);
  const [showCookieConsent, setShowCookieConsent] = useState(false);


  // Chat History State
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Video Call State
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [aiVolume, setAiVolume] = useState<number>(1);


  // Voice Command State
  const [isVoiceCommandEnabled, setIsVoiceCommandEnabled] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  
  // Fix: The specific type for the live connection session is not exported, so using 'any'.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputGainNodeRef = useRef<GainNode | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speakingTimeoutRef = useRef<number | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  
  // Singleton chat instance
  const chatRef = useRef<Chat | null>(null);
  
  // Initialize user session on component mount
  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
        setShowCookieConsent(true);
    }
    // Check for logged in user
    const loggedInUser = localStorage.getItem('currentUserEmail');
    if (loggedInUser) {
      handleFinalizeLogin(loggedInUser);
    }
  }, []);
  
  // Close profile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Save the entire user object to localStorage whenever their profile or chat history changes
  useEffect(() => {
    if (currentUserEmail && (chatHistory.length > 0 || currentUserProfile)) {
        try {
            const dbString = localStorage.getItem('td_ai_users_db') || '{}';
            const db = JSON.parse(dbString);
            const user = db[currentUserEmail];

            if (user) {
                user.chatHistory = chatHistory;
                if (currentUserProfile) {
                    user.profile = currentUserProfile;
                }
                localStorage.setItem('td_ai_users_db', JSON.stringify(db));
            }
        } catch (e) {
            console.error("Failed to save user data:", e);
        }
    }
  }, [chatHistory, currentUserProfile, currentUserEmail]);

  
  // When active chat changes, update the displayed messages
  useEffect(() => {
    if (activeChatId) {
        const activeChat = chatHistory.find(c => c.id === activeChatId);
        setMessages(activeChat?.messages || []);
    } else {
        // This is a new chat, start with a welcome message
        const welcomeMessages = tr.welcomeMessages;
        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        setMessages([{ role: 'model', text: randomMessage }]);
    }
  }, [activeChatId, chatHistory]);

  // Effect to manage the active chat instance based on history and active chat ID
  useEffect(() => {
    if (!currentUserEmail) return;

    setError(null);
    try {
      if (activeChatId) {
        const activeChat = chatHistory.find(c => c.id === activeChatId);
        const historyToResume = activeChat?.messages.filter(m => m.text || m.file) || [];

        if (activeChat && historyToResume.length > 0) {
          // Resume existing chat with its history
          chatRef.current = resumeChatSession(tr.systemInstruction, historyToResume);
        } else {
          // Handles new chats that have an ID but no messages yet, or corrupted chats.
          chatRef.current = startChatSession(tr.systemInstruction);
        }
      } else {
        // This is a new chat session (activeChatId is null)
        chatRef.current = startChatSession(tr.systemInstruction);
      }
    } catch (e: any) {
      console.error("Failed to initialize or resume chat session:", e);
      if (e.message === 'API_KEY_MISSING') {
        setError(tr.common.apiKeyMissingError);
      } else {
        setError(tr.common.chatInitError);
      }
    }
  }, [activeChatId, chatHistory, currentUserEmail]);

  const handleAcceptCookies = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setShowCookieConsent(false);
  };

  const handleDeclineCookies = () => {
      localStorage.setItem('cookieConsent', 'declined');
      setShowCookieConsent(false);
  };

  const handleRequestCode = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) return;
    
    // In a real app, you would call your backend to send an email.
    // Here, we simulate it by generating a code and showing it on the UI.
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodeRef.current = code;
    setSimulatedCode(code);

    setVerifyingEmail(normalizedEmail);
    setAuthStep('code');
    setVerificationError(null);
  };

  const handleVerifyCode = (code: string) => {
    if (code === verificationCodeRef.current) {
      setVerificationError(null);
      handleFinalizeLogin(verifyingEmail);
    } else {
      setVerificationError(tr.auth.invalidCodeError);
    }
  };

  const handleChangeEmail = () => {
    setAuthStep('email');
    setVerifyingEmail('');
    verificationCodeRef.current = null;
    setVerificationError(null);
    setSimulatedCode(null);
  };
  
  const handleFinalizeLogin = (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    localStorage.setItem('currentUserEmail', normalizedEmail);

    try {
        const dbString = localStorage.getItem('td_ai_users_db') || '{}';
        const db = JSON.parse(dbString);
        let user: User = db[normalizedEmail];

        const now = new Date().toISOString();

        if (!user) {
            // New user registration
            user = {
                email: normalizedEmail,
                profile: {
                    name: normalizedEmail.split('@')[0],
                    avatar: null
                },
                chatHistory: [],
                activity: {
                    createdAt: now,
                    lastLogin: now,
                }
            };
        } else {
            // Existing user login
            user.activity.lastLogin = now;
        }

        db[normalizedEmail] = user;
        localStorage.setItem('td_ai_users_db', JSON.stringify(db));

        // Set state from the loaded/created user object
        setCurrentUserEmail(user.email);
        setCurrentUserProfile(user.profile);
        setChatHistory(user.chatHistory);

        if (user.chatHistory.length > 0) {
            // Activate the most recent chat
            setActiveChatId(user.chatHistory[0].id);
        } else {
            // New user, start a new chat session
            handleNewChat();
        }

    } catch (e) {
        console.error("Failed to load or create user data:", e);
        // Fallback for corrupted data
        const profile = { name: normalizedEmail.split('@')[0], avatar: null };
        setCurrentUserEmail(normalizedEmail);
        setCurrentUserProfile(profile);
        handleNewChat();
    }
  };
  
  const handleNewChat = useCallback(() => {
    setActiveChatId(null);
    setIsSidebarOpen(false);
  }, []);

  const handleSelectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
    setIsSidebarOpen(false);
  }, []);

  const handleDeleteChat = useCallback((chatId: string) => {
    if (window.confirm(tr.chatHistory.deleteConfirm)) {
      setChatHistory(prev => prev.filter(chat => chat.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    }
  }, [activeChatId]);

  const handleSaveProfile = (name: string, avatar: string | null) => {
    if (!currentUserEmail) return;
    const updatedProfile = { name, avatar };
    setCurrentUserProfile(updatedProfile);
    setIsProfileModalOpen(false);
    // The useEffect will handle saving this to the main DB
  };


  const handleLogout = useCallback(() => {
    localStorage.removeItem('currentUserEmail');
    setCurrentUserEmail(null);
    setCurrentUserProfile(null);
    setMessages([]);
    setChatHistory([]);
    setActiveChatId(null);
    setIsProfileMenuOpen(false);
    setAuthStep('email');
    setVerifyingEmail('');
    setSimulatedCode(null);
  }, []);

  const toggleVoiceCommands = () => {
    setIsVoiceCommandEnabled(prev => !prev);
  };

  useEffect(() => {
    // Attach stream to video element when it becomes available
    if (isCallActive && localStream && videoRef.current) {
        videoRef.current.srcObject = localStream;
    }
  }, [localStream, isCallActive]);

  // Effect for handling voice commands
  useEffect(() => {
    // Fix: Use type-safe access to window.SpeechRecognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech Recognition not supported by this browser.");
      return;
    }

    if (!recognitionRef.current) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.lang = 'tr-TR';
        recognition.interimResults = false;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const last = event.results.length - 1;
            const command = event.results[last][0].transcript.toLowerCase().trim();
            
            console.log("Heard command:", command);

            if (command.includes(tr.app.startCallCommand)) {
                if (!isCallActive && !isConnecting) {
                    startVideoCall();
                }
            } else if (command.includes(tr.app.endCallCommand)) {
                if (isCallActive) {
                    stopVideoCall();
                }
            }
        };
        
        recognition.onend = () => {
            if (isVoiceCommandEnabled && !isCallActive && !isConnecting) {
                try {
                   recognition.start();
                } catch (e) {
                   console.error("Error restarting speech recognition:", e);
                }
            }
        };
        
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
             console.error("Speech recognition error:", event.error);
        };

        recognitionRef.current = recognition;
    }
    
    const recognition = recognitionRef.current;
    
    try {
        if (isVoiceCommandEnabled && !isCallActive && !isConnecting) {
            recognition.start();
        } else {
            recognition.stop();
        }
    } catch (e: any) {
        if (e.name !== 'InvalidStateError') {
             console.error("Could not start/stop speech recognition:", e);
        }
    }
    
    return () => {
      recognition?.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallActive, isConnecting, isVoiceCommandEnabled]);
  
  const handleSendMessage = useCallback(async (prompt: string, file?: File | null) => {
    // Common logic for adding user message and setting loading state
    setIsLoading(true);
    setError(null);
    
    let fileData: FileData | undefined = undefined;
    if (file) {
        try {
            const base64 = await fileToBase64(file);
            fileData = { base64, mimeType: file.type };
        } catch (e) {
            console.error(e);
            setError(tr.common.fileProcessError);
            setIsLoading(false);
            return;
        }
    }

    const userMessage: Message = { role: 'user', text: prompt, file: fileData };
    
    // Determine if this is a new chat
    const isNewChat = !activeChatId;
    let currentChatId = activeChatId;

    // Add user message to the state
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // If it's a new chat, create it and generate a title
    if (isNewChat) {
        const newChatId = Date.now().toString();
        currentChatId = newChatId;
        
        // Optimistically create the chat with a placeholder title
        const newChatSession: ChatSession = {
            id: newChatId,
            title: prompt.substring(0, 30) + '...',
            messages: updatedMessages,
        };
        
        const newHistory = [newChatSession, ...chatHistory];
        setChatHistory(newHistory);
        setActiveChatId(newChatId);

        // Asynchronously generate a proper title
        try {
            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                throw new Error('API_KEY_MISSING');
            }
            const ai = new GoogleGenAI({ apiKey });
            const titlePrompt = `${tr.chat.titlePrompt}"${prompt}"`;
            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: titlePrompt,
            });
            const chatTitle = result.text.replace(/["']/g, ""); // Clean up quotes
            
            // Update the chat session with the new title
            setChatHistory(prev => prev.map(c => c.id === newChatId ? {...c, title: chatTitle} : c));
            
        } catch (e: any) {
            console.error("Error generating chat title:", e);
            if (e.message === 'API_KEY_MISSING') {
                setError(tr.common.apiKeyMissingError);
            }
            // The placeholder title remains, which is fine.
        }
    } else {
        // Update existing chat
        setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: updatedMessages } : c));
    }

    const lowerCasePrompt = prompt.toLowerCase();
    const urlRegex = /https?:\/\/[^\s]+/g;
    const containsUrl = urlRegex.test(prompt);
    const isSearchQuery = tr.webSearch.keywords.some(word => lowerCasePrompt.includes(word));
    const isWebSearch = containsUrl || (isSearchQuery && !file);

    const imageGenKeywords = tr.imageGen.keywords;
    const videoGenKeywords = tr.videoGen.keywords;
    const isImagePrompt = !file && !isWebSearch && imageGenKeywords.some(word => lowerCasePrompt.includes(word));
    const isVideoPrompt = !file && !isWebSearch && videoGenKeywords.some(word => lowerCasePrompt.includes(word));
    
    if (isWebSearch) {
        const placeholderText = containsUrl ? tr.webSearch.analyzingURL : tr.webSearch.searchingInternet;
        const placeholderMessage: Message = { role: 'model', text: placeholderText };
        setMessages(prev => [...prev, placeholderMessage]);
        setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, placeholderMessage] } : c));
        
        // Enhancement: If the prompt is just a URL, add a specific instruction for the model.
        const urlMatch = prompt.trim().match(/^https?:\/\/[^\s]+$/);
        const finalPrompt = urlMatch ? `${tr.webSearch.summarizeUrlPrompt} ${prompt.trim()}` : prompt;

        try {
            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                throw new Error('API_KEY_MISSING');
            }
            const ai = new GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: finalPrompt,
                config: {
                  tools: [{googleSearch: {}}],
                },
            });

            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
            const sources: Source[] = groundingChunks
                .map((chunk: any) => ({
                    uri: chunk.web?.uri || '',
                    title: chunk.web?.title || '',
                }))
                .filter(source => source.uri);

            const finalModelMessage: Message = { role: 'model', text: response.text, sources: sources };
            
            setMessages(prev => [...updatedMessages, finalModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, finalModelMessage] } : c));
        } catch (e: any) {
            console.error("Web search error:", e);
            if (e.message === 'API_KEY_MISSING') {
                setError(tr.common.apiKeyMissingError);
            } else {
                setError(tr.common.generalApiError);
            }
            const errorModelMessage = { role: 'model' as const, text: tr.common.generalApiError };
            setMessages(prev => [...updatedMessages, errorModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, errorModelMessage] } : c));
        } finally {
            setIsLoading(false);
        }

    } else if (isVideoPrompt) {
        const placeholderText = tr.videoGen.inProgress;
        setMessages(prev => [...prev, { role: 'model', text: placeholderText }]);
        setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, { role: 'model', text: placeholderText }] } : c));
        
        try {
            const chat = chatRef.current;
            if (!chat) throw new Error("Chat not initialized");
            const promptForGemini = `${tr.videoGen.promptGenerationPrompt}"${prompt}"`;
            const response = await chat.sendMessage({ message: promptForGemini });
            const engineeredPrompt = response.text;

            const finalMessageText = `${tr.videoGen.success}\n\n\`\`\`\n${engineeredPrompt}\n\`\`\`\n\n[https://tryveo3.ai/](https://tryveo3.ai/)`;
            const finalModelMessage = { role: 'model' as const, text: finalMessageText };

            setMessages(prev => [...updatedMessages, finalModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, finalModelMessage] } : c));
        } catch (e: any) {
            console.error(e);
            setError(tr.common.generalApiError);
            const errorModelMessage = { role: 'model' as const, text: `${tr.videoGen.error}` };
            setMessages(prev => [...updatedMessages, errorModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, errorModelMessage] } : c));
        } finally {
            setIsLoading(false);
        }

    } else if (isImagePrompt) {
        const placeholderText = tr.imageGen.inProgress;
        setMessages(prev => [...prev, { role: 'model', text: placeholderText }]);
        setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, { role: 'model', text: placeholderText }] } : c));
        
        try {
            const apiKey = process.env.API_KEY;
            if (!apiKey) {
                throw new Error('API_KEY_MISSING');
            }
            const ai = new GoogleGenAI({ apiKey });
            const getRandomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
            
            const style = getRandomItem(tr.imageGen.styles);
            const atmosphere = getRandomItem(tr.imageGen.atmospheres);
            const detail = getRandomItem(tr.imageGen.details);
            
            const engineeredPrompt = `${style}: ${prompt}, ${atmosphere}, ${detail}`;

            const result = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: {
                    parts: [{ text: engineeredPrompt }],
                },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });
            
            const firstPart = result.candidates?.[0]?.content?.parts?.[0];
            if (firstPart?.inlineData) {
                const imageData: FileData = {
                    base64: firstPart.inlineData.data,
                    mimeType: firstPart.inlineData.mimeType,
                };
                const imageModelMessage: Message = { role: 'model', text: tr.imageGen.greeting, file: imageData };
                setMessages(prev => [...updatedMessages, imageModelMessage]);
                setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, imageModelMessage] } : c));
            } else {
                 throw new Error("No image data received from API");
            }
        } catch (e: any) {
            console.error(e);
            if (e.message === 'API_KEY_MISSING') {
                setError(tr.common.apiKeyMissingError);
            }
            const errorModelMessage = { role: 'model' as const, text: tr.imageGen.error };
            setMessages(prev => [...updatedMessages, errorModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, errorModelMessage] } : c));
        } finally {
            setIsLoading(false);
        }

    } else {
        // Regular text prompt or prompt with file
        const chat = chatRef.current;
        if (!chat) {
            setError(tr.common.chatNotInitError);
            setIsLoading(false);
            return;
        }
        try {
            let messageContent: string | (string | Part)[];
            if (fileData) {
              messageContent = [
                prompt,
                {
                  inlineData: {
                    data: fileData.base64,
                    mimeType: fileData.mimeType,
                  },
                },
              ];
            } else {
              messageContent = prompt;
            }

            const streamingResponse = await chat.sendMessageStream({
              message: messageContent,
            });

            let modelResponse = '';
            setMessages(prev => [...prev, { role: 'model', text: '...' }]);
            for await (const chunk of streamingResponse) {
                modelResponse += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1] = { role: 'model', text: modelResponse };
                    return newMessages;
                });
            }
            
            const finalModelMessage: Message = { role: 'model', text: modelResponse };
            setMessages(prev => [...updatedMessages, finalModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, finalModelMessage] } : c));

        } catch (e: any) {
            console.error(e);
            setError(tr.common.generalApiError);
            const errorModelMessage = { role: 'model' as const, text: tr.common.generalApiError };
            setMessages(prev => [...updatedMessages, errorModelMessage]);
            setChatHistory(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: [...updatedMessages, errorModelMessage] } : c));
        } finally {
            setIsLoading(false);
        }
    }
  }, [messages, activeChatId, chatHistory]);

  const startVideoCall = async () => {
    setIsConnecting(true);
    setError(null);
    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            throw new Error('API_KEY_MISSING');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 },
            audio: {
                sampleRate: 16000,
                channelCount: 1,
            },
        });
        setLocalStream(stream);

        inputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        outputAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        outputGainNodeRef.current = outputAudioContextRef.current.createGain();
        outputGainNodeRef.current.connect(outputAudioContextRef.current.destination);

        const ai = new GoogleGenAI({ apiKey });
        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    console.log("Live session opened.");
                    setIsConnecting(false);
                    setIsCallActive(true);

                    // Add a welcome message from the AI in the chat
                    const callStartMessage = { role: 'model' as const, text: "Görüntülü görüşme başladı! "};
                    
                    if (activeChatId) {
                        setChatHistory(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, callStartMessage] } : c));
                    } else {
                        // This case is unlikely if a chat is always active, but as a fallback:
                        const newChatId = Date.now().toString();
                        const newChatSession: ChatSession = { id: newChatId, title: "Video Call", messages: [...messages, callStartMessage] };
                        setChatHistory(prev => [newChatSession, ...prev]);
                        setActiveChatId(newChatId);
                    }


                    // Start sending audio
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    mediaStreamSourceRef.current = source;
                    const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            if (!isMuted) {
                                session.sendRealtimeInput({ media: pcmBlob });
                            }
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current!.destination);

                    // Start sending video frames
                    const videoEl = videoRef.current;
                    const canvasEl = canvasRef.current;
                    if (videoEl && canvasEl) {
                        const ctx = canvasEl.getContext('2d');
                        if (ctx) {
                            frameIntervalRef.current = window.setInterval(() => {
                                canvasEl.width = videoEl.videoWidth;
                                canvasEl.height = videoEl.videoHeight;
                                ctx.drawImage(videoEl, 0, 0, videoEl.videoWidth, videoEl.videoHeight);
                                canvasEl.toBlob(
                                    async (blob) => {
                                        if (blob) {
                                            const base64Data = await blobToBase64(blob);
                                            sessionPromiseRef.current?.then((session) => {
                                                session.sendRealtimeInput({
                                                    media: { data: base64Data, mimeType: 'image/jpeg' }
                                                });
                                            });
                                        }
                                    },
                                    'image/jpeg',
                                    JPEG_QUALITY
                                );
                            }, 1000 / FRAME_RATE);
                        }
                    }
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                        setIsAiSpeaking(true);
                        if(speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
                        speakingTimeoutRef.current = window.setTimeout(() => setIsAiSpeaking(false), 2000);

                        const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                        const audioContext = outputAudioContextRef.current!;
                        const gainNode = outputGainNodeRef.current!;
                        
                        nextStartTimeRef.current = Math.max(
                          nextStartTimeRef.current,
                          audioContext.currentTime,
                        );

                        const audioBuffer = await decodeAudioData(
                          decode(base64Audio),
                          audioContext,
                          24000,
                          1,
                        );

                        const source = audioContext.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(gainNode);
                        source.addEventListener('ended', () => {
                          audioSourcesRef.current.delete(source);
                        });
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioSourcesRef.current.add(source);
                    }
                     
                    // Handle transcription
                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                    }

                    if (message.serverContent?.turnComplete) {
                        const userTurn = currentInputTranscriptionRef.current.trim();
                        const modelTurn = currentOutputTranscriptionRef.current.trim();
                        
                        const newMessages: Message[] = [];
                        if (userTurn) {
                            newMessages.push({ role: 'user', text: userTurn });
                        }
                        if (modelTurn) {
                            newMessages.push({ role: 'model', text: modelTurn });
                        }
                        
                        if(newMessages.length > 0) {
                            if(activeChatId) {
                               setChatHistory(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, ...newMessages] } : c));
                            }
                        }

                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                    }

                    if (message.serverContent?.interrupted) {
                        for (const source of audioSourcesRef.current.values()) {
                            source.stop();
                        }
                        audioSourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    setError(`${tr.videoCall.error}${e.message}`);
                    stopVideoCall();
                },
                onclose: () => {
                    console.log("Live session closed.");
                    stopVideoCall();
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: tr.systemInstruction,
            },
        });

    } catch (e: any) {
        if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
            setError(tr.videoCall.mediaAccessError);
        } else if (e.message === 'API_KEY_MISSING') {
            setError(tr.common.apiKeyMissingError);
        } else {
            setError(`${tr.videoCall.mediaAccessErrorTechnical}${e.message}`);
        }
        console.error(e);
        stopVideoCall();
    }
  };

  const stopVideoCall = useCallback(() => {
    setIsConnecting(false);
    setIsCallActive(false);

    sessionPromiseRef.current?.then(session => session.close());
    sessionPromiseRef.current = null;
    
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);

    if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
    }
    
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    
    inputAudioContextRef.current?.close();
    outputAudioContextRef.current?.close();
    
    for (const source of audioSourcesRef.current.values()) {
        source.stop();
    }
    audioSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    const callEndMessage = { role: 'model' as const, text: "Görüntülü görüşme bitti." };
    if(activeChatId) {
       setChatHistory(prev => prev.map(c => c.id === activeChatId ? { ...c, messages: [...c.messages, callEndMessage] } : c));
    }

  }, [localStream, activeChatId]);
  
  const toggleMute = () => setIsMuted(prev => !prev);
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseFloat(e.target.value);
    setAiVolume(newVolume);
    if (outputGainNodeRef.current) {
        outputGainNodeRef.current.gain.value = newVolume;
    }
  };


  return (
    <>
      {showCookieConsent ? (
        <CookieConsentBanner onAccept={handleAcceptCookies} onDecline={handleDeclineCookies} />
      ) : !currentUserEmail ? (
        <AuthScreen
            authStep={authStep}
            verifyingEmail={verifyingEmail}
            onRequestCode={handleRequestCode}
            onChangeEmail={handleChangeEmail}
            onVerifyCode={handleVerifyCode}
            error={verificationError}
            simulatedCode={simulatedCode}
        />
      ) : (
        <>
          <div className="flex h-screen text-white font-sans">
            <ChatHistorySidebar 
              isOpen={isSidebarOpen}
              onClose={() => setIsSidebarOpen(false)}
              chatHistory={chatHistory}
              activeChatId={activeChatId}
              onNewChat={handleNewChat}
              onSelectChat={handleSelectChat}
              onDeleteChat={handleDeleteChat}
            />
            
            <ProfileModal 
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
                onSave={handleSaveProfile}
                currentName={currentUserProfile?.name || ''}
                currentAvatar={currentUserProfile?.avatar || null}
            />

            <main className="flex-1 flex flex-col bg-gray-900 relative">
              {/* Header */}
              <header className="flex items-center justify-between p-4 border-b border-gray-800 absolute top-0 left-0 right-0 bg-gray-900/80 backdrop-blur-sm z-10">
                <div className="flex items-center gap-2">
                    <button onClick={() => setIsSidebarOpen(true)} className="text-gray-400 hover:text-white lg:hidden">
                      <MenuIcon className="w-6 h-6" />
                    </button>
                    <h1 className="text-xl font-bold tracking-wider text-red-500">Td AI</h1>
                </div>
                
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2 text-sm text-gray-400">
                    <span className={`w-2 h-2 rounded-full ${isVoiceCommandEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></span>
                    <span>{isVoiceCommandEnabled ? tr.app.listening : tr.app.voiceCommandsOff}</span>
                  </div>
                  <button onClick={toggleVoiceCommands} className="text-gray-400 hover:text-white" aria-label={isVoiceCommandEnabled ? tr.app.disableVoiceCommands : tr.app.enableVoiceCommands}>
                      {isVoiceCommandEnabled ? <MicrophoneIcon className="w-5 h-5" /> : <MicrophoneOffIcon className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={isCallActive ? stopVideoCall : startVideoCall}
                    disabled={isConnecting}
                    className="p-2 rounded-full bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-50"
                    aria-label={isCallActive ? tr.videoCall.end : tr.videoCall.start}
                  >
                    {isConnecting ? (
                      <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                    ) : isCallActive ? (
                      <VideoOffIcon className="w-5 h-5 text-red-400" />
                    ) : (
                      <VideoIcon className="w-5 h-5" />
                    )}
                  </button>

                  {currentUserProfile && (
                    <div className="relative">
                      <button onClick={() => setIsProfileMenuOpen(prev => !prev)} className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden">
                            {currentUserProfile.avatar ? (
                              <img src={`data:image/png;base64,${currentUserProfile.avatar}`} alt="User Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <UserIcon className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <span className="hidden sm:inline text-sm font-medium">{currentUserProfile.name}</span>
                      </button>
                      {isProfileMenuOpen && (
                        <div ref={profileMenuRef} className="absolute right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-lg z-20 overflow-hidden animate-[fade-in_0.1s_ease-out]">
                          <button onClick={() => { setIsProfileModalOpen(true); setIsProfileMenuOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-red-600">
                            {tr.profile.edit}
                          </button>
                          <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-white hover:bg-red-600 flex items-center gap-2">
                            <LogoutIcon className="w-4 h-4" />
                            {tr.auth.logout}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </header>
              
              <div className="flex-1 flex flex-col pt-20"> {/* pt-20 for header height */}
                {isCallActive ? (
                  <div className="flex-1 flex flex-col md:flex-row relative">
                     <div className="absolute top-2 left-2 z-10 bg-black/50 px-2 py-1 rounded-md text-sm">{tr.videoCall.participantAI}</div>
                     <AIAvatar isSpeaking={isAiSpeaking} />
                     <div className="relative w-full md:w-1/4 aspect-video md:aspect-auto border-t-2 md:border-t-0 md:border-l-2 border-red-900">
                       <div className="absolute top-2 left-2 z-10 bg-black/50 px-2 py-1 rounded-md text-sm">{currentUserProfile?.name || tr.videoCall.participantYou}</div>
                       <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover"></video>
                     </div>
                     <canvas ref={canvasRef} className="hidden"></canvas>
                     {/* Call Controls */}
                     <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/50 backdrop-blur-sm p-3 rounded-full">
                        <button onClick={toggleMute} className={`p-3 rounded-full ${isMuted ? 'bg-red-600' : 'bg-gray-700'} hover:bg-gray-600`}>
                            {isMuted ? <MicrophoneOffIcon className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6"/>}
                        </button>
                        <div className="relative group flex items-center gap-2">
                            {aiVolume > 0 ? <VolumeUpIcon className="w-6 h-6 text-gray-300"/> : <VolumeOffIcon className="w-6 h-6 text-gray-500"/>}
                            <input 
                                type="range" 
                                min="0" 
                                max="1" 
                                step="0.05" 
                                value={aiVolume}
                                onChange={handleVolumeChange}
                                className="w-24 opacity-0 group-hover:opacity-100 transition-opacity absolute left-full ml-2"
                                aria-label={tr.videoCall.aiVolume}
                            />
                        </div>
                        <button onClick={stopVideoCall} className="p-3 rounded-full bg-red-800 hover:bg-red-700">
                            <VideoOffIcon className="w-6 h-6"/>
                        </button>
                     </div>
                  </div>
                ) : (
                    <div className="flex-1 flex flex-col justify-end min-h-0">
                        <ChatWindow messages={messages} isLoading={isLoading} userAvatar={currentUserProfile?.avatar || null} />
                    </div>
                )}
                
                <div className={`p-4 md:p-6 w-full max-w-4xl mx-auto ${isCallActive ? 'absolute bottom-0 left-0 right-0' : ''}`}>
                  {error && <div className="bg-red-900/50 border border-red-500 text-red-300 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
                  <ChatInput
                    onSendMessage={handleSendMessage}
                    isLoading={isLoading}
                    isCallActive={isCallActive}
                    placeholder={isCallActive ? tr.videoCall.activePlaceholder : tr.chat.placeholder}
                    attachFileLabel={tr.chat.attachFile}
                    removeFileLabel={tr.chat.removeFile}
                  />
                </div>
              </div>
            </main>
          </div>
          <style>{`
            /* Custom scrollbar for webkit browsers */
            .overflow-y-auto::-webkit-scrollbar {
              width: 8px;
            }
            .overflow-y-auto::-webkit-scrollbar-track {
              background: transparent;
            }
            .overflow-y-auto::-webkit-scrollbar-thumb {
              background-color: rgba(139, 0, 0, 0.5); /* Darker red */
              border-radius: 20px;
              border: 3px solid transparent;
              background-clip: content-box;
            }
            .overflow-y-auto::-webkit-scrollbar-thumb:hover {
                background-color: rgba(185, 28, 28, 0.7); /* Red-700 */
            }
            /* Custom styles for volume slider */
            input[type=range] { -webkit-appearance: none; background: transparent; }
            input[type=range]::-webkit-slider-runnable-track { height: 4px; background: #4b5563; border-radius: 2px; }
            input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; margin-top: -6px; width: 16px; height: 16px; background: #fff; border-radius: 50%; border: 1px solid #ddd; cursor: pointer; }
            input[type=range]::-moz-range-track { height: 4px; background: #4b5563; border-radius: 2px; }
            input[type=range]::-moz-range-thumb { width: 16px; height: 16px; background: #fff; border-radius: 50%; border: 1px solid #ddd; cursor: pointer; }
            
            @keyframes fade-in {
                from { opacity: 0; transform: scale(0.98); }
                to { opacity: 1; transform: scale(1); }
            }
          `}</style>
        </>
      )}
    </>
  );
};

export default App;
