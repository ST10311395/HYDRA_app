import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type {
  AdminDashboardDto,
  AuditLogDto,
  AuthUser,
  ContactQueryDto,
  ContactQueryInput,
  CustomerDashboardDto,
  CustomerDto,
  DepartmentContactDto,
  DiscountDto,
  EmployeeAvailabilityDto,
  EmployeeDto,
  EmployeeTodayDto,
  ExportLogDto,
  FaqDto,
  FileRefDto,
  InspectionReportDto,
  InvoiceDto,
  JobDetailDto,
  JobSummaryDto,
  LeaveRequestDto,
  MaterialDto,
  MessageLogDto,
  MissedCallDto,
  NotificationDto,
  OfficeDto,
  Paginated,
  PartnerDto,
  PaymentDto,
  PayrollDto,
  PayrollPreviewLineDto,
  PortfolioItemDto,
  PublicContentDto,
  QrTokenDto,
  QuoteDto,
  ReportSummaryDto,
  RewardsSummaryDto,
  RewardTransactionDto,
  ScheduleEventDto,
  ServiceTypeDto,
  SettingsDto,
  StockMovementDto,
  TeamMemberDto,
  TimesheetDto,
} from '@hydra/shared';
import { api } from './client';
import { useAuth } from '../store/auth';

type Q = Record<string, string | number | boolean | undefined | null>;

export const qk = {
  publicContent: ['public-content'] as const,
  services: (f?: Q) => ['service-types', f ?? {}] as const,
  service: (id: string) => ['service-types', id] as const,
  portfolio: (f?: Q) => ['portfolio', f ?? {}] as const,
  project: (id: string) => ['portfolio', id] as const,
  faqs: (c?: string) => ['faqs', c ?? 'all'] as const,
  partners: (f?: Q) => ['partners', f ?? {}] as const,
  team: (f?: Q) => ['team', f ?? {}] as const,
  offices: ['offices'] as const,
  departments: ['departments'] as const,
  me: ['me'] as const,
  profile: ['profile'] as const,
  jobs: (f?: Q) => ['jobs', f ?? {}] as const,
  job: (id: string) => ['job', id] as const,
  quotes: (f?: Q) => ['quotes', f ?? {}] as const,
  quote: (id: string) => ['quote', id] as const,
  invoices: (f?: Q) => ['invoices', f ?? {}] as const,
  invoice: (id: string) => ['invoice', id] as const,
  payments: ['payments'] as const,
  payment: (id: string) => ['payment', id] as const,
  rewards: ['rewards'] as const,
  rewardTx: ['rewards', 'tx'] as const,
  discounts: ['discounts'] as const,
  inspections: ['inspection-reports'] as const,
  inspection: (id: string) => ['inspection-report', id] as const,
  notifications: ['notifications'] as const,
  customerDash: ['dashboard', 'customer'] as const,
  employeeDash: ['dashboard', 'employee'] as const,
  adminDash: ['dashboard', 'admin'] as const,
  schedule: (f?: Q) => ['schedules', f ?? {}] as const,
  timesheets: (f?: Q) => ['timesheets', f ?? {}] as const,
  currentShift: ['timesheets', 'current'] as const,
  leave: (f?: Q) => ['leave', f ?? {}] as const,
  materials: (f?: Q) => ['materials', f ?? {}] as const,
  movements: (f?: Q) => ['stock-movements', f ?? {}] as const,
  material: (id: string) => ['material', id] as const,
  employee: (id: string) => ['employee', id] as const,
  adminDiscounts: ['discounts', 'admin'] as const,
  employees: (s?: string) => ['employees', s ?? ''] as const,
  availability: (start: string, end: string) => ['availability', start, end] as const,
  customers: (s?: string) => ['customers', s ?? ''] as const,
  customer: (id: string) => ['customer', id] as const,
  enquiries: (f?: Q) => ['enquiries', f ?? {}] as const,
  enquiry: (id: string) => ['enquiry', id] as const,
  missedCalls: (f?: Q) => ['missed-calls', f ?? {}] as const,
  missedCall: (id: string) => ['missed-call', id] as const,
  missedStatus: ['missed-calls', 'status'] as const,
  messageLogs: ['message-logs'] as const,
  payroll: (f?: Q) => ['payroll', f ?? {}] as const,
  settings: ['settings'] as const,
  report: (from: string, to: string) => ['report', from, to] as const,
  exports: ['exports'] as const,
  audit: (f?: Q) => ['audit', f ?? {}] as const,
  staff: ['staff'] as const,
  dataRequests: ['data-requests'] as const,
};

