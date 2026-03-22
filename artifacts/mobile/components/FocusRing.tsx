import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Colors from '@/constants/colors';

interface FocusRingProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

export default function FocusRing({
  percent,
  size = 96,
  strokeWidth = 9,
  color = Colors.accent,
  label,
  sublabel,
}: FocusRingProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const strokeDashoffset = circumference - (circumference * clamped) / 100;
  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={styles.wrap}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={Colors.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <Circle
            cx={cx}
            cy={cy}
            r={r}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${cx}, ${cy}`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFillObject, styles.center]}>
          <Text style={[styles.percent, { color }]}>{Math.round(clamped)}%</Text>
        </View>
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {sublabel ? <Text style={styles.sublabel}>{sublabel}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: 6,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  label: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: Colors.text,
    textAlign: 'center',
  },
  sublabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: 'center',
  },
});
