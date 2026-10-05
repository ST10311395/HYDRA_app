/*
 * Code Attribution
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
/** Maps notification payloads to in-app screens for the signed-in role. */
export function routeForNotification(role: string | undefined, data: Record<string, unknown> | null | undefined): string | null {
  const jobId = typeof data?.jobId === 'string' ? data.jobId : null;
  const invoiceId = typeof data?.invoiceId === 'string' ? data.invoiceId : null;
  const aiCaseId = typeof data?.aiCaseId === 'string' ? data.aiCaseId : null;
  if (role === 'CUSTOMER') {
    if (invoiceId) return `/customer/invoice/${invoiceId}`;
    if (aiCaseId && !jobId) return `/customer/ai/${aiCaseId}`;
    if (jobId) return `/customer/job/${jobId}`;
    if (data?.route === '/rewards') return '/customer/rewards';
  } else if (role === 'EMPLOYEE') {
    if (jobId) return `/employee/job/${jobId}`;
    if (data?.leaveId || data?.route === '/employee/leave') return '/employee/leave';
    return '/employee/calendar';
  } else if (role === 'ADMIN_OFFICE' || role === 'ADMIN_OWNER') {
    if (jobId) return `/admin/job/${jobId}`;
    if (aiCaseId) return `/admin/ai-case/${aiCaseId}`;
    if (invoiceId) return `/admin/invoice/${invoiceId}`;
    if (typeof data?.enquiryId === 'string') return `/admin/enquiry/${data.enquiryId}`;
    if (typeof data?.missedCallId === 'string') return `/admin/missed-call/${data.missedCallId}`;
    if (typeof data?.materialId === 'string') return '/admin/inventory';
    if (data?.leaveId) return '/admin/workforce?tab=LEAVE';
    if (data?.timesheetId) return '/admin/workforce?tab=TIMESHEETS';
    if (typeof data?.route === 'string' && data.route.startsWith('/admin/')) return data.route;
  }
  return null;
}