// ---- Public -----------------------------------------------------------------------------------
export const usePublicContent = () => useQuery({ queryKey: qk.publicContent, queryFn: () => api.get<PublicContentDto>('/public-content'), staleTime: 3_600_000 });
export const useServices = (f: Q = {}) => useQuery({ queryKey: qk.services(f), queryFn: () => api.get<ServiceTypeDto[]>('/service-types', f), staleTime: 600_000 });
export const useService = (id: string) => useQuery({ queryKey: qk.service(id), queryFn: () => api.get<ServiceTypeDto>(`/service-types/${id}`), enabled: !!id });
export const usePortfolio = (f: Q = {}) => useQuery({ queryKey: qk.portfolio(f), queryFn: () => api.get<PortfolioItemDto[]>('/portfolio', f), staleTime: 600_000 });
export const useProject = (id: string) => useQuery({ queryKey: qk.project(id), queryFn: () => api.get<PortfolioItemDto>(`/portfolio/${id}`), enabled: !!id });
export const useFaqs = (category?: string) => useQuery({ queryKey: qk.faqs(category), queryFn: () => api.get<FaqDto[]>('/faqs', { category }), staleTime: 3_600_000 });
export const usePartners = (f: Q = {}) => useQuery({ queryKey: qk.partners(f), queryFn: () => api.get<PartnerDto[]>('/partners', f), staleTime: 600_000 });
export const useTeam = (f: Q = {}) => useQuery({ queryKey: qk.team(f), queryFn: () => api.get<TeamMemberDto[]>('/team', f), staleTime: 600_000 });
export const useOffices = () => useQuery({ queryKey: qk.offices, queryFn: () => api.get<OfficeDto[]>('/offices'), staleTime: 3_600_000 });
export const useDepartments = () => useQuery({ queryKey: qk.departments, queryFn: () => api.get<DepartmentContactDto[]>('/departments'), staleTime: 3_600_000 });

export function useSubmitEnquiry() {
  return useMutation({ mutationFn: (input: ContactQueryInput) => api.post<{ id: string; reference: string }>('/contact-queries', input) });
}

// ---- Generic helpers ------------------------------------------------------------------------------
/** Infinite paginated list (cursor = page number) — scalable list pattern (spec §23). */
export function usePaged<T>(key: QueryKey, path: string, filters: Q = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: [...key, 'paged'],
    queryFn: ({ pageParam }) => api.get<Paginated<T>>(path, { ...filters, page: pageParam, pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    enabled,
  });
}

export function flatten<T>(data: { pages: Paginated<T>[] } | undefined): T[] {
  return data?.pages.flatMap((p) => p.items) ?? [];
}

function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: QueryKey[]) => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: k })));
}

// ---- Profile & notifications ---------------------------------------------------------------------
/**
 * The signed-in user's persisted profile (GET /profile). The fetched copy also refreshes the
 * session user, so the header avatar/initials and greetings never show stale names.
 */
export const useProfile = () =>
  useQuery({
    queryKey: qk.profile,
    queryFn: async () => {
      const u = await api.get<AuthUser>('/profile');
      const s = useAuth.getState();
      if (s.status === 'signedIn' && s.user?.id === u.id) s.setUser(u);
      return u;
    },
  });

export const useMe = (enabled = true) => useQuery({ queryKey: qk.me, queryFn: () => api.get<AuthUser>('/auth/me'), enabled });
export const useNotifications = () => usePaged<NotificationDto>(qk.notifications, '/notifications');

export function useMarkNotification() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string | 'all') => (id === 'all' ? api.post('/notifications/read-all') : api.post(`/notifications/${id}/read`)),
    onSuccess: () => inv(qk.notifications, ['dashboard']),
  });
}

// ---- Dashboards ---------------------------------------------------------------------------------
export const useCustomerDashboard = () => useQuery({ queryKey: qk.customerDash, queryFn: () => api.get<CustomerDashboardDto>('/dashboard/customer') });
export const useEmployeeToday = () => useQuery({ queryKey: qk.employeeDash, queryFn: () => api.get<EmployeeTodayDto>('/dashboard/employee'), networkMode: 'offlineFirst' });
export const useAdminDashboard = () => useQuery({ queryKey: qk.adminDash, queryFn: () => api.get<AdminDashboardDto>('/dashboard/admin'), refetchInterval: 60_000 });

// ---- Jobs -----------------------------------------------------------------------------------------
export const useJobs = (f: Q = {}) => usePaged<JobSummaryDto>(qk.jobs(f), '/jobs', f);
export const useJob = (id: string) => useQuery({ queryKey: qk.job(id), queryFn: () => api.get<JobDetailDto>(`/jobs/${id}`), enabled: !!id, networkMode: 'offlineFirst' });

/** Mutations that return an updated job detail; caches are refreshed consistently. */
export function useJobAction<TVars>(fn: (vars: TVars) => Promise<JobDetailDto | { job: JobDetailDto }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res) => {
      const job = 'job' in res ? res.job : res;
      qc.setQueryData(qk.job(job.id), job);
      void qc.invalidateQueries({ queryKey: ['jobs'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      void qc.invalidateQueries({ queryKey: ['schedules'] });
      void qc.invalidateQueries({ queryKey: ['materials'] });
    },
  });
}

