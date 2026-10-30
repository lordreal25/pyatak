import { Switch, StyleSheet, Text, View } from 'react-native';

type SwitchToggleProps = {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export default function SwitchToggle({ label, value, onValueChange }: SwitchToggleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D5D5D5', true: '#FF6B00' }}
        thumbColor="#FFFFFF"
        ios_backgroundColor="#D5D5D5"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
  },
  label: {
    flex: 1,
    marginRight: 12,
    color: '#222222',
    fontSize: 13,
  },
});
