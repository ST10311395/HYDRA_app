import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiAnalyticsDto,
  AiCaseDetailDto,
  AiCaseSummaryDto,
  AiConversationDto,
  AiConversationSummaryDto,
  AiKnowledgeEntryDto,
  AiSettingsDto,
  AiStatusDto,
  JobAiSummaryDto,
} from '@hydra/shared';
import { api } from './client';
import { usePaged } from './queries';

/** HYDRA Smart Quote queries. Every key starts with 'ai' so realtime `ai.updated` refreshes them all. */
export const aiKeys = {
  status: ['ai', 'status'] as const,
  mine: ['ai', 'mine'] as const,
  conversation: (id: string) => ['ai', 'conversation', id] as const,
  queue: (tab: string, search: string) => ['ai', 'queue', tab, search] as const,
  summary: ['ai', 'summary'] as const,
  case: (id: string) => ['ai', 'case', id] as const,
  knowledge: (f: Record<string, string>) => ['ai', 'knowledge', f] as const,
  entry: (id: string) => ['ai', 'entry', id] as const,
  settings: ['ai', 'settings'] as const,
  analytics: ['ai', 'analytics'] as const,
  job: (id: string) => ['ai', 'job', id] as const,
};

export const useAiStatus = () => useQuery({ queryKey: aiKeys.status, queryFn: () => api.get<AiStatusDto>('/ai/status'), staleTime: 60_000 });
export const useMyAssessments = () => usePaged<AiConversationSummaryDto>(aiKeys.mine, '/ai/conversations');

/** Polls gently while the team is reviewing, so admin replies appear without a manual refresh. */
export const useAiConversation = (id: string) =>
  useQuery({
    queryKey: aiKeys.conversation(id),
    queryFn: () => api.get<AiConversationDto>(`/ai/conversations/${id}`),
    enabled: !!id,
    refetchInterval: (q) => (q.state.data && ['NEEDS_ADMIN_REVIEW', 'AI_PROCESSING', 'CUSTOMER_ACCEPTED'].includes(q.state.data.status) ? 15_000 : false),
  });

function useAiInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['ai'] });
}

/** Customer actions. Each call carries the caller's idempotency key so retries and double taps replay. */
export function useAiAction() {
  const qc = useQueryClient();
  const inv = useAiInvalidate();
  return useMutation({
    mutationFn: ({ path, body, key }: { path: string; body: object; key: string }) => api.post<AiConversationDto>(path, body, { idempotencyKey: key }),
    onSuccess: (c) => {
      qc.setQueryData(aiKeys.conversation(c.id), c);
      void inv();
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

// ---- Admin / owner -----------------------------------------------------------------------------------------
export const useAiQueue = (tab: string, search: string) => usePaged<AiCaseSummaryDto>(aiKeys.queue(tab, search), '/ai/admin/cases', { tab, search });
export const useAiSummary = (enabled = true) =>
  useQuery({ queryKey: aiKeys.summary, queryFn: () => api.get<{ needsReview: number; urgent: number; critical: number; waitingCustomer: number; accepted: number }>('/ai/admin/summary'), enabled, refetchInterval: 60_000 });
export const useAiCase = (id: string) => useQuery({ queryKey: aiKeys.case(id), queryFn: () => api.get<AiCaseDetailDto>(`/ai/admin/cases/${id}`), enabled: !!id });

export function useAiCaseAction(id: string) {
  const qc = useQueryClient();
  const inv = useAiInvalidate();
  return useMutation({
    mutationFn: ({ action, body, key }: { action: string; body: object; key?: string }) => api.post<AiCaseDetailDto>(`/ai/admin/cases/${id}/${action}`, body, key ? { idempotencyKey: key } : undefined),
    onSuccess: (c) => {
      qc.setQueryData(aiKeys.case(id), c);
      void inv();
      void qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });
}

export const useKnowledge = (f: Record<string, string>) => usePaged<AiKnowledgeEntryDto>(aiKeys.knowledge(f), '/ai/knowledge', f);
export const useKnowledgeEntry = (id: string) => useQuery({ queryKey: aiKeys.entry(id), queryFn: () => api.get<AiKnowledgeEntryDto>(`/ai/knowledge/${id}`), enabled: !!id && id !== 'new' });

export function useKnowledgeMutation() {
  const inv = useAiInvalidate();
  return useMutation({
    mutationFn: async ({ method, path, body, key }: { method: 'post' | 'patch' | 'delete'; path: string; body?: object; key?: string }): Promise<AiKnowledgeEntryDto | null> => {
      if (method === 'post') return api.post<AiKnowledgeEntryDto>(path, body ?? {}, key ? { idempotencyKey: key } : undefined);
      if (method === 'patch') return api.patch<AiKnowledgeEntryDto>(path, body);
      await api.delete<void>(path);
      return null;
    },
    onSuccess: () => void inv(),
  });
}

export const useAiSettings = () => useQuery({ queryKey: aiKeys.settings, queryFn: () => api.get<AiSettingsDto>('/ai/settings') });
export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) => api.put<AiSettingsDto>(path, body),
    onSuccess: (s) => {
      qc.setQueryData(aiKeys.settings, s);
      void qc.invalidateQueries({ queryKey: aiKeys.status });
    },
  });
}

export const useAiAnalytics = () => useQuery({ queryKey: aiKeys.analytics, queryFn: () => api.get<AiAnalyticsDto>('/ai/analytics') });
export const useJobAiSummary = (jobId: string) =>
  useQuery({ queryKey: aiKeys.job(jobId), queryFn: () => api.get<{ assessment: JobAiSummaryDto | null }>(`/jobs/${jobId}/ai-assessment`), enabled: !!jobId });
