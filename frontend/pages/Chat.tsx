import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, Input, SlashDivider } from '../components/ui/ThemeComponents';
import { sendChatMessage } from '../services/gemini';
import { MessageSquare, Send, Loader2 } from 'lucide-react';

interface ChatMsg {
  role: 'user' | 'bot';
  content: string;
}

export const Chat = () => {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: 'bot', content: 'Greetings, warrior. I am your Soul Feast Training Coach. What targets shall we conquer today?' }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userMessage: ChatMsg = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsSending(true);

    try {
      // Map local role to backend expected roles ('user', 'model')
      const backendHistory = [...messages, userMessage].map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        content: m.content
      }));

      const reply = await sendChatMessage(backendHistory);
      setMessages((prev) => [...prev, { role: 'bot', content: reply }]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: `ERROR: Failed to establish contact with Seireitei network: ${err.message || 'Unknown error'}` }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-6 md:p-12 max-w-4xl mx-auto space-y-8 flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      <div>
        <h2 className="font-display text-6xl tracking-widest flex items-center gap-4">
          <MessageSquare className="w-12 h-12 text-white" /> SOUL CHAT.
        </h2>
        <p className="font-mono text-muted uppercase tracking-widest mt-2">Commune with the Chief of Dietetics.</p>
      </div>

      <SlashDivider />

      {/* Messages Panel */}
      <Card className="flex-1 flex flex-col min-h-0 bg-surface border border-border-strong relative">
        <div className="flex-1 overflow-y-auto p-4 space-y-6 min-h-0 scrollbar">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
            >
              <span className="font-mono text-xs text-muted uppercase mb-1">
                [ {msg.role === 'user' ? 'WARRIOR' : 'COACH'} ]
              </span>
              <div
                className={`p-4 font-mono text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'border-2 border-white bg-white text-black'
                    : 'border border-border-strong bg-elevated text-white'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isSending && (
            <div className="flex flex-col max-w-[85%] mr-auto items-start">
              <span className="font-mono text-xs text-muted uppercase mb-1">[ COACH ]</span>
              <div className="p-4 border border-dashed border-border-strong bg-elevated text-muted flex items-center gap-2 font-mono text-sm">
                <Loader2 className="animate-spin w-4 h-4" /> ANALYZING CONVERSATION...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input form */}
        <form onSubmit={handleSend} className="p-4 border-t border-border-strong flex gap-4 bg-primary">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ASK THE BOT ABOUT DIET, FITNESS, OR TRAINING..."
            disabled={isSending}
            className="flex-1"
          />
          <Button type="submit" disabled={isSending || !input.trim()} className="px-6 flex gap-2">
            <Send className="w-4 h-4" /> TRANSMIT
          </Button>
        </form>
      </Card>
    </div>
  );
};