export function useCreateJob() {
  const inv = useInvalidate();
  return useMutation({
    /** `idempotencyKey` must stay the same for retries of one request (double tap, timeout retry) so the API replays instead of duplicating. */
    mutationFn: ({ idempotencyKey, ...input }: Record<string, unknown> & { idempotencyKey: string }) => api.post<JobDetailDto>('/jobs', input, { idempotencyKey }),
    onSuccess: () => inv(['jobs'], ['dashboard']),
  });
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async ({ uri, name, mimeType, purpose }: { uri: string; name: string; mimeType: string; purpose: string }) => {
      const form = new FormData();
      form.append('purpose', purpose);
      form.append('file', { uri, name, type: mimeType } as unknown as Blob);
      return api.upload<FileRefDto>('/files', form);
    },
  });
}

/** Each fetch mints a fresh token (the previous one is expired server-side); never cached or retried in the background. */
export const useQr = (jobId: string, enabled: boolean) =>
  useQuery({ queryKey: ['qr', jobId], queryFn: () => api.get<QrTokenDto>(`/jobs/${jobId}/qr`), enabled, gcTime: 0, staleTime: Infinity, retry: false });

// ---- Quotes -----------------------------------------------------------------------------------------
export const useQuote = (id: string) => useQuery({ queryKey: qk.quote(id), queryFn: () => api.get<QuoteDto>(`/quotes/${id}`), enabled: !!id });

export function useQuoteResponse() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: 'accept' | 'decline'; reason?: string }) =>
      api.post<QuoteDto>(`/quotes/${id}/${decision}`, decision === 'decline' ? { reason } : {}),
    onSuccess: (q) => inv(qk.quote(q.id), qk.job(q.jobId), ['jobs'], ['dashboard']),
  });
}

// ---- Billing ------------------------------------------------------------------------------------
export const useInvoices = (f: Q = {}) => usePaged<InvoiceDto>(qk.invoices(f), '/invoices', f);
export const useInvoice = (id: string) => useQuery({ queryKey: qk.invoice(id), queryFn: () => api.get<InvoiceDto>(`/invoices/${id}`), enabled: !!id });
export const usePayments = () => usePaged<PaymentDto>(qk.payments, '/payments');
export const usePaymentStatus = (id: string | null) =>
  useQuery({ queryKey: qk.payment(id ?? ''), queryFn: () => api.get<PaymentDto>(`/payments/${id}`), enabled: !!id, refetchInterval: (q) => (q.state.data?.status === 'PENDING' ? 3000 : false) });

export function useStartPayment() {
  return useMutation({
    mutationFn: ({ invoiceId, amount, key }: { invoiceId: string; amount?: number; key: string }) =>
      api.post<PaymentDto>(`/invoices/${invoiceId}/payments`, amount ? { amount } : {}, { idempotencyKey: key }),
  });
}

// ---- Rewards --------------------------------------------------------------------------------------
export const useRewards = () => useQuery({ queryKey: qk.rewards, queryFn: () => api.get<RewardsSummaryDto>('/rewards') });
export const useRewardTx = () => usePaged<RewardTransactionDto>(qk.rewardTx, '/rewards/transactions');
export const useDiscounts = () => useQuery({ queryKey: qk.discounts, queryFn: () => api.get<DiscountDto[]>('/discounts') });
export function useRedeem() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ discountId, invoiceId }: { discountId: string; invoiceId: string }) => api.post<{ invoiceId: string; summary: RewardsSummaryDto }>(`/discounts/${discountId}/redeem`, { invoiceId }),
    onSuccess: (r) => inv(qk.rewards, qk.rewardTx, qk.discounts, qk.invoice(r.invoiceId), ['invoices'], ['dashboard']),
  });
}

// ---- Compliance -----------------------------------------------------------------------------------
export const useInspections = () => usePaged<InspectionReportDto>(qk.inspections, '/inspection-reports');
export const useInspection = (id: string) => useQuery({ queryKey: qk.inspection(id), queryFn: () => api.get<InspectionReportDto>(`/inspection-reports/${id}`), enabled: !!id });

// ---- Workforce ------------------------------------------------------------------------------------
export const useSchedule = (f: Q = {}) => useQuery({ queryKey: qk.schedule(f), queryFn: () => api.get<ScheduleEventDto[]>('/schedules', f), networkMode: 'offlineFirst' });
export const useCurrentShift = () => useQuery({ queryKey: qk.currentShift, queryFn: () => api.get<{ openShift: TimesheetDto | null; todayHours: number }>('/timesheets/current') });
export const useTimesheets = (f: Q = {}) => usePaged<TimesheetDto>(qk.timesheets(f), '/timesheets', f);
export const useLeave = (f: Q = {}) => usePaged<LeaveRequestDto>(qk.leave(f), '/leave-requests', f);

