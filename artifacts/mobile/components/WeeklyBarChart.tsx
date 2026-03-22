import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Colors from '@/constants/colors';

interface WeeklyBarChartProps {
  data: number[];
  labels: string[];
  color?: string;
  height?: number;
}

function Bar({
  value,
  max,
  label,
  color,
  chartHeight,
  index,
  isToday,
}: {
  value: number;
  max: number;
  label: string;
  color: string;
  chartHeight: number;
  index: number;
  isToday: boolean;
}) {
  const ratio = max > 0 ? value / max : 0;
  const scaleY = useSharedValue(0);

  useEffect(() => {
    scaleY.value = withDelay(index * 60, withSpring(ratio, { damping: 14, stiffness: 120 }));
  }, [value]);

  const animStyle = useAnimatedStyle(() => ({
    height: scaleY.value * chartHeight,
    minHeight: scaleY.value > 0 ? 4 : 0,
  }));

  return (
    <View style={styles.barCol}>
      <Text style={styles.barValue}>{value > 0 ? `${value}m` : ''}</Text>
      <View style={[styles.barTrack, { height: chartHeight }]}>
        <Animated.View
          style={[
            styles.barFill,
            animStyle,
            { backgroundColor: isToday ? color : color + '88' },
            isToday && styles.barFillActive,
          ]}
        />
      </View>
      <Text style={[styles.barLabel, isToday && { color: Colors.text }]}>{label}</Text>
    </View>
  );
}

export default function WeeklyBarChart({
  data,
  labels,
  color = Colors.accent,
  height = 100,
}: WeeklyBarChartProps) {
  const max = Math.max(...data, 1);
  const todayIndex = data.length - 1;

  return (
    <View style={styles.container}>
      <View style={[styles.chart, { height }]}>
        {data.map((val, i) => (
          <Bar
            key={labels[i]}
            value={val}
            max={max}
            label={labels[i]}
            color={color}
            chartHeight={height}
            index={i}
            isToday={i === todayIndex}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  barValue: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: Colors.textTertiary,
    height: 14,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    justifyContent: 'flex-end',
    borderRadius: 4,
    backgroundColor: Colors.border + '55',
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barFillActive: {
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  barLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 10,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
