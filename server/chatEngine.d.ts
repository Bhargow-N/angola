export function executeTool(toolName: string, args?: any, context?: any): any;
export function executeDeterministicConversation(params: {
  message: string;
  role?: string;
  session?: any;
  dbData?: any;
}): Promise<{
  text: string;
  tools_called: string[];
  mode: string;
  mode_label: string;
  action_proposal?: {
    type: 'cancel_application' | 'start_application';
    applicationId?: string;
    label: string;
    url?: string;
  };
}>;
export function handleStreamingChat(params: {
  messages: Array<{ role: string; content: string }>;
  role?: string;
  sessionId?: string;
  dbData?: any;
  env?: any;
  onChunk: (chunk: string) => void;
  onProposal: (proposal: any) => void;
  onComplete: (meta: { mode: string; mode_label: string }) => void;
}): Promise<void>;
export function getOrCreateSession(sessionId?: string, role?: string): any;
export const executeChatTool: typeof executeTool;
export const handleChatQuery: typeof executeDeterministicConversation;
export const PORTAL_KNOWLEDGE: any[];
export const SEGMENT_DEFINITIONS: Record<string, any>;
export function getLastProviderUsed(): string;
export function setLastProviderUsed(provider: string): void;
export function checkAiProvidersHealth(env?: any): Promise<{
  primary: {
    name: string;
    configured: boolean;
    status: 'ok' | 'failed';
    model: string;
    error?: string;
    latencyMs?: number;
  };
  backup: {
    name: string;
    configured: boolean;
    status: 'ok' | 'failed';
    model: string;
    error?: string;
    latencyMs?: number;
  };
  lastProviderUsed: string;
  timestamp: string;
}>;
