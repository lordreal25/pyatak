import React, { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';

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
      onPress={() => { void handlePress(); }}
      disabled={loading}
      style={[styles.button, isOnline ? styles.online : styles.offline]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <View style={[styles.dot, isOnline ? styles.dotOnline : styles.dotOffline]} />
          <Text style={styles.label}>
            {isOnline
              ? `Вы на пятаке${pyatakName ? ` «${pyatakName}»` : ''}`
              : 'Встать на пятак'}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  online: { backgroundColor: '#22C55E' },
  offline: { backgroundColor: '#FF6B00' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotOnline: { backgroundColor: '#fff' },
  dotOffline: { backgroundColor: 'rgba(255,255,255,0.85)' },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