export function useClock() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: ({ action, jobId, notes }: { action: 'in' | 'out'; jobId?: string; notes?: string }) =>
      api.post<TimesheetDto>(`/timesheets/clock-${action}`, action === 'in' ? { jobId, notes } : { notes }),
    onSuccess: () => inv(['timesheets'], ['dashboard']),
  });
}

export function useSimpleMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, invalidate: QueryKey[]) {
  const inv = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: () => inv(...invalidate) });
}

// ---- Admin -----------------------------------------------------------------------------------------
export const useMaterials = (f: Q = {}) => usePaged<MaterialDto>(qk.materials(f), '/materials', f);
export const useMaterial = (id: string) => useQuery({ queryKey: qk.material(id), queryFn: () => api.get<MaterialDto>(`/materials/${id}`), enabled: !!id && id !== 'new' });
export const useEmployee = (id: string) => useQuery({ queryKey: qk.employee(id), queryFn: () => api.get<EmployeeDto>(`/employees/${id}`), enabled: !!id });
export const useAdminDiscounts = () => usePaged<DiscountDto>(qk.adminDiscounts, '/discounts');
export const useMovements = (f: Q = {}) => usePaged<StockMovementDto>(qk.movements(f), '/stock-movements', f);
export const useEmployees = (search?: string) => useQuery({ queryKey: qk.employees(search), queryFn: () => api.get<EmployeeDto[]>('/employees', { search }) });
export const useAvailability = (start: string, end: string, jobId?: string) =>
  useQuery({ queryKey: qk.availability(start, end), queryFn: () => api.get<EmployeeAvailabilityDto[]>('/jobs/availability/electricians', { start, end, jobId }), enabled: !!start && !!end && start < end });
export const useCustomers = (search?: string) => usePaged<CustomerDto>(qk.customers(search), '/customers', { search });
export const useCustomer = (id: string) => useQuery({ queryKey: qk.customer(id), queryFn: () => api.get<CustomerDto>(`/customers/${id}`), enabled: !!id });
export const useEnquiries = (f: Q = {}) => usePaged<ContactQueryDto>(qk.enquiries(f), '/contact-queries', f);
export const useEnquiry = (id: string) => useQuery({ queryKey: qk.enquiry(id), queryFn: () => api.get<ContactQueryDto>(`/contact-queries/${id}`), enabled: !!id });
export const useMissedCalls = (f: Q = {}) => usePaged<MissedCallDto>(qk.missedCalls(f), '/missed-calls', f);
export const useMissedCall = (id: string) => useQuery({ queryKey: qk.missedCall(id), queryFn: () => api.get<MissedCallDto>(`/missed-calls/${id}`), enabled: !!id });
export const useMissedStatus = () =>
  useQuery({ queryKey: qk.missedStatus, queryFn: () => api.get<{ featureEnabled: boolean; consentGranted: boolean; smsConfigured: boolean; whatsappConfigured: boolean }>('/missed-calls/status') });
export const useMessageLogs = () => usePaged<MessageLogDto>(qk.messageLogs, '/message-logs');
export const usePayrolls = (f: Q = {}) => usePaged<PayrollDto>(qk.payroll(f), '/payroll', f);
export const useSettings = () => useQuery({ queryKey: qk.settings, queryFn: () => api.get<SettingsDto>('/settings') });
export const useReport = (from: string, to: string) => useQuery({ queryKey: qk.report(from, to), queryFn: () => api.get<ReportSummaryDto>('/reports/summary', { from, to }) });
export const useExports = () => usePaged<ExportLogDto>(qk.exports, '/exports');
export const useAudit = (f: Q = {}) => usePaged<AuditLogDto>(qk.audit(f), '/audit-logs', f);
export const useStaff = () =>
  useQuery({ queryKey: qk.staff, queryFn: () => api.get<{ id: string; email: string; role: string; status: string; staffNumber: string | null; firstName: string; lastName: string; lastLoginAt: string | null }[]>('/admins') });
export const usePayrollPreview = () => useMutation({ mutationFn: (v: { periodStart: string; periodEnd: string }) => api.post<PayrollPreviewLineDto[]>('/payroll/preview', v) });
export interface DataRequestDto {
  id: string;
  type: 'ACCESS' | 'CORRECTION' | 'DELETION';
  details: string | null;
  status: 'OPEN' | 'COMPLETED' | 'REJECTED';
  resolution: string | null;
  createdAt: string;
  email: string;
  role: string;
}
export const useDataRequests = () => usePaged<DataRequestDto>(qk.dataRequests, '/data-requests');
