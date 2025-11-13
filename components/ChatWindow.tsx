
import React, { useEffect, useRef } from 'react';
import type { Message } from '../types';
import MessageBubble from './MessageBubble';
import { BotIcon } from './Icons';

interface ChatWindowProps {
  messages: Message[];
  isLoading: boolean;
  isCallActive?: boolean;
  userAvatar: string | null;
}

const TypingIndicator: React.FC = () => (
    <div className="flex items-center space-x-2 p-4 ml-2">
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-950">
          <BotIcon className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center space-x-1.5">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
        </div>
    </div>
);

const ChatWindow: React.FC<ChatWindowProps> = ({ messages, isLoading, isCallActive = false, userAvatar }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const containerClasses = isCallActive
    ? 'absolute bottom-0 left-0 right-0 p-4 md:p-6 space-y-6 max-h-[40%] bg-gradient-to-t from-black/80 to-transparent'
    : 'p-4 md:p-6 space-y-6 h-full';

  return (
    <div ref={scrollRef} className={`overflow-y-auto ${containerClasses}`}>
      {messages
        .filter(msg => !(msg.role === 'model' && !msg.text && !msg.file)) // Don't render empty model messages
        .map((msg, index) => (
          <MessageBubble key={index} message={msg} isCallActive={isCallActive} userAvatar={userAvatar} />
      ))}
      {isLoading && <TypingIndicator />}
    </div>
  );
};

export default ChatWindow;
