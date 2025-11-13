
import React, { useState } from 'react';
import { tr } from '../locales/tr';

interface AuthScreenProps {
  authStep: 'email' | 'code';
  verifyingEmail: string;
  onRequestCode: (email: string) => void;
  onVerifyCode: (code: string) => void;
  onChangeEmail: () => void;
  error: string | null;
  simulatedCode: string | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({
  authStep,
  verifyingEmail,
  onRequestCode,
  onVerifyCode,
  onChangeEmail,
  error,
  simulatedCode
}) => {
  const [emailInput, setEmailInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);

  const handleSendCode = () => {
    if (emailInput.trim() && !isSendingCode) {
        setIsSendingCode(true);
        setTimeout(() => {
            onRequestCode(emailInput);
            // State will be reset when component re-renders for the 'code' step
        }, 1500); // Simulate network delay
    }
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleSendCode();
    }
  }

  const handleVerify = () => {
    if (codeInput.trim().length === 6) {
        onVerifyCode(codeInput);
    }
  };

  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
          e.preventDefault();
          handleVerify();
      }
  }

  const commonWrapper = (children: React.ReactNode) => (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm p-8 bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl text-center animate-[fade-in_0.3s_ease-out]">
        <h1 className="text-4xl font-bold tracking-wider text-red-500">Td AI</h1>
        {children}
      </div>
    </div>
  );

  if (authStep === 'email') {
    return commonWrapper(
        <>
          <p className="text-gray-400 mt-2 mb-8">{tr.auth.signInPrompt}</p>
          <div className="flex flex-col gap-4">
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={handleEmailKeyDown}
              placeholder={tr.auth.emailPlaceholder}
              required
              autoFocus
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
            />
            <button
              type="button"
              onClick={handleSendCode}
              disabled={!emailInput.trim() || isSendingCode}
              className="w-full px-4 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSendingCode ? (
                  <>
                    <div className="w-5 h-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                    {tr.auth.sendingCode}
                  </>
              ) : (
                tr.auth.sendVerificationCode
              )}
            </button>
          </div>
        </>
    );
  }

  // authStep === 'code'
  return commonWrapper(
    <>
      <p className="text-gray-400 mt-4 mb-1">{tr.auth.verificationCodePrompt.replace('[email]', verifyingEmail)}</p>
      <button onClick={onChangeEmail} className="text-sm text-red-400 hover:underline mb-6">{tr.auth.changeEmail}</button>
      
      {simulatedCode && (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-lg p-3 text-center mb-6">
          <p className="text-xs text-gray-500 mb-1">{tr.auth.simulatedCodeNotice}</p>
          <p className="text-2xl font-bold tracking-[0.2em] text-white bg-gray-800 rounded py-1">{simulatedCode}</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={handleCodeKeyDown}
          placeholder={tr.auth.enterVerificationCode}
          required
          autoFocus
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white text-center text-2xl tracking-[0.3em] placeholder-gray-500 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition"
        />
        {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        <button
          type="button"
          onClick={handleVerify}
          disabled={codeInput.length < 6}
          className="w-full px-4 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-500 transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
        >
          {tr.auth.verifyAndLogin}
        </button>
      </div>
    </>
  );
};

export default AuthScreen;
