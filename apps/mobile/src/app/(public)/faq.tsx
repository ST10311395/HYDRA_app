import { View } from 'react-native';
import { useFaqs } from '../../api/queries';
import { BrandHeader, Screen } from '../../components/layout';
import { Accordion, Label, colors } from '../../design-system';
import { QueryFallback, notReady } from '../../components/QueryState';

const GROUP_LABEL: Record<string, string> = { GENERAL: 'General', QUOTATION: 'Quotations', COMPLIANCE: 'Compliance & Safety', CONTACT: 'Contact & Emergencies' };

export default function FaqScreen() {
  const faqs = useFaqs();
  const groups = [...new Set((faqs.data ?? []).map((f) => f.category))];
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <BrandHeader section="FAQs" back />
      <Screen withTabBar={false} onRefresh={() => void faqs.refetch()} refreshing={faqs.isRefetching}>
        {notReady(faqs) ? <QueryFallback query={faqs} /> : groups.map((g) => (
          <View key={g} style={{ gap: 8 }}>
            <Label color="primaryBright" style={{ fontSize: 13 }}>{GROUP_LABEL[g] ?? g}</Label>
            {(faqs.data ?? []).filter((f) => f.category === g).map((f) => <Accordion key={f.id} title={f.question}>{f.answer}</Accordion>)}
          </View>
        ))}
      </Screen>
    </View>
  );
}
