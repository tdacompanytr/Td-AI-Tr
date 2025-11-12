
import React from 'react';
import type { Message, FileData } from '../types';
import { UserIcon, BotIcon } from './Icons';

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
      const linkParts = part.split(linkRegex);

      return linkParts.map((linkPart, j) => {
        if (j % 3 === 1) { // This will be the link text
          const url = linkParts[j + 1];
          return <a href={url} key={`${i}-${j}`} target="_blank" rel="noopener noreferrer" className="text-red-400 underline hover:text-red-300">{linkPart}</a>;
        }
        if (j % 3 === 2) { // This will be the URL, which we've already used
            return null;
        }
        // Render normal text with newlines
        return linkPart.split('\n').map((line, k) => <p key={`${i}-${j}-${k}`}>{line}</p>);
      });
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
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;
