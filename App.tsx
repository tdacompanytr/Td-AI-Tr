
import React, { useState, useEffect, useCallback, useRef } from 'react';
// Fix: 'LiveConnection' is not an exported member of '@google/genai'.
import { Chat, Part, GoogleGenAI, Modality, LiveServerMessage, Blob as GenAI_Blob } from '@google/genai';
import { startChatSession } from './services/geminiService';
import type { Message, FileData } from './types';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import AIAvatar from './components/AIAvatar';
import { VideoIcon, VideoOffIcon, MicrophoneIcon, MicrophoneOffIcon } from './components/Icons';
import { tr } from './locales/tr';


// Fix: Add missing Web Speech API type definitions to resolve compilation errors.
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
  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Video Call State
  const [isCallActive, setIsCallActive] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState<boolean>(false);


  // Voice Command State
  const [isVoiceCommandEnabled, setIsVoiceCommandEnabled] = useState<boolean>(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fix: The specific type for the live connection session is not exported, so using 'any'.
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const speakingTimeoutRef = useRef<number | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const toggleVoiceCommands = () => {
    setIsVoiceCommandEnabled(prev => !prev);
  };

  useEffect(() => {
    // Welcome message initialization
    const welcomeMessages = tr.welcomeMessages;
    const systemInstruction = tr.systemInstruction;

    try {
        const newChat = startChatSession(systemInstruction);
        setChat(newChat);
        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        setMessages([{ role: 'model', text: randomMessage }]);
    } catch (e) {
        console.error(e);
        setError(tr.chatInitError);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Attach stream to video element when it becomes available
    if (localStream && videoRef.current) {
        videoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Effect for handling voice commands
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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

            if (command.includes(tr.startCallCommand)) {
                if (!isCallActive && !isConnecting) {
                    toggleVideoCall();
                }
            } else if (command.includes(tr.endCallCommand)) {
                if (isCallActive) {
                    toggleVideoCall();
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
    const lowerCasePrompt = prompt.toLowerCase();
    const imageGenKeywords = tr.imageGenKeywords;
    const videoGenKeywords = tr.videoGenKeywords;
    const isImagePrompt = !file && imageGenKeywords.some(word => lowerCasePrompt.includes(word));
    const isVideoPrompt = !file && videoGenKeywords.some(word => lowerCasePrompt.includes(word));
    
    if (!chat) {
        setError(tr.chatNotInitError);
        return;
    }

    if (isVideoPrompt) {
        setIsLoading(true);
        setError(null);
        
        const userMessage: Message = { role: 'user', text: prompt };
        const placeholderText = tr.videoGenInProgress;
        setMessages(prevMessages => [...prevMessages, userMessage, { role: 'model', text: placeholderText }]);
        
        try {
            const promptForGemini = `${tr.videoPromptGenerationPrompt}"${prompt}"`;
            // Fix: chat.sendMessage expects an object with a 'message' property.
            const response = await chat.sendMessage({ message: promptForGemini });
            const engineeredPrompt = response.text;

            const finalMessageText = `${tr.videoGenSuccess}\n\n\`\`\`\n${engineeredPrompt}\n\`\`\`\n\n[https://tryveo3.ai/](https://tryveo3.ai/)`;

            setMessages(prev => {
                const newMessages = [...prev];
                const index = newMessages.length - 1;
                if (index > -1 && newMessages[index].text === placeholderText) {
                    newMessages[index] = { role: 'model', text: finalMessageText };
                }
                return newMessages;
            });
        } catch (e: any) {
            console.error(e);
            setError(tr.generalApiError);
            setMessages(prev => {
                const newMessages = [...prev];
                const index = newMessages.length -1;
                 if (index > -1 && newMessages[index].text === placeholderText) {
                    newMessages[index] = { role: 'model', text: `${tr.videoGenError}` };
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }

    } else if (isImagePrompt) {
        setIsLoading(true);
        setError(null);

        const userMessage: Message = { role: 'user', text: prompt };
        const placeholderText = tr.imageGenInProgress;
        
        setMessages(prevMessages => [...prevMessages, userMessage, { role: 'model', text: placeholderText }]);
        
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            const enhancedPrompt = `${tr.imagePromptPrefix}${prompt}`;
            
            const response = await ai.models.generateImages({
                model: 'imagen-4.0-generate-001',
                prompt: enhancedPrompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/png',
                    aspectRatio: '1:1',
                },
            });

            let generatedImage: FileData | null = null;
            if (response.generatedImages && response.generatedImages.length > 0) {
                const image = response.generatedImages[0];
                if (image.image?.imageBytes) {
                    generatedImage = {
                        base64: image.image.imageBytes,
                        mimeType: 'image/png',
                    };
                }
            }
            
            setMessages(prev => {
                const newMessages = [...prev];
                const index = newMessages.length -1; // always the last one
                if (index > -1 && newMessages[index].text === placeholderText) {
                    if (generatedImage) {
                         newMessages[index] = {
                                role: 'model',
                                text: tr.imageGenGreeting,
                                file: generatedImage,
                            };
                    } else {
                         newMessages[index] = { role: 'model', text: tr.imageGenError };
                    }
                }
                return newMessages;
            });

        } catch (e: any) {
            console.error(e);
            setError(tr.generalApiError);
            setMessages(prev => {
                const newMessages = [...prev];
                const index = newMessages.length -1;
                 if (index > -1 && newMessages[index].text === placeholderText) {
                    newMessages[index] = { role: 'model', text: tr.imageGenError };
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    } else {
        // Standard chat logic
        setIsLoading(true);
        setError(null);

        let fileData: FileData | undefined = undefined;
        if (file) {
            try {
                const base64 = await fileToBase64(file);
                fileData = { base64, mimeType: file.type };
            } catch (e) {
                console.error(e);
                setError(tr.fileProcessError);
                setIsLoading(false);
                return;
            }
        }

        const userMessage: Message = { role: 'user', text: prompt, file: fileData };
        setMessages(prevMessages => [...prevMessages, userMessage]);
        
        try {
          const messageParts: (string | Part)[] = [{ text: prompt }];
          if (fileData) {
            messageParts.push({
                inlineData: {
                    data: fileData.base64,
                    mimeType: fileData.mimeType,
                }
            });
          }

          const stream = await chat.sendMessageStream({ message: messageParts });
          
          let fullResponse = '';
          setMessages(prev => [...prev, {role: 'model', text: ''}]);

          for await (const chunk of stream) {
            const chunkText = chunk.text;
            fullResponse += chunkText;
            setMessages(prevMessages => {
              const newMessages = [...prevMessages];
              newMessages[newMessages.length - 1].text = fullResponse;
              return newMessages;
            });
          }
        } catch (e: any) {
          console.error(e);
          setError(tr.generalApiError);
          setMessages(prevMessages => {
              const newMessages = [...prevMessages];
              newMessages[newMessages.length - 1].text = tr.generalApiError;
              return newMessages;
            });
        } finally {
          setIsLoading(false);
        }
    }
  }, [chat]);


  const stopVideoCall = useCallback(() => {
    console.log("Stopping video call...");
    sessionPromiseRef.current?.then(session => session.close());
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
    }
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);

    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    
    // Clear refs
    sessionPromiseRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    frameIntervalRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;
    speakingTimeoutRef.current = null;
    nextStartTimeRef.current = 0;
    audioSourcesRef.current.clear();
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    setIsCallActive(false);
    setIsConnecting(false);
    setIsAiSpeaking(false);
  }, [localStream]);

  const toggleVideoCall = async () => {
    if (isCallActive || isConnecting) {
      stopVideoCall();
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
        },
        video: true
      });
      setLocalStream(stream);

      // We need to re-create the AI instance for Live API
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Puck' },
              },
            },
        },
        callbacks: {
          onopen: () => {
            console.log('Live session opened.');
            setIsConnecting(false);
            setIsCallActive(true);

            // Audio streaming
            mediaStreamSourceRef.current = inputAudioContextRef.current!.createMediaStreamSource(stream);
            scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);

            // Video frame streaming
            const videoEl = videoRef.current;
            const canvasEl = canvasRef.current;
            if (videoEl && canvasEl) {
                frameIntervalRef.current = window.setInterval(() => {
                    const ctx = canvasEl.getContext('2d');
                    if(ctx) {
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
                    }
                }, 1000 / FRAME_RATE);
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle transcriptions
            if (message.serverContent?.inputTranscription) {
                currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'user') {
                        lastMessage.text = currentInputTranscriptionRef.current;
                    } else {
                        newMessages.push({ role: 'user', text: currentInputTranscriptionRef.current });
                    }
                    return newMessages;
                });
            }
            if (message.serverContent?.outputTranscription) {
                currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'model') {
                        lastMessage.text = currentOutputTranscriptionRef.current;
                    } else {
                        newMessages.push({ role: 'model', text: currentOutputTranscriptionRef.current });
                    }
                    return newMessages;
                });
            }
            if (message.serverContent?.turnComplete) {
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
                // Add empty placeholders for the next turn
                setMessages(prev => [...prev, {role: 'user', text:''}])
                setMessages(prev => [...prev, {role: 'model', text:''}])
            }

            // Handle audio output and speaking animation
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
            if (audioData && outputAudioContextRef.current) {
                const outputCtx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                
                setIsAiSpeaking(true);
                if (speakingTimeoutRef.current) {
                    clearTimeout(speakingTimeoutRef.current);
                }
                speakingTimeoutRef.current = window.setTimeout(() => {
                    setIsAiSpeaking(false);
                }, audioBuffer.duration * 1000);

                const source = outputCtx.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputCtx.destination);
                
                audioSourcesRef.current.add(source);
                source.addEventListener('ended', () => {
                    audioSourcesRef.current.delete(source);
                });

                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
            }

            if (message.serverContent?.interrupted) {
                for (const source of audioSourcesRef.current.values()) {
                    source.stop();
                    audioSourcesRef.current.delete(source);
                }
                nextStartTimeRef.current = 0;
                setIsAiSpeaking(false);
                if (speakingTimeoutRef.current) {
                    clearTimeout(speakingTimeoutRef.current);
                }
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e);
            if (e.message && (e.message.toLowerCase().includes('api key') || e.message.toLowerCase().includes('permission denied'))) {
              setError(tr.chatInitError); // Re-use the helpful API key error message
            } else {
              setError(`${tr.videoCallError}${e.message || 'Bilinmeyen bir hata oluştu.'}`);
            }
            stopVideoCall();
          },
          onclose: () => {
            console.log('Live session closed.');
            stopVideoCall();
          },
        },
      });
    } catch (err: any) {
        console.error("Failed to start video call:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError(tr.mediaAccessError);
        } else {
          setError(`${tr.mediaAccessErrorTechnical}${err.message}`);
        }
        setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white font-sans">
      <header className="flex items-center justify-between p-4 bg-gray-950/50 backdrop-blur-sm border-b border-gray-800 shadow-lg sticky top-0 z-10">
        <div className="flex-1 flex items-center">
            {!isCallActive && !isConnecting && (
                <button
                  onClick={toggleVoiceCommands}
                  className="flex items-center space-x-2 text-gray-400 hover:text-white transition-colors rounded-md p-1 -ml-1"
                  aria-label={isVoiceCommandEnabled ? tr.disableVoiceCommands : tr.enableVoiceCommands}
                >
                  {isVoiceCommandEnabled ? (
                    <>
                      <MicrophoneIcon className="w-5 h-5 text-red-500 animate-pulse" />
                      <span className="text-sm hidden md:block">{tr.listening}</span>
                    </>
                  ) : (
                    <>
                      <MicrophoneOffIcon className="w-5 h-5 text-gray-500" />
                      <span className="text-sm hidden md:block">{tr.voiceCommandsOff}</span>
                    </>
                  )}
                </button>
            )}
        </div>
        <h1 className="text-2xl font-bold tracking-wider text-red-500 text-center flex-1">Td AI</h1>
        <div className="flex-1 flex justify-end">
            <button
              onClick={toggleVideoCall}
              disabled={isConnecting}
              className="p-2 rounded-full text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
              aria-label={isCallActive ? tr.endVideoCall : tr.startVideoCall}
            >
              {isConnecting ? (
                 <div className="w-6 h-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
              ) : isCallActive ? (
                <VideoOffIcon className="w-6 h-6 text-red-500" />
              ) : (
                <VideoIcon className="w-6 h-6" />
              )}
            </button>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto relative flex flex-col">
        {isCallActive && <AIAvatar isSpeaking={isAiSpeaking} />}
        <ChatWindow messages={messages} isLoading={isLoading && !isCallActive} isCallActive={isCallActive} />
         {error && (
            <div className="p-4 m-4 bg-red-900/50 border border-red-700 rounded-lg text-red-300 text-center">
              {error}
            </div>
          )}
        {localStream && (
             <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                className={`absolute bottom-4 right-4 w-48 h-36 bg-black rounded-lg shadow-2xl border-2 border-gray-700 object-cover transition-opacity duration-300 ${isCallActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
            />
        )}
        <canvas ref={canvasRef} className="hidden"></canvas>
      </main>
      
      <footer className="p-4 bg-black/80 backdrop-blur-sm sticky bottom-0">
        <ChatInput 
          onSendMessage={handleSendMessage} 
          isLoading={isLoading} 
          isCallActive={isCallActive}
          placeholder={isCallActive ? tr.callActivePlaceholder : tr.messagePlaceholder}
          attachFileLabel={tr.attachFile}
          removeFileLabel={tr.removeFile}
        />
      </footer>
    </div>
  );
};

export default App;
