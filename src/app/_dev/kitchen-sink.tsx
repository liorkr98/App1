import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { I18nManager, View } from 'react-native';

import {
  Button,
  Empty,
  ErrorState,
  Input,
  ListRow,
  Loading,
  Screen,
  Sheet,
  Text,
  spacing,
  useTheme,
} from '@/core/ui';

import { fixtures } from './fixtures';

/**
 * Declared at module scope, not inside the screen.
 *
 * A component defined during render is a new type on every render, so React
 * unmounts and remounts its subtree — every Input would lose what you typed.
 */
function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: 1, backgroundColor: colors.border }} />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="label" muted>
        {title}
      </Text>
      {children}
      <Divider />
    </View>
  );
}

/**
 * Kitchen sink — every component, every state, in Hebrew.
 *
 * This is the CLAUDE.md §4.6 definition-of-done screen. Open it on a real
 * device in Hebrew and look at every chevron, every price and every wrap.
 *
 * DEVELOPMENT ONLY. It renders nothing in a production bundle.
 */
export default function KitchenSink() {
  const { t } = useTranslation();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [value, setValue] = useState('');

  if (!__DEV__) {
    return null;
  }

  return (
    <Screen scroll>
      <Text variant="display">Kitchen Sink</Text>
      <Text variant="caption" muted>
        {`I18nManager.isRTL = ${String(I18nManager.isRTL)}`}
      </Text>

      <Section title="Type scale">
        <Text variant="display">כותרת ראשית</Text>
        <Text variant="title">כותרת משנה</Text>
        <Text variant="body">{fixtures.longHebrew}</Text>
        <Text variant="label">תווית</Text>
        <Text variant="caption" muted>
          הערה קטנה
        </Text>
      </Section>

      <Section title="Bidi — mixed script, price, phone, date">
        <Text variant="body">{fixtures.mixed}</Text>
        <ListRow title="מחיר מנוי שנתי" value={fixtures.price} />
        <ListRow title="מחיר ליחידה" value={fixtures.priceFractional} />
        <ListRow title="טלפון נייד" value={fixtures.mobile} />
        <ListRow title="טלפון קווי" value={fixtures.landline} />
        <ListRow title="מספר בינלאומי" value={fixtures.international} />
        <ListRow title="תאריך" value={fixtures.date} />
        <ListRow title="תאריך ושעה" value={fixtures.dateTime} />
      </Section>

      <Section title="Button — variants">
        <Button label={t('common.save')} variant="primary" block />
        <Button label={t('common.cancel')} variant="secondary" block />
        <Button label={t('common.edit')} variant="ghost" block />
        <Button label={t('common.delete')} variant="destructive" block />
      </Section>

      <Section title="Button — states">
        <Button label={t('common.save')} loading block />
        <Button label={t('common.save')} disabled block />
        <Button label={t('common.delete')} variant="destructive" disabled block />
        <Button label={t('common.next')} size="large" block />
        <Button label={t('common.done')} />
      </Section>

      <Section title="Input">
        <Input
          label="שם מלא"
          placeholder="לדוגמה: ישראל ישראלי"
          value={value}
          onChangeText={setValue}
        />
        <Input label="דוא״ל" placeholder="name@example.com" keyboardType="email-address" />
        <Input label="טלפון" placeholder="054-1234567" keyboardType="phone-pad" />
        <Input label="עם שגיאה" value="קלט שגוי" error={t('errors.network')} />
        <Input label="עם הסבר" hint="נשתמש בזה רק כדי ליצור קשר" />
        <Input label="מושבת" value="לא ניתן לעריכה" editable={false} />
      </Section>

      <Section title="ListRow">
        <ListRow title={fixtures.rowTitle} subtitle={fixtures.rowSubtitle} onPress={() => {}} />
        <ListRow title={fixtures.truncating} onPress={() => {}} />
        <ListRow title="שורה מושבתת" disabled onPress={() => {}} />
        <ListRow title={t('common.delete')} destructive onPress={() => {}} />
      </Section>

      <Section title="Sheet">
        <Button label="פתיחת חלונית" variant="secondary" onPress={() => setSheetOpen(true)} />
        <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title="אישור פעולה">
          <Text variant="body">{fixtures.longHebrew}</Text>
          <Button label={t('common.confirm')} block onPress={() => setSheetOpen(false)} />
          <Button
            label={t('common.cancel')}
            variant="ghost"
            block
            onPress={() => setSheetOpen(false)}
          />
        </Sheet>
      </Section>

      <Section title="Loading">
        <Loading full={false} />
      </Section>

      <Section title="Empty">
        <Empty actionLabel={t('common.retry')} onAction={() => {}} style={{ flex: 0 }} />
      </Section>

      <Section title="ErrorState">
        <ErrorState
          title={t('errors.network')}
          description={fixtures.longHebrew}
          onRetry={() => {}}
          style={{ flex: 0 }}
        />
      </Section>
    </Screen>
  );
}
