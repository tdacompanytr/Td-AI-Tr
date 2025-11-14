
import React, { useState, useRef, useEffect } from 'react';
import { SendIcon, PaperclipIcon, XIcon, MusicIcon } from './Icons';

interface ChatInputProps {
  onSendMessage: (prompt: string, file?: File | null) => void;
  isLoading: boolean;
  isCallActive: boolean;
  placeholder: string;
  attachFileLabel: string;
  removeFileLabel: string;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  isLoading, 
  isCallActive,
  placeholder,
  attachFileLabel,
  removeFileLabel
}) => {
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${scrollHeight}px`;
    }
  }, [input]);

  useEffect(() => {
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  }, [file]);
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((input.trim() || file) && !isLoading && !isCallActive) {
      onSendMessage(input.trim(), file);
      setInput('');
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const isDisabled = isLoading || isCallActive;

  return (
    <div className={`bg-gray-950 p-3 rounded-2xl border border-gray-800 shadow-inner transition-opacity ${isCallActive ? 'opacity-50' : 'opacity-100'}`}>
      {filePreview && (
        <div className="relative mb-2 w-32 h-32">
          <button 
            onClick={handleRemoveFile} 
            className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 z-10 hover:bg-gray-700"
            aria-label={removeFileLabel}
            disabled={isDisabled}
          >
            <XIcon className="w-4 h-4" />
          </button>
          {file?.type.startsWith('image/') ? (
            <img src={filePreview} alt="Preview" className="w-full h-full object-cover rounded-lg" />
          ) : file?.type.startsWith('video/') ? (
            <video src={filePreview} className="w-full h-full object-cover rounded-lg" controls />
          ) : file?.type.startsWith('audio/') ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gray-800 rounded-lg p-2 text-center">
                <MusicIcon className="w-12 h-12 text-gray-400" />
                <p className="text-xs text-gray-300 mt-2 break-all">{file.name}</p>
            </div>
          ) : null}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex items-end space-x-3">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,video/*,audio/*"
          disabled={isDisabled}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isDisabled}
          className="w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800 disabled:cursor-not-allowed transition-colors"
          aria-label={attachFileLabel}
        >
          <PaperclipIcon className="w-5 h-5" />
        </button>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent p-2 text-white placeholder-gray-400 focus:outline-none resize-none max-h-40"
          disabled={isDisabled}
        />
        <button
          type="submit"
          disabled={isDisabled || (!input.trim() && !file)}
          className="w-10 h-10 flex-shrink-0 bg-red-600 rounded-full flex items-center justify-center text-white disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors duration-200 hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          {isLoading && !isCallActive ? (
            <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
          ) : (
            <SendIcon className="w-5 h-5" />
          )}
        </button>
      </form>
    </div>
  );
};

export default ChatInput;
