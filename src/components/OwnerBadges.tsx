import React from 'react';
import { View, Text } from 'react-native';
import { OwnerLevel, LEVEL_LABELS, LEVEL_COLORS } from '../types';

type Props = {
  level?: OwnerLevel;
  phoneVerified?: boolean;
  documentsVerified?: boolean;
  equipmentVerified?: boolean;
  companyVerified?: boolean;
  completedOrders?: number;
  compact?: boolean;
};

export function OwnerBadges({
  level = 'novice',
  phoneVerified,
  documentsVerified,
  equipmentVerified,
  companyVerified,
  completedOrders,
  compact = false,
}: Props) {
  return (
    <View className="flex-row flex-wrap items-center gap-1.5">
      {/* Уровень */}
      <View className={`px-2 py-0.5 rounded-full ${LEVEL_COLORS[level]}`}>
        <Text className="text-xs font-semibold">{LEVEL_LABELS[level]}</Text>
      </View>

      {/* Галочки верификации */}
      {phoneVerified && (
        <View className="flex-row items-center bg-green-50 px-1.5 py-0.5 rounded-full">
          <Text className="text-xs text-green-700">✅ Тел</Text>
        </View>
      )}
      {documentsVerified && (
        <View className="flex-row items-center bg-green-50 px-1.5 py-0.5 rounded-full">
          <Text className="text-xs text-green-700">✅ Док</Text>
        </View>
      )}
      {equipmentVerified && (
        <View className="flex-row items-center bg-green-50 px-1.5 py-0.5 rounded-full">
          <Text className="text-xs text-green-700">✅ Техника</Text>
        </View>
      )}
      {companyVerified && (
        <View className="flex-row items-center bg-green-50 px-1.5 py-0.5 rounded-full">
          <Text className="text-xs text-green-700">✅ Компания</Text>
        </View>
      )}

      {!compact && typeof completedOrders === 'number' && completedOrders > 0 && (
        <Text className="text-xs text-gray-500 ml-1">{completedOrders} заказов</Text>
      )}
    </View>
  );
}
