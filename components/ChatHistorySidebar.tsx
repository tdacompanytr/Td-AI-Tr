
import React from 'react';
import { tr } from '../locales/tr';
import { PlusIcon, MessageSquareIcon, XIcon, TrashIcon } from './Icons';
import type { ChatSession } from '../types';

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  chatHistory: ChatSession[];
  activeChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

const ChatHistorySidebar: React.FC<ChatHistorySidebarProps> = ({
  isOpen,
  onClose,
  chatHistory,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}) => {
  return (
    <>
      {/* Overlay for mobile */}
      <div 
        className={`fixed inset-0 bg-black/60 z-30 transition-opacity lg:hidden ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <aside 
        className={`absolute lg:static top-0 left-0 h-full bg-gray-950 border-r border-gray-800 w-64 md:w-72 flex flex-col flex-shrink-0 z-40 transition-transform transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">{tr.chatHistory.title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white lg:hidden">
              <XIcon className="w-6 h-6" />
            </button>
        </div>
        <div className="p-2">
            <button
                onClick={onNewChat}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
            >
                {tr.chatHistory.newChat}
                <PlusIcon className="w-5 h-5" />
            </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chatHistory.length > 0 ? (
            chatHistory.map((chat) => (
              <div key={chat.id} className="relative group">
                <button
                  onClick={() => onSelectChat(chat.id)}
                  className={`w-full text-left flex items-center gap-3 pl-3 pr-8 py-2 rounded-lg text-sm transition-colors truncate ${
                    (activeChatId === chat.id || (!activeChatId && chatHistory.indexOf(chat) === -1)) // Fallback for new chat case
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-900 hover:text-white'
                  }`}
                >
                  <MessageSquareIcon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{chat.title}</span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/50 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={tr.chatHistory.delete}
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500 text-sm p-4">
              {tr.chatHistory.empty}
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default ChatHistorySidebar;
