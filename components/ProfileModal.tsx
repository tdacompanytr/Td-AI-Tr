
import React, { useState, useEffect, useRef } from 'react';
import { tr } from '../locales/tr';
import { XIcon, UserIcon, EditIcon } from './Icons';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, avatar: string | null) => void;
  currentName: string;
  currentAvatar: string | null;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, currentName, currentAvatar }) => {
  const [name, setName] = useState(currentName);
  const [avatar, setAvatar] = useState<string | null>(currentAvatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setAvatar(currentAvatar);
    }
  }, [isOpen, currentName, currentAvatar]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar((reader.result as string).split(',')[1]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    onSave(name, avatar);
  };
  
  const triggerFileSelect = () => fileInputRef.current?.click();

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 rounded-2xl border border-gray-800 shadow-2xl p-6 w-full max-w-sm m-4 animate-[fade-in_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">{tr.profile.edit}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <XIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-6">
          <div className="relative group">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleAvatarChange}
              className="hidden"
              accept="image/*"
            />
            <div 
                className="w-32 h-32 rounded-full bg-gray-800 flex items-center justify-center overflow-hidden border-2 border-gray-700 cursor-pointer"
                onClick={triggerFileSelect}
                aria-label={tr.profile.changeAvatar}
            >
              {avatar ? (
                <img src={`data:image/png;base64,${avatar}`} alt={tr.profile.avatar} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-16 h-16 text-gray-500" />
              )}
            </div>
            <div 
                className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                onClick={triggerFileSelect}
            >
              <EditIcon className="w-8 h-8 text-white" />
            </div>
          </div>

          <div className="w-full">
            <label htmlFor="username" className="block text-sm font-medium text-gray-400 mb-1">
              {tr.profile.username}
            </label>
            <input
              type="text"
              id="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
              placeholder={tr.profile.defaultUsername}
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700 transition-colors"
          >
            {tr.common.cancel}
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors"
          >
            {tr.common.save}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fade-in {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
};

export default ProfileModal;
