import React from 'react';
import type { Message, FileData } from '../types';
import { UserIcon, BotIcon } from './Icons';

interface MessageBubbleProps {
  message: Message;
}

const MediaPreview: React.FC<{ file: FileData }> = ({ file }) => {
  const src = `data:${file.mimeType};base64,${file.base64}`;
  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isAudio = file.mimeType.startsWith('audio/');

  return (
    <div className="mt-2 rounded-lg overflow-hidden">
      {isImage ? (
        <img src={src} alt="User upload" className="max-w-xs max-h-64 object-contain" />
      ) : isVideo ? (
        <video src={src} controls className="max-w-xs max-h-64" />
      ) : isAudio ? (
        <audio src={src} controls className="w-full max-w-xs" />
      ) : null}
    </div>
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  const isUser = message.role === 'user';

  // Basic markdown for code blocks
  const renderText = (text: string) => {
    const parts = text.split(/(\`\`\`[\s\S]*?\`\`\`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).trim();
        return (
          <pre key={i} className="bg-gray-950 text-white p-3 rounded-md overflow-x-auto my-2 text-sm">
            <code>{code}</code>
          </pre>
        );
      }
      return part.split('\n').map((line, j) => <p key={`${i}-${j}`}>{line}</p>);
    });
  };

  if (!message.text && message.role === 'model' && !message.file) {
      return null;
  }

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-red-600' : 'bg-red-950'}`}>
        {isUser ? <UserIcon className="w-5 h-5" /> : <BotIcon className="w-5 h-5 text-white" />}
      </div>
      <div
        className={`max-w-xs md:max-w-md lg:max-w-2xl px-4 py-3 rounded-2xl ${
          isUser
            ? 'bg-red-700 rounded-br-none'
            : 'bg-red-950 rounded-bl-none'
        }`}
      >
        <div className="prose prose-invert prose-sm text-white whitespace-pre-wrap break-words">
            {message.file && <MediaPreview file={message.file} />}
            {message.text && renderText(message.text)}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;