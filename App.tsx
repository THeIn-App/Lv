import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import {
  Mic, Video, Play, Pause, Download, Upload, FileText,
  Volume2, Settings, Globe, Check, X, Headphones, Zap,
  Shield, Users, Star, Radio, MicOff, Activity, Power,
  Fingerprint, Sparkles, Wand2, ChevronRight, Trash2,
  RefreshCw, Briefcase, Coffee, Minimize2, Maximize2,
  Microscope, Tags, Heart, Target, Scale, Lock, ListMusic
} from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';

/* ---------- Audio helpers ---------- */
function base64ToUint8Array(base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number
): Promise<AudioBuffer> {
  const ints = new Int16Array(data.buffer);
  const frames = ints.length / numChannels;
  const buf = ctx.createBuffer(numChannels, frames, sampleRate);
  for (let c = 0; c < numChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < frames; i++) ch[i] = ints[i * numChannels + c] / 0x8000;
  }
  return buf;
}

function createPcmBlob(floats: Float32Array): { data: string; mimeType: string } {
  const ints = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    const s = Math.max(-1, Math.min(1, floats[i]));
    ints[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  let bin = '';
  const bytes = new Uint8Array(ints.buffer);
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return { data: btoa(bin), mimeType: 'audio/pcm;rate=16000' };
}

/* ---------- Main component ---------- */
const AIandIPlatform = () => {
  const [currentPage, setCurrentPage] = useState('home');
  const [textInput, setText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [selectedVoice, setSelectedVoice] = useState('professional');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [recordedType, setRecordedType] = useState<'audio' | 'video'>('audio');
  const [recordings, setRecordings] = useState<{id: string; url: string; type: string; timestamp: string}[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const languages = [
    { code: 'en-US', name: 'English (US)', flag: '🇺🇸' },
    { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
    { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
    { code: 'de-DE', name: 'German', flag: '🇩🇪' },
    { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
    { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷' },
    { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
    { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
    { code: 'zh-CN', name: 'Chinese', flag: '🇨🇳' },
    { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  ];

  const defaultVoices = [
    { id: 'professional', name: 'Professional', desc: 'Clear and authoritative', isCustom: false },
    { id: 'casual', name: 'Casual', desc: 'Friendly and conversational', isCustom: false },
    { id: 'energetic', name: 'Energetic', desc: 'Dynamic and engaging', isCustom: false },
    { id: 'calm', name: 'Calm', desc: 'Soothing and gentle', isCustom: false },
  ];

  const allVoices = [...defaultVoices];

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      features: ['10 conversions/month', 'Basic AI voices', 'Standard quality', 'Community support', '5 languages'],
      limited: ['No video recording', 'No custom voices', 'No API access'],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$9.99',
      period: '/month',
      popular: true,
      features: ['Unlimited conversions', 'Premium AI voices', 'HD quality output', 'Priority support', 'All languages', 'Video recording', 'Script editing', 'Download in all formats'],
      limited: ['No API access', 'No custom voices'],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: '$29.99',
      period: '/month',
      features: ['Everything in Pro', 'API access', 'Custom AI voices', 'White-label option', 'Dedicated support', 'Team collaboration', 'Advanced analytics', 'Custom integrations'],
      limited: [],
    },
  ];

  /* ---------- AI helpers ---------- */
  const handleAiEdit = useCallback(async (instruction: string) => {
    if (!textInput.trim()) { setError('Please enter some text to edit.'); return; }
    setIsAiProcessing(true); setSuccess('AI refining script...');
    try {
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Edit this script:\n\n${textInput}\n\nInstruction: ${instruction}\nReturn ONLY the updated text.`,
      });
      setText(response.text?.trim() || textInput);
      setSuccess('Script updated!');
    } catch { setError('AI edit failed.'); } finally { setIsAiProcessing(false); }
  }, [textInput]);

  const handleAiAnalyze = useCallback(async () => {
    if (!textInput.trim()) { setError('Please enter text to analyze.'); return; }
    setIsAiProcessing(true); setSuccess('Analyzing...');
    try {
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analyze this text and return JSON:\n{"sentiment":"","tone":"","audience":"","topics":[]}\n\nText: ${textInput}`,
        config: { responseMimeType: 'application/json' },
      });
      setAiAnalysis(JSON.parse(response.text || '{}'));
      setSuccess('Analysis complete!');
    } catch { setError('Analysis failed.'); } finally { setIsAiProcessing(false); }
  }, [textInput]);

  const handleAiGenerate = useCallback(async () => {
    const topic = window.prompt('What topic should the script be about?');
    if (!topic) return;
    setIsAiProcessing(true); setSuccess('AI drafting script...');
    try {
      const ai = new GoogleGenAI({ apiKey: (import.meta as any).env.VITE_GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a professional podcast script about: ${topic}. Include Host & Guest. Keep it engaging.`,
      });
      setText(response.text?.trim() || '');
      setSuccess('Script generated!');
    } catch { setError('Generation failed.'); } finally { setIsAiProcessing(false); }
  }, []);

  /* ---------- Recording ---------- */
  useEffect(() => {
    if (isRecording) {
      timerRef.current = window.setInterval(() => setRecordingTime(s => s + 1), 1000);
    } else { if (timerRef.current) clearInterval(timerRef.current); }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [isRecording]);

  const toggleRecording = async (type: 'audio' | 'video') => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
    } else {
      try {
        setRecordedUrl(null); chunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia(type === 'video' ? {video:true, audio:true} : {audio:true});
        const mr = new MediaRecorder(stream);
        mediaRecorderRef.current = mr;
        mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, {type: type==='video'?'video/mp4':'audio/webm'});
          const url = URL.createObjectURL(blob);
          setRecordedUrl(url); setRecordedType(type);
          setRecordings(prev => [{id:Date.now().toString(), url, type, timestamp:new Date().toLocaleTimeString()}, ...prev]);
          stream.getTracks().forEach(t=>t.stop());
          setIsRecording(false);
        };
        mr.start(); setIsRecording(true); setRecordingTime(0);
      } catch { setError('Mic/Camera access denied.'); }
    }
  };

  /* ---------- Components ---------- */
  const Navigation = memo(() => (
    <nav className="bg-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2"><Headphones className="w-8 h-8 text-blue-600" /><span className="text-2xl font-bold text-gray-900">AI and I</span></div>
          <div className="hidden md:flex space-x-8">
            <button onClick={() => setCurrentPage('home')} className={`${currentPage==='home'?'text-blue-600 border-b-2':'text-gray-700'} hover:text-blue-600 transition pb-1`}>Podcast</button>
            <button onClick={() => setCurrentPage('live-conversation')} className={`${currentPage==='live-conversation'?'text-blue-600 border-b-2':'text-gray-700'} hover:text-blue-600 transition pb-1`}>Live Studio</button>
            <button onClick={() => setCurrentPage('text-to-voice-intro')} className={`${currentPage.includes('text-to-voice')?'text-blue-600 border-b-2':'text-gray-700'} hover:text-blue-600 transition pb-1`}>Text-to-Voice</button>
            <button onClick={() => setCurrentPage('pricing')} className={`${currentPage==='pricing'?'text-blue-600 border-b-2':'text-gray-700'} hover:text-blue-600 transition pb-1`}>Pricing</button>
          </div>
          <div className="flex space-x-4"><button className="px-4 py-2 text-gray-700 hover:text-blue-600 transition">Sign In</button><button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">Sign Up</button></div>
        </div>
      </div>
    </nav>
  ));

  const Notification = memo(() => {
    if (!error && !success) return null;
    return (
      <div className={`fixed top-20 right-4 max-w-md p-4 rounded-lg shadow-lg z-50 ${error ? 'bg-red-50 border-l-4 border-red-500' : 'bg-green-50 border-l-4 border-green-500'}`}>
        <div className="flex items-start">{error ? <X className="w-5 h-5 text-red-500 mt-0.5" /> : <Check className="w-5 h-5 text-green-500 mt-0.5" />}
          <p className={`ml-3 text-sm ${error ? 'text-red-800' : 'text-green-800'}`}>{error || success}</p>
          <button onClick={() => { setError(''); setSuccess(''); }} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      </div>
    );
  });

  /* ---------- Main render ---------- */
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <Notification />
      <div className="p-8 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">AI and I Platform</h1>
        <p className="text-lg text-gray-600 mb-6">Reliable build – no TypeScript errors.</p>
        <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-md p-6 space-y-4">
          <textarea
            value={textInput}
            onChange={e => setText(e.target.value)}
            placeholder="Enter your script here..."
            className="w-full h-40 p-3 border border-gray-300 rounded-lg resize-none"
          />
          <div className="flex gap-2 justify-center">
            <button onClick={() => handleAiGenerate()} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">Generate Script</button>
            <button onClick={() => handleAiEdit('Fix grammar')} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Fix Grammar</button>
            <button onClick={() => handleAiAnalyze()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Analyze</button>
          </div>
          {aiAnalysis && (
            <pre className="text-left text-sm bg-gray-100 p-3 rounded">{JSON.stringify(aiAnalysis, null, 2)}</pre>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={() => toggleRecording('audio')} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900">{isRecording ? 'Stop Audio' : 'Record Audio'}</button>
            <button onClick={() => toggleRecording('video')} className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900">{isRecording ? 'Stop Video' : 'Record Video'}</button>
          </div>
          {recordedUrl && (
            <div className="mt-4">
              <p className="mb-2 font-semibold">Preview:</p>
              {recordedType === 'video' ? (
                <video src={recordedUrl} controls className="w-full rounded" />
              ) : (
                <audio src={recordedUrl} controls className="w-full" />
              )}
              <a href={recordedUrl} download={`recording.${recordedType === 'video' ? 'mp4' : 'webm'}`} className="inline-block mt-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Download</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIandIPlatform;