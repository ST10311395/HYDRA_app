/*
 * Code Attribution
 * Meta Platforms, Inc. 2026. React documentation. Available at: https://react.dev/ [Accessed 16 September 2026].
 * Meta Platforms, Inc. 2026. React Native documentation. Available at: https://reactnative.dev/docs/getting-started [Accessed 21 August 2026].
 * Microsoft. 2026. TypeScript documentation. Available at: https://www.typescriptlang.org/docs/ [Accessed 28 August 2026].
 */
import { forwardRef, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HorizontalScroller } from './HorizontalScroller';
import { Icon, type IconName } from './Icon';
import { Label, Text } from './Text';
import { colors, fonts, HIT, noSelect, radius, spacing } from './tokens';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helper?: string;
  icon?: IconName;
  required?: boolean;
  right?: ReactNode;
}

/** Labelled text input with field-level error text (spec §22). */
export const TextField = forwardRef<TextInput, FieldProps>(function TextField({ label, error, helper, icon, required, right, multiline, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="title" weight="bold">
          {label}
          {required ? <Text variant="title" color="dangerBright"> *</Text> : null}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          multiline ? { minHeight: 110, alignItems: 'flex-start', paddingTop: 12 } : null,
          { borderColor: error ? colors.dangerBright : focused ? colors.primaryBright : colors.border },
        ]}
      >
        {icon ? <Icon name={icon} size={18} color="textMuted" /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primaryBright}
          style={[styles.input, multiline ? { textAlignVertical: 'top', minHeight: 90 } : null]}
          accessibilityLabel={label ?? rest.placeholder}
          accessibilityHint={error}
          multiline={multiline}
          maxFontSizeMultiplier={1.5}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color="dangerBright" accessibilityLiveRegion="polite">{error}</Text>
      ) : helper ? (
        <Text variant="caption" color="textMuted">{helper}</Text>
      ) : null}
    </View>
  );
});

export function SearchField({ value, onChangeText, placeholder }: { value: string; onChangeText: (v: string) => void; placeholder: string }) {
  return (
    <View style={[styles.field, { backgroundColor: colors.surface }]}>
      <Icon name="search" size={18} color="textMuted" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        returnKeyType="search"
        accessibilityLabel={placeholder}
        autoCorrect={false}
      />
      {value ? (
        <Pressable accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={12}>
          <Icon name="x" size={16} color="textMuted" />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/** Horizontal filter chips (“All Services / Solar & Renewables / …”). */
export function FilterChips<T extends string>({ options, value, onChange }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <HorizontalScroller contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.lg }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, noSelect, active ? { backgroundColor: colors.primary, borderColor: colors.primary } : null]}
          >
            {o.icon ? <Icon name={o.icon} size={15} color={active ? 'white' : 'textSecondary'} /> : null}
            <Text variant="title" color={active ? 'white' : 'textSecondary'} weight={active ? 'bold' : 'medium'} selectable={false}>{o.label}</Text>
          </Pressable>
        );
      })}
    </HorizontalScroller>
  );
}

/** Equal-width segmented selector (“Standard (24h) / High Priority / 24/7 Critical”). */
export function Segmented<T extends string>({ options, value, onChange, tone = 'primary' }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void; tone?: 'primary' | 'danger' }) {
  return (
    <View style={styles.segment} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        const activeBg = tone === 'danger' && o.value.includes('EMERGENCY') ? colors.danger : colors.primary;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            onLongPress={() => onChange(o.value)}
            style={[styles.segmentItem, noSelect, active ? { backgroundColor: activeBg, borderColor: activeBg } : null]}
          >
            <Text variant="caption" color={active ? 'white' : 'textSecondary'} weight="semibold" align="center" numberOfLines={2} selectable={false}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Bottom-sheet select list — consistent across iOS and Android. */
export function SelectField<T extends string>({ label, value, options, onChange, placeholder = 'Select…', error }: { label?: string; value?: T; options: ChipOption<T>[]; onChange: (v: T) => void; placeholder?: string; error?: string }) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const selected = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="title" weight="bold">{label}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? 'Select'}: ${selected?.label ?? placeholder}`} onPress={() => setOpen(true)} style={[styles.field, noSelect, { borderColor: error ? colors.dangerBright : colors.border }]}>
        <Text variant="body" color={selected ? 'text' : 'textFaint'} style={{ flex: 1 }} numberOfLines={2}>{selected?.label ?? placeholder}</Text>
        <Icon name="chevron-down" size={18} color="textMuted" />
      </Pressable>
      {error ? <Text variant="caption" color="dangerBright">{error}</Text> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          {label ? <Text variant="h3" style={{ marginBottom: spacing.md }}>{label}</Text> : null}
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            style={{ maxHeight: 420 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: item.value === value }}
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={styles.option}
              >
                {item.icon ? <Icon name={item.icon} size={18} color="textSecondary" /> : null}
                <Text variant="body" style={{ flex: 1 }}>{item.label}</Text>
                {item.value === value ? <Icon name="check" size={18} color="primaryBright" /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Month calendar date picker (no native dependency). Value is an ISO date string. */
export function DateField({ label, value, onChange, minDate, error, placeholder = 'Choose a date' }: { label?: string; value?: string; onChange: (iso: string) => void; minDate?: string; error?: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const base = value ? new Date(`${value}T00:00:00`) : new Date();
  const [month, setMonth] = useState(new Date(base.getFullYear(), base.getMonth(), 1));
  const insets = useSafeAreaInsets();
  const cells = useMemo(() => {
    const first = (month.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))];
  }, [month]);
  const pretty = value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : null;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text variant="title" weight="bold">{label}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityLabel={`${label ?? 'Date'}: ${pretty ?? placeholder}`} onPress={() => setOpen(true)} style={[styles.field, noSelect, { borderColor: error ? colors.dangerBright : colors.border }]}>
        <Icon name="calendar" size={18} color="textMuted" />
        <Text variant="body" color={pretty ? 'text' : 'textFaint'} style={{ flex: 1 }}>{pretty ?? placeholder}</Text>
      </Pressable>
      {error ? <Text variant="caption" color="dangerBright">{error}</Text> : null}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.grabber} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Pressable accessibilityLabel="Previous month" hitSlop={12} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevron-left" size={22} /></Pressable>
            <Text variant="h3">{month.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityLabel="Next month" hitSlop={12} onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevron-right" size={22} /></Pressable>
          </View>
          <View style={styles.grid}>
            {WEEKDAYS.map((d, i) => (
              <View key={`h${i}`} style={styles.cell}><Label>{d}</Label></View>
            ))}
            {cells.map((d, i) => {
              if (!d) return <View key={`e${i}`} style={styles.cell} />;
              const iso = isoOf(d);
              const disabled = !!minDate && iso < minDate;
              const active = iso === value;
              return (
                <Pressable
                  key={iso}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={d.toDateString()}
                  accessibilityState={{ selected: active, disabled }}
                  onPress={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                  style={[styles.cell, active ? { backgroundColor: colors.primary, borderRadius: radius.md } : null]}
                >
                  <Text variant="title" color={disabled ? 'textFaint' : active ? 'white' : 'text'}>{d.getDate()}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function Checkbox({ checked, onChange, label, error }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={[{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', minHeight: HIT, paddingVertical: 6 }, noSelect]}>
        <View style={[styles.box, checked ? { backgroundColor: colors.primary, borderColor: colors.primary } : null, error ? { borderColor: colors.dangerBright } : null]}>
          {checked ? <Icon name="check" size={14} color="white" /> : null}
        </View>
        <View style={{ flex: 1 }}>{typeof label === 'string' ? <Text variant="bodySmall" color="textSecondary">{label}</Text> : label}</View>
      </Pressable>
      {error ? <Text variant="caption" color="dangerBright">{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceInset, paddingHorizontal: 14 },
  input: { flex: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 15, paddingVertical: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 14, minHeight: 40 },
  segment: { flexDirection: 'row', gap: spacing.sm },
  segmentItem: { flex: 1, minHeight: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, borderTopWidth: 1, borderColor: colors.border },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.lg },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
