import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ROLE_LABELS, createStaffSchema, type Role } from '@hydra/shared';
import { api, errorMessage } from '../../api/client';
import { useSimpleMutation, useStaff } from '../../api/queries';
import { OwnerGate, parseAmount } from '../../components/admin';
import { BrandHeader } from '../../components/layout';
import { Badge, Button, Card, EmptyState, Label, Segmented, Text, TextField, colors, confirm, spacing, toast } from '../../design-system';
import { useAuth } from '../../store/auth';
import { fmtRelative } from '../../utils/format';
import { QueryFallback, notReady } from '../../components/QueryState';

type StaffRole = Exclude<Role, 'CUSTOMER'>;

/** Owner user/role administration (spec §5.5): provision staff accounts, enable/disable access. */
export default function Staff() {
  return (
    <OwnerGate section="Staff Accounts">
      <StaffInner />
    </OwnerGate>
  );
}

function StaffInner() {
  const q = useStaff();
  const me = useAuth((s) => s.user?.id);
  const [creating, setCreating] = useState(false);
  const status = useSimpleMutation(({ id, next }: { id: string; next: 'ACTIVE' | 'DISABLED' }) => api.patch(`/users/${id}/status`, { status: next, reason: 'Changed by owner in admin app' }), [['staff'], ['employees']]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="Staff Accounts" back />
      <FlatList
        data={q.data ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: 48 }}
        ListHeaderComponent={creating ? <NewStaff onDone={() => setCreating(false)} /> : <Button label="Add staff member" icon="user-plus" size="sm" onPress={() => setCreating(true)} />}
        renderItem={({ item: u }) => (
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="title" weight="bold" style={{ flex: 1 }}>{u.firstName} {u.lastName}{u.id === me ? ' (you)' : ''}</Text>
              <Badge label={u.status} tone={u.status === 'ACTIVE' ? 'success' : 'danger'} />
            </View>
            <Text variant="caption" color="textMuted">{ROLE_LABELS[u.role as Role] ?? u.role}{u.staffNumber ? ` · ${u.staffNumber}` : ''} · {u.email}</Text>
            <Text variant="caption" color="textFaint">{u.lastLoginAt ? `Last sign-in ${fmtRelative(u.lastLoginAt)}` : 'Never signed in'}</Text>
            {u.id !== me ? (
              <Button
                label={u.status === 'ACTIVE' ? 'Disable access' : 'Re-enable access'}
                size="sm"
                variant={u.status === 'ACTIVE' ? 'dangerOutline' : 'secondary'}
                loading={status.isPending && status.variables?.id === u.id}
                onPress={() => void (async () => {
                  const next = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                  if (next === 'DISABLED' && !(await confirm({ title: `Disable ${u.firstName}?`, message: 'All their sessions are revoked immediately. Records they created are kept.', confirmLabel: 'Disable', destructive: true }))) return;
                  status.mutate({ id: u.id, next }, { onSuccess: () => toast.success(next === 'DISABLED' ? 'Access disabled' : 'Access restored'), onError: (e) => toast.error(errorMessage(e)) });
                })()}
              />
            ) : null}
          </Card>
        )}
        ListEmptyComponent={notReady(q) ? <QueryFallback query={q} /> : <EmptyState icon="users" title="No staff accounts" />}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} tintColor={colors.primaryBright} />}
      />
    </View>
  );
}

function NewStaff({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ role: 'EMPLOYEE' as StaffRole, firstName: '', lastName: '', email: '', phone: '', password: '', certificationNo: '', specialisation: '', hourlyRate: '', taxRate: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useSimpleMutation((body: object) => api.post('/admins/staff', body), [['staff'], ['employees']]);
  const submit = () => {
    const employee = f.role === 'EMPLOYEE';
    const parsed = createStaffSchema.safeParse({
      role: f.role, firstName: f.firstName, lastName: f.lastName, email: f.email, phone: f.phone, password: f.password,
      certificationNo: employee ? f.certificationNo : undefined, specialisation: employee ? f.specialisation : undefined,
      hourlyRate: employee && f.hourlyRate ? parseAmount(f.hourlyRate) : undefined, taxRate: employee && f.taxRate ? parseAmount(f.taxRate) / 100 : undefined,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join('.')] ??= i.message;
      setErrors(errs);
      return;
    }
    create.mutate(parsed.data, { onSuccess: () => { toast.success('Staff account created — share the temporary password securely'); onDone(); }, onError: (e) => toast.error(errorMessage(e)) });
  };
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  return (
    <Card accent="primary" style={{ gap: spacing.md }}>
      <Label color="primaryBright">New staff account</Label>
      <Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: 'EMPLOYEE', label: 'Electrician' }, { value: 'ADMIN_OFFICE', label: 'Office admin' }, { value: 'ADMIN_OWNER', label: 'Owner' }]} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><TextField label="First name" value={f.firstName} onChangeText={set('firstName')} error={errors.firstName} /></View>
        <View style={{ flex: 1 }}><TextField label="Last name" value={f.lastName} onChangeText={set('lastName')} error={errors.lastName} /></View>
      </View>
      <TextField label="Work email" value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <TextField label="Phone" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" error={errors.phone} />
      <TextField label="Temporary password" value={f.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" error={errors.password} helper="At least 12 characters. Ask them to change it after first sign-in." />
      {f.role === 'EMPLOYEE' ? (
        <>
          <TextField label="Specialisation" value={f.specialisation} onChangeText={set('specialisation')} maxLength={120} />
          <TextField label="Registration / certification no." value={f.certificationNo} onChangeText={set('certificationNo')} maxLength={60} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}><TextField label="Hourly rate (R)" value={f.hourlyRate} onChangeText={set('hourlyRate')} keyboardType="decimal-pad" error={errors.hourlyRate} /></View>
            <View style={{ flex: 1 }}><TextField label="Tax rate (%)" value={f.taxRate} onChangeText={set('taxRate')} keyboardType="decimal-pad" error={errors.taxRate} /></View>
          </View>
          <Text variant="caption" color="textMuted">A staff number (PSG-E-xxxx) is generated automatically for sign-in.</Text>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onDone} />
        <Button label="Create account" style={{ flex: 1 }} loading={create.isPending} onPress={submit} />
      </View>
    </Card>
  );
}
