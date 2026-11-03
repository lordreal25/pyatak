import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { OwnerLevel, LEVEL_LABELS } from '../types';

type Props = {
  level?: OwnerLevel;
  phoneVerified?: boolean;
  documentsVerified?: boolean;
  equipmentVerified?: boolean;
  companyVerified?: boolean;
  completedOrders?: number;
  rating?: number;
  reviews?: number;
  compact?: boolean;
};

const levelStyle: Record<OwnerLevel, { bg: string; color: string }> = {
  novice: { bg: '#F3F4F6', color: '#4B5563' },
  expert: { bg: '#DBEAFE', color: '#1D4ED8' },
  pro: { bg: '#FEF3C7', color: '#B45309' },
};

export function OwnerBadges({
  level = 'novice',
  phoneVerified,
  documentsVerified,
  equipmentVerified,
  companyVerified,
  completedOrders,
  rating,
  reviews,
  compact = false,
}: Props) {
  const ls = levelStyle[level] || levelStyle.novice;
  return (
    <View style={styles.row}>
      <View style={[styles.pill, { backgroundColor: ls.bg }]}>
        <Text style={[styles.pillText, { color: ls.color }]}>{LEVEL_LABELS[level]}</Text>
      </View>
      {typeof rating === 'number' && rating > 0 ? (
        <View style={[styles.pill, { backgroundColor: '#FFF7ED' }]}>
          <Text style={[styles.pillText, { color: '#C2410C' }]}>
            ★ {rating.toFixed(1)}{reviews ? ` (${reviews})` : ''}
          </Text>
        </View>
      ) : null}
      {phoneVerified ? (
        <View style={[styles.pill, styles.ok]}><Text style={styles.okText}>✓ Тел</Text></View>
      ) : null}
      {documentsVerified ? (
        <View style={[styles.pill, styles.ok]}><Text style={styles.okText}>✓ Док</Text></View>
      ) : null}
      {equipmentVerified ? (
        <View style={[styles.pill, styles.ok]}><Text style={styles.okText}>✓ Техника</Text></View>
      ) : null}
      {companyVerified ? (
        <View style={[styles.pill, styles.ok]}><Text style={styles.okText}>✓ Компания</Text></View>
      ) : null}
      {!compact && typeof completedOrders === 'number' && completedOrders > 0 ? (
        <Text style={styles.orders}>{completedOrders} заказов</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  ok: { backgroundColor: '#ECFDF5' },
  okText: { fontSize: 11, fontWeight: '700', color: '#047857' },
  orders: { fontSize: 11, color: '#6B7280', marginLeft: 2 },
});
