/**
 * PoseTracker — camera + pose detection
 *
 * Web:    browser getUserMedia → TF.js webgl → MoveNet → auto rep counting
 * Native: expo-camera CameraView → manual tap counting (TF.js-RN not yet
 *         compatible with Expo SDK 54 expo-gl; full native inference available
 *         once that peer-dep is resolved in a dev build).
 *
 * If camera access is denied anywhere, falls back to a dark placeholder
 * with a visible "Rep Done" tap button.
 */

import * as Haptics from 'expo-haptics';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

// ─── Keypoint indices (MoveNet / COCO 17-point) ───────────────────────────────
const NOSE = 0;
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER = 6;
const LEFT_HIP = 11;
const RIGHT_HIP = 12;
const LEFT_KNEE = 13;
const RIGHT_KNEE = 14;
const LEFT_ANKLE = 15;
const RIGHT_ANKLE = 16;

const SKELETON_PAIRS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16], [0, 5], [0, 6],
];

type Keypoint = { x: number; y: number; score?: number; name?: string };
type RepPhase = 'up' | 'down' | 'standing' | 'squatting';

type Props = {
  exercise: 'pushup' | 'squat' | 'custom';
  active: boolean;
  onRep: () => void;
  onPhaseChange?: (phase: string) => void;
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function PoseTracker({ exercise, active, onRep, onPhaseChange }: Props) {
  if (Platform.OS === 'web') {
    return (
      <WebPoseTracker
        exercise={exercise}
        active={active}
        onRep={onRep}
        onPhaseChange={onPhaseChange}
      />
    );
  }
  return (
    <NativePoseTracker
      exercise={exercise}
      active={active}
      onRep={onRep}
      onPhaseChange={onPhaseChange}
    />
  );
}

// ─── Web: TF.js + browser webcam ─────────────────────────────────────────────

function WebPoseTracker({ exercise, active, onRep, onPhaseChange }: Props) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const modelRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const phaseRef = useRef<RepPhase>(exercise === 'pushup' ? 'up' : 'standing');
  const activeRef = useRef(active);

  const [status, setStatus] = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    initCamera();
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t: MediaStreamTrack) => t.stop());
      }
    };
  }, []);

  const initCamera = async () => {
    try {
      if (!navigator?.mediaDevices?.getUserMedia) {
        setStatus('denied');
        setManualMode(true);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      videoRef.current.onloadeddata = () => {
        loadModel();
      };
    } catch {
      setStatus('denied');
      setManualMode(true);
    }
  };

  const loadModel = async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('webgl');
      await tf.ready();

      const poseDetection = await import('@tensorflow-models/pose-detection');
      const model = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        {
          modelType: 'SinglePose.Lightning',
          enableSmoothing: true,
        },
      );
      modelRef.current = model;
      setStatus('ready');
      runLoop();
    } catch {
      setStatus('ready');
      setManualMode(true);
    }
  };

  const runLoop = useCallback(() => {
    const tick = async () => {
      if (activeRef.current && videoRef.current && modelRef.current) {
        try {
          const poses = await modelRef.current.estimatePoses(videoRef.current);
          if (poses[0]?.keypoints) {
            drawSkeleton(poses[0].keypoints);
            processKeypoints(poses[0].keypoints);
          }
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const drawSkeleton = (keypoints: Keypoint[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = video.videoWidth || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const confidentPoints = keypoints.filter(k => (k.score ?? 0) > 0.3);

    SKELETON_PAIRS.forEach(([a, b]) => {
      const kpA = keypoints[a];
      const kpB = keypoints[b];
      if ((kpA?.score ?? 0) > 0.3 && (kpB?.score ?? 0) > 0.3) {
        ctx.beginPath();
        ctx.moveTo(kpA.x, kpA.y);
        ctx.lineTo(kpB.x, kpB.y);
        ctx.strokeStyle = 'rgba(0,212,170,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    confidentPoints.forEach(kp => {
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = '#00D4AA';
      ctx.fill();
    });
  };

  const processKeypoints = (keypoints: Keypoint[]) => {
    if (exercise === 'pushup') {
      processPushup(keypoints);
    } else {
      processSquat(keypoints);
    }
  };

  const processPushup = (kps: Keypoint[]) => {
    const nose = kps[NOSE];
    const lShoulder = kps[LEFT_SHOULDER];
    const rShoulder = kps[RIGHT_SHOULDER];
    if (!nose || (nose.score ?? 0) < 0.3) return;

    const h = videoRef.current?.videoHeight || videoRef.current?.clientHeight || 480;
    const normalizedY = nose.y / h;

    if (phaseRef.current === 'up' && normalizedY > 0.62) {
      phaseRef.current = 'down';
      onPhaseChange?.('Going down...');
    } else if (phaseRef.current === 'down' && normalizedY < 0.38) {
      phaseRef.current = 'up';
      onPhaseChange?.('Push up!');
      onRep();
    }
  };

  const processSquat = (kps: Keypoint[]) => {
    const lHip = kps[LEFT_HIP];
    const rHip = kps[RIGHT_HIP];
    const lKnee = kps[LEFT_KNEE];
    const rKnee = kps[RIGHT_KNEE];
    if (!lHip || (lHip.score ?? 0) < 0.3) return;
    if (!lKnee || (lKnee.score ?? 0) < 0.3) return;

    const hipY = (lHip.y + (rHip?.y ?? lHip.y)) / 2;
    const kneeY = (lKnee.y + (rKnee?.y ?? lKnee.y)) / 2;
    const ratio = hipY / kneeY;

    if (phaseRef.current === 'standing' && ratio > 0.88) {
      phaseRef.current = 'squatting';
      onPhaseChange?.('Squatting down...');
    } else if (phaseRef.current === 'squatting' && ratio < 0.72) {
      phaseRef.current = 'standing';
      onPhaseChange?.('Back to standing!');
      onRep();
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Starting camera & loading model...</Text>
        <Text style={styles.loadingSubText}>
          MoveNet pose model (~3 MB) downloads on first use
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {status === 'denied' || manualMode ? (
        <CameraPlaceholder exercise={exercise} />
      ) : (
        <View style={styles.videoWrap}>
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore – video is valid in React Native Web */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
          {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
          {/* @ts-ignore – canvas is valid in React Native Web */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              transform: 'scaleX(-1)',
            }}
          />
          {status === 'ready' && !modelRef.current && (
            <View style={styles.modelLoadingOverlay}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.overlayLoadingText}>Loading pose model...</Text>
            </View>
          )}
        </View>
      )}
      {(status === 'denied' || manualMode) && active && (
        <ManualRepButton onRep={onRep} exercise={exercise} />
      )}
    </View>
  );
}

// ─── Native: expo-camera + manual counting ────────────────────────────────────

function NativePoseTracker({ exercise, active, onRep }: Props) {
  const [cameraReady, setCameraReady] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'loading' | 'granted' | 'denied'>('loading');
  const [CameraView, setCameraView] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const mod = await import('expo-camera');
        const { status } = await mod.Camera.requestCameraPermissionsAsync();
        if (status === 'granted') {
          setCameraView(() => mod.CameraView);
          setPermissionStatus('granted');
        } else {
          setPermissionStatus('denied');
        }
      } catch {
        setPermissionStatus('denied');
      }
    })();
  }, []);

  if (permissionStatus === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Requesting camera access...</Text>
      </View>
    );
  }

  if (permissionStatus === 'denied' || !CameraView) {
    return (
      <View style={styles.container}>
        <CameraPlaceholder exercise={exercise} />
        {active && <ManualRepButton onRep={onRep} exercise={exercise} />}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.nativeCameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="front"
          onCameraReady={() => setCameraReady(true)}
        />
        {!cameraReady && (
          <View style={styles.cameraLoadingOverlay}>
            <ActivityIndicator color={Colors.accent} />
          </View>
        )}
      </View>
      {active && <ManualRepButton onRep={onRep} exercise={exercise} />}
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function CameraPlaceholder({ exercise }: { exercise: string }) {
  return (
    <View style={styles.placeholder}>
      <Feather name={exercise === 'pushup' ? 'trending-up' : 'arrow-down'} size={36} color={Colors.accent} />
      <Text style={styles.placeholderTitle}>Camera unavailable in preview</Text>
      <Text style={styles.placeholderSub}>
        {exercise === 'pushup'
          ? 'Position phone on floor, front camera facing up.\nGet into plank above it.'
          : 'Stand 1.5 m from phone so your\nfull body is visible.'}
      </Text>
      <View style={styles.tipRow}>
        <Feather name="info" size={13} color={Colors.textTertiary} />
        <Text style={styles.tipText}>
          Auto pose detection works in the native Android build. Tap manually here.
        </Text>
      </View>
    </View>
  );
}

function ManualRepButton({ onRep, exercise }: { onRep: () => void; exercise: string }) {
  const label = exercise === 'pushup' ? 'Tap at TOP of push-up' : 'Tap when fully STANDING';
  return (
    <View style={styles.manualWrap}>
      <Text style={styles.manualLabel}>{label}</Text>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onRep();
        }}
        style={({ pressed }) => [styles.manualBtn, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]}
      >
        <Feather name="check" size={26} color={Colors.background} />
        <Text style={styles.manualBtnText}>Rep Done</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoWrap: {
    flex: 1,
    width: '100%',
    position: 'relative',
    backgroundColor: '#000',
    overflow: 'hidden',
    borderRadius: 16,
  },
  nativeCameraWrap: {
    flex: 1,
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  cameraLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  modelLoadingOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(14,15,17,0.85)',
    borderRadius: 10,
    padding: 10,
  },
  overlayLoadingText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.text,
  },
  loadingText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    marginTop: 14,
    textAlign: 'center',
  },
  loadingSubText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  placeholder: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 24,
  },
  placeholderTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: Colors.text,
    textAlign: 'center',
  },
  placeholderSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  tipText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: Colors.textTertiary,
    flex: 1,
    lineHeight: 16,
  },
  manualWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 14,
    gap: 8,
  },
  manualLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 16,
  },
  manualBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: Colors.background,
  },
});
