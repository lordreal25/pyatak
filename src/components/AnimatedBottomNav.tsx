import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

export type NavItem = {
  key: string;
  label: string;
  icon: ReactNode;
};

type AnimatedBottomNavProps = {
  items: NavItem[];
  activeKey: string;
  onChange: (key: string) => void;
};

export default function AnimatedBottomNav({ items, activeKey, onChange }: AnimatedBottomNavProps) {
  const scales = useRef(items.map(() => new Animated.Value(1))).current;
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    scales.forEach((scale, index) => {
      Animated.spring(scale, {
        toValue: itemsRef.current[index]?.key === activeKey ? 1.04 : 1,
        useNativeDriver: true,
        friction: 7,
      }).start();
    });
  }, [activeKey, scales]);

  return (
    <View style={styles.container}>
      {items.map((item, index) => {
        const focused = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={item.label}
            onPress={() => onChange(item.key)}
            style={styles.item}
          >
            <Animated.View style={[styles.itemContent, focused && styles.itemContentActive, { transform: [{ scale: scales[index] }] }]}>
              {item.icon}
              <Text numberOfLines={1} style={[styles.label, focused && styles.labelActive]}>{item.label}</Text>
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    minHeight: 60,
    paddingHorizontal: 8,
    paddingTop: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDEDED',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemContent: {
    minWidth: 57,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 16,
  },
  itemContentActive: {
    backgroundColor: '#FFF2E9',
  },
  label: {
    maxWidth: 70,
    color: '#858585',
    fontSize: 9,
    fontWeight: '500',
  },
  labelActive: {
    color: '#FF6B00',
    fontWeight: '700',
  },
});
