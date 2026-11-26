import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStoredApplications } from '../lib/loans';
import {
  MessageSquare,
  X,
  Send,
  Bot,
  AlertTriangle,
  CheckCircle2,
  Headset,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface DebugInfo {
  provider: string;
  model: string;
  tools_called: string[];
  error_text: string | null;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: string;
  modeLabel?: string;
  retryable?: boolean;
  retryQuery?: string;
  debugInfo?: DebugInfo;
  actionProposal?: {
    type: 'cancel_application' | 'start_application' | 'navigate';
    applicationId?: string;
    label?: string;
    url?: string;
  };
  actionConfirmed?: boolean;
}

interface FloatingChatbotProps {
  forcedRole?: 'customer' | 'analyst' | 'approver' | 'admin';
  forcedMsisdn?: string;
  forcedAppId?: string;
}

export const FloatingChatbot: React.FC<FloatingChatbotProps> = ({
  forcedRole,
  forcedMsisdn,
  forcedAppId,
}) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState<boolean>(false);
  const [debugCopied, setDebugCopied] = useState<boolean>(false);

  // Stable session ID persisted across page navigation in sessionStorage
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const existing = sessionStorage.getItem('unitel_chat_session_id');
      if (existing) return existing;
      const created = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionStorage.setItem('unitel_chat_session_id', created);
      return created;
    }
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  const handleResetChat = () => {
    const fresh = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem('unitel_chat_session_id', fresh);
    }
    setSessionId(fresh);
    setMessages([
      {
        id: 'welcome-' + Date.now(),
        sender: 'bot',
        text:
          role === 'customer'
            ? "Olá! I am your Unitel Credit Assistant. Ask me about your loan application status, credit score, limits, required documents, or cancellation."
            : `Welcome to the Unitel Underwriting Assistant. You are currently logged in as ${role.toUpperCase()}. Ask about application evaluations, score explanations, portfolio statistics, or underwriting rules.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modeLabel: 'Live Chat',
      },
    ]);
  };

  // Active role detection
  const isApplicantRoute =
    location.pathname.startsWith('/applicant') ||
    location.pathname.startsWith('/portal');

  const defaultRole =
    forcedRole ||
    (isApplicantRoute
      ? 'customer'
      : currentUser?.role === 'admin'
      ? 'admin'
      : currentUser?.role === 'approver'
      ? 'approver'
      : 'customer');

  const [selectedRole, setSelectedRole] = useState<'customer' | 'analyst' | 'approver' | 'admin'>(
    defaultRole
  );
  const role = forcedRole || (isApplicantRoute ? 'customer' : selectedRole);

  const msisdn = forcedMsisdn || (role === 'customer' ? '923111222' : '');
  const applicationId = forcedAppId || (role === 'customer' ? 'APP-1001' : '');

  // Conversation history state
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'bot',
      text:
        role === 'customer'
          ? "Olá! I am your Unitel Credit Assistant. Ask me about your loan application status, credit score, limits, required documents, or cancellation."
          : `Welcome to the Unitel Underwriting Assistant. You are currently logged in as ${role.toUpperCase()}. Ask about application evaluations, score explanations, portfolio statistics, or underwriting rules.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modeLabel: 'Basic chat mode',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: loading ? 'auto' : 'smooth' });
    }
  }, [messages, isOpen, loading]);

  // Suggested prompt chips per role
  const suggestedChips: Record<string, string[]> = {
    customer: [
      'Where is my status?',
      'How is my score calculated?',
      'Why is my limit this low?',
      'What documents do I need?',
      'Cancel my application',
      'Who won the cricket match?',
    ],
    approver: [
      'Why was this rated Fair?',
      'What happened in the last 7 days?',
      'Which applications were rejected this week and why?',
      'Show similar past customers and repayment chance',
    ],
    analyst: [
      'What does the red-flag thing do?',
      'Help with the form fields',
      'What documents are required for KYC?',
      'Why is an application capped at Starter tier?',
    ],
    admin: [
      'What happened in the last 7 days?',
      'Explain the 10 customer segments and their limits',
      'How does K-Means segmentation compare with legacy rules?',
      'What does the red-flag thing do?',
    ],
  };

  // Live SSE streaming handler
  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);

    const botMsgId = `bot-${Date.now()}`;
    let hasCreatedBotMsg = false;

    // Convert full conversation history for API
    const apiMessages = nextMessages.map((m) => ({
      role: m.sender === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiMessages,
          role,
          sessionId,
          msisdn,
          applicationId,
          clientApplications: getStoredApplications(),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat API error (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const payload = JSON.parse(jsonStr);

            // Create bot message on first chunk received
            if (!hasCreatedBotMsg && (payload.chunk || payload.action_proposal || payload.done)) {
              hasCreatedBotMsg = true;
              setMessages((prev) => [
                ...prev,
                {
                  id: botMsgId,
                  sender: 'bot',
                  text: payload.chunk || '',
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                  modeLabel: payload.mode_label || 'Basic chat mode',
                  actionProposal: payload.action_proposal,
                },
              ]);
            } else if (hasCreatedBotMsg) {
              if (payload.chunk) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId ? { ...m, text: m.text + payload.chunk } : m
                  )
                );
              }
              if (payload.action_proposal) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId ? { ...m, actionProposal: payload.action_proposal } : m
                  )
                );
              }
              if (payload.done) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === botMsgId
                      ? {
                          ...m,
                          modeLabel: payload.mode_label || m.modeLabel,
                          retryable: Boolean(payload.retryable),
                          retryQuery: payload.retryable ? query : undefined,
                          debugInfo: {
                            provider: payload.provider || payload.mode || 'unknown',
                            model: payload.model || 'unknown',
                            tools_called: Array.isArray(payload.tools_called) ? payload.tools_called : [],
                            error_text: payload.error_text || null,
                          },
                        }
                      : m
                  )
                );
              }
            }
          } catch {
            // Incomplete JSON line in stream
          }
        }
      }
    } catch (err) {
      console.warn('Streaming chat fetch failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bot',
          text: 'The AI is busy, please try again in a few seconds.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modeLabel: 'AI Busy',
          retryable: true,
          retryQuery: query,
          debugInfo: {
            provider: 'none',
            model: 'none',
            tools_called: [],
            error_text: err instanceof Error ? err.message : 'Network error',
          },
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // "Talk to a human" button creates support ticket in audit log
  const handleTalkToHuman = async () => {
    if (isSubmittingTicket) return;
    setIsSubmittingTicket(true);

    try {
      const res = await fetch('/api/chat/human-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          role,
          msisdn,
          applicationId,
          reason: 'Applicant requested live underwriting specialist assistance via chat widget.',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const ticketMsg: ChatMessage = {
          id: `ticket-${Date.now()}`,
          sender: 'bot',
          text: `Support ticket #${data.ticketId} has been created in the audit log. An underwriting specialist has been alerted to review your case.\n\nTicket Reference: **#${data.ticketId}**`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          modeLabel: 'Support Ticket',
        };
        setMessages((prev) => [...prev, ticketMsg]);
      } else {
        throw new Error('Ticket creation failed');
      }
    } catch {
      const ticketMsg: ChatMessage = {
        id: `ticket-${Date.now()}`,
        sender: 'bot',
        text: 'Support ticket #TICK-DEMO-01 has been logged in the audit trail. An underwriting specialist will contact you on your registered Unitel phone number shortly.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modeLabel: 'Support Ticket',
      };
      setMessages((prev) => [...prev, ticketMsg]);
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // Confirm Cancellation Action
  const handleConfirmCancel = async (msgId: string, targetAppId: string) => {
    try {
      const res = await fetch('/api/chat/confirm-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: targetAppId,
          msisdn,
          role,
        }),
      });

      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId
              ? {
                  ...m,
                  actionConfirmed: true,
                  text: `Application #${targetAppId} has been successfully CANCELLED. A notification email has been dispatched and an immutable audit log entry has been recorded.`,
                }
              : m
          )
        );
      }
    } catch (err) {
      console.error('Cancellation error:', err);
    }
  };

  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\(\/[^)]+\))/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return <strong key={i} className="font-bold">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        return <span key={i} className="font-semibold text-navy">{part.slice(1, -1)}</span>;
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\((\/[^)]+)\)$/);
      if (linkMatch) {
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              setIsOpen(false);
              navigate(linkMatch[2]);
            }}
            className="inline-flex items-center gap-1 font-bold text-orange underline hover:text-orange/80 cursor-pointer"
          >
            {linkMatch[1]}
          </button>
        );
      }
      return <React.Fragment key={i}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 rounded-full bg-orange hover:bg-orange/95 text-white font-bold shadow-lg hover:shadow-xl transition-all duration-200 transform hover:-translate-y-0.5"
          title="Open Unitel Assistant"
        >
          <MessageSquare className="w-5 h-5 text-white" />
          <span className="text-sm">Unitel Assistant</span>
          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white text-orange">
            {role}
          </span>
        </button>
      )}

      {/* Floating Chat Window */}
      {isOpen && (
        <div className="w-[380px] sm:w-[420px] h-[580px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="px-4 py-3 bg-navy text-white flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-orange flex items-center justify-center text-white font-bold shadow-xs">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-tight flex items-center gap-1.5">
                  Unitel Credit Assistant
                </h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-slate-300 capitalize font-medium">
                    {role} • Live Chat
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!forcedRole && !isApplicantRoute && (
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="bg-navy-light text-white text-[10px] font-bold rounded-lg px-2 py-1 border border-white/20 focus:outline-hidden hover:bg-navy-light transition-colors cursor-pointer"
                >
                  <option value="customer" className="bg-navy text-white">Customer</option>
                  <option value="analyst" className="bg-navy text-white">Analyst</option>
                  <option value="approver" className="bg-navy text-white">Approver</option>
                  <option value="admin" className="bg-navy text-white">Admin</option>
                </select>
              )}
              <button
                onClick={handleResetChat}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Start new chat session"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                title="Close chat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Support & Debug Sub-bar */}
          <div className="px-3.5 py-1.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                const lastBotWithDebug = [...messages].reverse().find((m) => m.sender === 'bot' && m.debugInfo);
                const payload = lastBotWithDebug?.debugInfo || {
                  provider: 'none',
                  model: 'none',
                  tools_called: [],
                  error_text: null,
                };
                navigator.clipboard?.writeText(JSON.stringify({ role, sessionId, ...payload }, null, 2));
                setDebugCopied(true);
                setTimeout(() => setDebugCopied(false), 1500);
              }}
              className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 transition-colors"
              title="Copy latest AI provider, model, tools, and error info"
            >
              {debugCopied ? 'Copied debug info!' : 'Copy debug info'}
            </button>
            <button
              onClick={handleTalkToHuman}
              disabled={isSubmittingTicket}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-700 transition-colors border border-slate-200 shadow-2xs disabled:opacity-50"
              title="Request human underwriting agent assistance"
            >
              <Headset className="w-3.5 h-3.5 text-orange" />
              <span>Talk to a human</span>
            </button>
          </div>

          {/* Messages Container */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5 bg-slate-50 text-xs select-text">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl shadow-xs whitespace-pre-wrap leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-orange text-white rounded-br-xs'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-xs'
                  }`}
                >
                  {renderFormattedText(m.text)}

                  {/* Retry Button on AI Busy / Error */}
                  {m.retryable && m.retryQuery && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleSend(m.retryQuery)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange hover:bg-orange/90 text-white font-bold text-xs transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Retry</span>
                      </button>
                    </div>
                  )}

                  {/* Explicit Cancellation Confirmation Action */}
                  {m.actionProposal?.type === 'cancel_application' && !m.actionConfirmed && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
                      <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Confirmation Required:
                      </span>
                      <button
                        onClick={() =>
                          handleConfirmCancel(m.id, m.actionProposal?.applicationId || 'APP-1001')
                        }
                        className="w-full py-2 px-3 rounded-lg bg-orange hover:bg-orange/90 text-white font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Confirm Cancellation of #{m.actionProposal?.applicationId || 'APP-1001'}</span>
                      </button>
                    </div>
                  )}

                  {/* Start Application / Page Navigation Action Button */}
                  {(m.actionProposal?.type === 'start_application' || m.actionProposal?.type === 'navigate') && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-col gap-1.5">
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate(m.actionProposal?.url || '/applicant/new');
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-orange hover:bg-orange/95 text-white font-bold text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                      >
                        <ArrowRight className="w-4 h-4" />
                        <span>{m.actionProposal?.label || 'Open Page'}</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-1 px-1">
                  <span className="text-[10px] text-slate-400">{m.timestamp}</span>
                  {m.modeLabel && (
                    <span className="text-[9px] font-semibold text-slate-500 bg-slate-200/60 px-1 rounded">
                      {m.modeLabel}
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Thinking Indicator while waiting for initial stream response */}
            {loading && !messages.some((m) => m.sender === 'bot' && m.id.startsWith('bot-') && m.text.length > 0 && m.id === messages[messages.length - 1]?.id) && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-white rounded-2xl border border-slate-200 text-slate-500 w-fit shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-orange animate-bounce" />
                <span className="text-[11px] font-medium text-slate-500">thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompt Chips */}
          <div className="px-3 py-2 bg-white border-t border-slate-100 overflow-x-auto no-scrollbar flex items-center gap-1.5">
            {(suggestedChips[role] || suggestedChips.customer).map((chip, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(chip)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors shrink-0 border border-slate-200"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSend();
              }}
              placeholder={
                role === 'customer'
                  ? 'Ask about your status, score, or limits...'
                  : 'Ask about underwriting rules or data...'
              }
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-orange focus:bg-white transition-all"
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="p-2 rounded-xl bg-orange hover:bg-orange/90 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xs"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
