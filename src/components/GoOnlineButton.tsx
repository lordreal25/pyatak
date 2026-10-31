import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';

type Props = {
  isOnline: boolean;
  pyatakName?: string | null;
  onToggle: (next: boolean) => Promise<void>;
};

export function GoOnlineButton({ isOnline, pyatakName, onToggle }: Props) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    try {
      await onToggle(!isOnline);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={loading}
      className={`flex-row items-center justify-center px-5 py-3.5 rounded-2xl ${
        isOnline ? 'bg-green-500' : 'bg-orange-500'
      }`}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <View
            className={`w-2.5 h-2.5 rounded-full mr-2 ${
              isOnline ? 'bg-white' : 'bg-white/80'
            }`}
          />
          <Text className="text-white font-semibold text-base">
            {isOnline
              ? `Вы на пятаке${pyatakName ? ` «${pyatakName}»` : ''}`
              : 'Встать на пятак'}
          </Text>
        </>
      )}
    </Pressable>
  );
}
