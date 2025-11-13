
export interface FileData {
  base64: string;
  mimeType: string;
}

export interface Source {
  uri: string;
  title: string;
}

export interface Message {
  role: 'user' | 'model';
  text: string;
  file?: FileData;
  sources?: Source[];
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
}

export interface UserProfile {
  name: string;
  avatar: string | null; // base64 string
}

export interface UserActivity {
  createdAt: string; // ISO date string
  lastLogin: string; // ISO date string
}

export interface User {
  email: string;
  profile: UserProfile;
  chatHistory: ChatSession[];
  activity: UserActivity;
}
