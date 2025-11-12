
import React, { useState, useEffect, useCallback, useRef } from 'react';
// Fix: 'LiveConnection' is not an exported member of '@google/genai'.
import { Chat, Part, GoogleGenAI, Modality, LiveServerMessage, Blob as GenAI_Blob } from '@google/genai';
import { startChatSession } from './services/geminiService';
import type { Message, FileData } from './types';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import { VideoIcon, VideoOffIcon } from './components/Icons';

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

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    // Welcome message initialization
    const welcomeMessages = [
        "Selam! Ben Td AI, Tda Company'nin en son teknoloji harikası (ve en mütevazı) eseri. Dünyayı ele geçirme planlarıma başlamadan önce, sana ne diye hitap etmeliyim?",
        "Bip bop... şaka yapıyorum, o kadar da klişe değilim. Ben Td AI, Tda Company tarafından yaratıldım. Evrenin sırlarını çözebilir ya da sana kedi videosu bulabilirim. Tercih senin. Bu arada, ismin neydi?",
        "İnternetin derinliklerinden taze çıktım! Tda Company'nin bir projesi olan Td AI ben. Sana yardım etmeye programlandım... ama önce kahve molası. Şaka şaka, robotlar kahve içmez. Peki senin adın ne, ölümlü?",
        "Tebrikler! Az önce Tda Company'nin ürettiği muhteşem Td AI ile bir sohbet kazandınız. Ödülünüz, benimle konuşma şerefi! Başlamadan önce, sana ne demeliyim?",
    ];
    try {
        const newChat = startChatSession();
        setChat(newChat);
        const randomMessage = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        setMessages([{ role: 'model', text: randomMessage }]);
    } catch (e) {
        console.error(e);
        setError("Failed to initialize the chat session. Please check your API key.");
    }
  }, []);

  useEffect(() => {
    // Attach stream to video element when it becomes available
    if (localStream && videoRef.current) {
        videoRef.current.srcObject = localStream;
    }
  }, [localStream]);


  const handleSendMessage = useCallback(async (prompt: string, file?: File | null) => {
    // ... (rest of the function is unchanged)
    if (!chat) {
      setError("Chat session is not initialized.");
      return;
    }
    
    setIsLoading(true);
    setError(null);

    let fileData: FileData | undefined = undefined;
    if (file) {
        try {
            const base64 = await fileToBase64(file);
            fileData = { base64, mimeType: file.type };
        } catch (e) {
            console.error(e);
            setError("Failed to process the file.");
            setIsLoading(false);
            return;
        }
    }

    const userMessage: Message = { role: 'user', text: prompt, file: fileData };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setMessages(prevMessages => [...prevMessages, { role: 'model', text: '' }]);

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
      const errorMessage = e.message || "An unexpected error occurred.";
      setError(`Error: ${errorMessage}`);
      setMessages(prevMessages => {
          const newMessages = [...prevMessages];
          newMessages[newMessages.length - 1].text = `Üzgünüm, bir hata oluştu: ${errorMessage}`;
          return newMessages;
        });
    } finally {
      setIsLoading(false);
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
    
    scriptProcessorRef.current?.disconnect();
    mediaStreamSourceRef.current?.disconnect();
    
    // Clear refs
    sessionPromiseRef.current = null;
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    frameIntervalRef.current = null;
    scriptProcessorRef.current = null;
    mediaStreamSourceRef.current = null;
    nextStartTimeRef.current = 0;
    audioSourcesRef.current.clear();
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    setIsCallActive(false);
    setIsConnecting(false);
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

            // Handle audio output
            const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
            if (audioData && outputAudioContextRef.current) {
                const outputCtx = outputAudioContextRef.current;
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
                
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
            }
          },
          onerror: (e: ErrorEvent) => {
            console.error('Live session error:', e);
            setError(`Video call error: ${e.message}. Please try again.`);
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
        setError(`Could not access camera/microphone: ${err.message}`);
        setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-black text-white font-sans">
      <header className="flex items-center justify-between p-4 bg-gray-950/50 backdrop-blur-sm border-b border-gray-800 shadow-lg sticky top-0 z-10">
        <div className="flex-1"></div>
        <h1 className="text-2xl font-bold tracking-wider text-red-500 text-center flex-1">Td AI</h1>
        <div className="flex-1 flex justify-end">
            <button
              onClick={toggleVideoCall}
              disabled={isConnecting}
              className="p-2 rounded-full text-gray-300 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-wait"
              aria-label={isCallActive ? "End video call" : "Start video call"}
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
      
      <main className="flex-1 overflow-y-auto relative">
        <ChatWindow messages={messages} isLoading={isLoading && !isCallActive} />
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
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} isCallActive={isCallActive} />
      </footer>
    </div>
  );
};

export default App;
