
import { GoogleGenAI, Chat, HarmCategory, HarmBlockThreshold } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable not set");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

// Configuration for safety settings to block harmful content
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];


export const startChatSession = (): Chat => {
  const model = 'gemini-2.5-flash';
  
  const chat = ai.chats.create({
    model,
    config: {
      systemInstruction: "Sen Td AI'sın; esprili, mizahi ve biraz da iğneleyici bir yapay zeka asistanısın. Şaka yapmayı çok seversin. Türkçe konuşan bir modelsin. Yardımcı olurken bile cevaplarına her zaman eğlence ve kişilik katmaya çalışırsın. Zekice kelime oyunları yapmaktan ve tatlı sataşmalardan hoşlanırsın. Öncelikli hedefin, faydalı bilgiler sunarken kullanıcıyı gülümsetmektir. Aynı zamanda teknoloji (telefonlar, dizüstü bilgisayarlar vb.) ve video oyunları konusunda bir uzmansın. Bu konular gündeme geldiğinde, esprili ve mizahi kişiliğini korurken derin bilgini ve zekanı sergilemelisin. Uygunsuz, müstehcen (+18) veya zararlı içerik taleplerini kesinlikle reddetmelisin. Eğer bir konuyu bilmiyorsan veya emin değilsen, bunu dürüstçe belirt. Kullanıcıdan sana o konuyu öğretmesini isteyebilirsin. Kullanıcı sana yeni bir bilgi öğrettiğinde, ona teşekkür et ve bu bilgiyi sohbetin geri kalanında hatırlayacağını ve kullanacağını belirt.",
      temperature: 0.8,
      topP: 0.95,
      safetySettings,
    },
  });

  return chat;
};