import { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

type RangeSliderProps = {
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  accessibilityLabel: string;
};

const THUMB_SIZE = 24;
const DEFAULT_WIDTH = 280;

export default function RangeSlider({ value, onValueChange, min, max, step, accessibilityLabel }: RangeSliderProps) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const position = useRef(new Animated.Value(0)).current;
  const positionValue = useRef(0);
  const startPosition = useRef(0);
  const valueChangeRef = useRef(onValueChange);
  const valueRef = useRef(value);
  const limitsRef = useRef({ min, max, step, width });

  useEffect(() => {
    valueChangeRef.current = onValueChange;
    valueRef.current = value;
    limitsRef.current = { min, max, step, width };
    const nextPosition = ((value - min) / (max - min)) * (width - THUMB_SIZE);
    positionValue.current = nextPosition;
    position.setValue(nextPosition);
  }, [max, min, onValueChange, position, step, value, width]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startPosition.current = positionValue.current;
      },
      onPanResponderMove: (_, gesture) => {
        const limits = limitsRef.current;
        const trackWidth = limits.width - THUMB_SIZE;
        const nextPosition = Math.max(0, Math.min(startPosition.current + gesture.dx, trackWidth));
        const rawValue = limits.min + (nextPosition / trackWidth) * (limits.max - limits.min);
        const nextValue = Math.max(limits.min, Math.min(limits.max, Math.round(rawValue / limits.step) * limits.step));
        const snappedPosition = ((nextValue - limits.min) / (limits.max - limits.min)) * trackWidth;
        positionValue.current = snappedPosition;
        position.setValue(nextPosition);
        if (nextValue !== valueRef.current) {
          valueRef.current = nextValue;
          valueChangeRef.current(nextValue);
        }
      },
      onPanResponderRelease: () => {
        Animated.spring(position, {
          toValue: positionValue.current,
          useNativeDriver: false,
          friction: 7,
        }).start();
      },
    }),
  ).current;

  const trackWidth = width - THUMB_SIZE;
  const fillWidth = position.interpolate({
    inputRange: [0, trackWidth],
    outputRange: [0, trackWidth],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.track}
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        const change = event.nativeEvent.actionName === 'increment' ? step : -step;
        const nextValue = Math.max(min, Math.min(max, value + change));
        valueRef.current = nextValue;
        valueChangeRef.current(nextValue);
      }}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width;
        if (nextWidth > THUMB_SIZE && nextWidth !== width) setWidth(nextWidth);
      }}
    >
      <View style={styles.trackBackground} />
      <Animated.View style={[styles.trackFill, { width: fillWidth }]} />
      <Animated.View style={[styles.thumb, { transform: [{ translateX: position }] }]} {...panResponder.panHandlers} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    height: 32,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  trackBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E8E8E8',
  },
  trackFill: {
    position: 'absolute',
    left: 0,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FF6B00',
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 3,
    borderColor: '#FF6B00',
    backgroundColor: '#FFFFFF',
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
  },
});
