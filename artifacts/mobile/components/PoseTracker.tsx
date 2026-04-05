/**
 * PoseTracker — camera + pose detection
 *
 * Web:    browser getUserMedia → TF.js webgl → MoveNet Lightning → auto rep counting
 * Native: expo-camera CameraView → snapshot → TF.js (tfjs-react-native) →
 *         MoveNet Lightning → SVG skeleton overlay → auto rep counting + beep
 *
 * Falls back to manual tap counting if camera/model init fails anywhere.
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
import Svg, { Circle, Line } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import Colors from '@/constants/colors';

// ─── Keypoint indices (MoveNet / COCO 17-point) ──────────────────────────────
const NOSE          = 0;
const LEFT_SHOULDER = 5;
const RIGHT_SHOULDER= 6;
const LEFT_HIP      = 11;
const RIGHT_HIP     = 12;
const LEFT_KNEE     = 13;
const RIGHT_KNEE    = 14;
const LEFT_ANKLE    = 15;
const RIGHT_ANKLE   = 16;

const SKELETON_PAIRS = [
  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
  [5, 11], [6, 12], [11, 12], [11, 13], [13, 15],
  [12, 14], [14, 16], [0, 5], [0, 6],
];

type Keypoint  = { x: number; y: number; score?: number; name?: string };
type RepPhase  = 'up' | 'down' | 'standing' | 'squatting';

type Props = {
  exercise: 'pushup' | 'squat' | 'custom';
  active: boolean;
  onRep: () => void;
  onPhaseChange?: (phase: string) => void;
};

// ─── Public component ─────────────────────────────────────────────────────────

export default function PoseTracker(props: Props) {
  if (Platform.OS === 'web') {
    return <WebPoseTracker {...props} />;
  }
  return <NativePoseTracker {...props} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// ─── Native: expo-camera + TF.js + MoveNet ───────────────────────────────────

function NativePoseTracker({ exercise, active, onRep, onPhaseChange }: Props) {
  type PermStatus  = 'loading' | 'granted' | 'denied';
  type ModelStatus = 'loading' | 'ready' | 'error';

  const [permStatus,  setPermStatus]  = useState<PermStatus>('loading');
  const [modelStatus, setModelStatus] = useState<ModelStatus>('loading');
  const [loadingMsg,  setLoadingMsg]  = useState('Initializing…');
  const [keypoints,   setKeypoints]   = useState<Keypoint[]>([]);
  const [imgSize,     setImgSize]     = useState({ w: 640, h: 480 });
  const [layout,      setLayout]      = useState({ w: 0, h: 0 });
  const [cameraReady, setCameraReady] = useState(false);
  const [manualMode,  setManualMode]  = useState(false);

  const cameraRef       = useRef<any>(null);
  const detectorRef     = useRef<any>(null);
  const phaseRef        = useRef<RepPhase>(exercise === 'pushup' ? 'up' : 'standing');
  const isProcessingRef = useRef(false);
  const activeRef       = useRef(active);
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef        = useRef<any>(null);
  const mountedRef      = useRef(true);

  useEffect(() => { activeRef.current = active; }, [active]);

  // Reset phase when exercise changes
  useEffect(() => {
    phaseRef.current = exercise === 'pushup' ? 'up' : 'standing';
  }, [exercise]);

  // Load beep sound
  useEffect(() => {
    let sound: any = null;
    import('expo-av').then(({ Audio }) => {
      Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
      Audio.Sound.createAsync(
        require('../assets/sounds/beep.wav'),
        { volume: 1.0 }
      ).then(res => {
        sound = res.sound;
        if (mountedRef.current) soundRef.current = sound;
      }).catch(() => {});
    }).catch(() => {});

    return () => {
      sound?.unloadAsync().catch(() => {});
    };
  }, []);

  // Camera permission + TF.js + model init
  useEffect(() => {
    mountedRef.current = true;

    const init = async () => {
      try {
        const camMod = await import('expo-camera');
        const { status } = await camMod.Camera.requestCameraPermissionsAsync();
        if (!mountedRef.current) return;

        if (status !== 'granted') {
          setPermStatus('denied');
          return;
        }
        setPermStatus('granted');

        setLoadingMsg('Initializing TF.js…');
        const tf = await import('@tensorflow/tfjs');
        await import('@tensorflow/tfjs-react-native');
        await tf.ready();
        if (!mountedRef.current) return;

        setLoadingMsg('Loading MoveNet model (~3 MB)…');
        const pd = await import('@tensorflow-models/pose-detection');
        const detector = await pd.createDetector(
          pd.SupportedModels.MoveNet,
          { modelType: 'SinglePose.Lightning', enableSmoothing: true }
        );
        if (!mountedRef.current) return;

        detectorRef.current = detector;
        setModelStatus('ready');
      } catch (e) {
        console.warn('[PoseTracker] init error:', e);
        if (mountedRef.current) {
          setModelStatus('error');
          setManualMode(true);
        }
      }
    };

    init();

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Inference loop — starts once model is ready
  useEffect(() => {
    if (modelStatus !== 'ready') return;

    const runFrame = async () => {
      if (
        isProcessingRef.current ||
        !cameraRef.current ||
        !detectorRef.current ||
        !activeRef.current
      ) return;

      isProcessingRef.current = true;
      try {
        const pic = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.25,
          skipProcessing: true,
        });

        if (!pic?.base64 || !mountedRef.current) return;

        const { decodeJpeg } = await import('@tensorflow/tfjs-react-native');
        const tf              = await import('@tensorflow/tfjs');

        const bytes  = base64ToUint8Array(pic.base64);
        const tensor = tf.tidy(() => decodeJpeg(bytes, 3));

        if (mountedRef.current) {
          setImgSize({ w: pic.width || 640, h: pic.height || 480 });
        }

        const poses = await detectorRef.current.estimatePoses(tensor);
        tensor.dispose();

        if (poses?.[0]?.keypoints && mountedRef.current) {
          setKeypoints(poses[0].keypoints);
          processKeypoints(poses[0].keypoints, pic.width || 640, pic.height || 480);
        }
      } catch {
        // Skip failed frames silently
      } finally {
        isProcessingRef.current = false;
      }
    };

    intervalRef.current = setInterval(runFrame, 250);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [modelStatus]);

  const playBeep = useCallback(() => {
    soundRef.current?.replayAsync?.().catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const processKeypoints = useCallback(
    (kps: Keypoint[], imgW: number, imgH: number) => {
      if (exercise === 'pushup') {
        const nose = kps[NOSE];
        if (!nose || (nose.score ?? 0) < 0.3) return;
        const ny = nose.y / imgH;

        if (phaseRef.current === 'up' && ny > 0.62) {
          phaseRef.current = 'down';
          onPhaseChange?.('Going down…');
        } else if (phaseRef.current === 'down' && ny < 0.38) {
          phaseRef.current = 'up';
          onPhaseChange?.('Push up!');
          onRep();
          playBeep();
        }
      } else {
        const lHip  = kps[LEFT_HIP];
        const rHip  = kps[RIGHT_HIP];
        const lKnee = kps[LEFT_KNEE];
        const rKnee = kps[RIGHT_KNEE];
        if (!lHip || (lHip.score ?? 0) < 0.3) return;
        if (!lKnee || (lKnee.score ?? 0) < 0.3) return;

        const hipY   = (lHip.y + (rHip?.y  ?? lHip.y))  / 2;
        const kneeY  = (lKnee.y + (rKnee?.y ?? lKnee.y)) / 2;
        const ratio  = hipY / kneeY;

        if (phaseRef.current === 'standing' && ratio > 0.88) {
          phaseRef.current = 'squatting';
          onPhaseChange?.('Squatting down…');
        } else if (phaseRef.current === 'squatting' && ratio < 0.72) {
          phaseRef.current = 'standing';
          onPhaseChange?.('Back to standing!');
          onRep();
          playBeep();
        }
      }
    },
    [exercise, onRep, onPhaseChange, playBeep]
  );

  // ── Skeleton SVG overlay ──────────────────────────────────────────────────
  const renderSkeleton = () => {
    if (!keypoints.length || !layout.w || !layout.h) return null;

    const sx = layout.w / imgSize.w;
    const sy = layout.h / imgSize.h;

    return (
      <Svg
        style={StyleSheet.absoluteFill}
        width={layout.w}
        height={layout.h}
      >
        {SKELETON_PAIRS.map(([a, b]) => {
          const kpA = keypoints[a];
          const kpB = keypoints[b];
          if (!kpA || !kpB || (kpA.score ?? 0) < 0.3 || (kpB.score ?? 0) < 0.3) return null;
          return (
            <Line
              key={`${a}-${b}`}
              x1={kpA.x * sx}
              y1={kpA.y * sy}
              x2={kpB.x * sx}
              y2={kpB.y * sy}
              stroke="rgba(0,212,170,0.75)"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          );
        })}
        {keypoints
          .filter(k => (k.score ?? 0) > 0.3)
          .map((kp, i) => (
            <Circle
              key={i}
              cx={kp.x * sx}
              cy={kp.y * sy}
              r="5"
              fill="#00D4AA"
              opacity="0.9"
            />
          ))}
      </Svg>
    );
  };

  // ── Loading / permission states ───────────────────────────────────────────
  if (permStatus === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (permStatus === 'denied') {
    return (
      <View style={styles.container}>
        <CameraPlaceholder exercise={exercise} />
        {active && <ManualRepButton onRep={onRep} exercise={exercise} />}
      </View>
    );
  }

  if (modelStatus === 'error' || manualMode) {
    return (
      <View style={styles.container}>
        <CameraPlaceholder exercise={exercise} />
        {active && <ManualRepButton onRep={onRep} exercise={exercise} />}
      </View>
    );
  }

  // ── Full camera + inference view ──────────────────────────────────────────
  const CameraView = require('expo-camera').CameraView;

  return (
    <View style={styles.container}>
      <View
        style={styles.nativeCameraWrap}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setLayout({ w: width, h: height });
        }}
      >
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="front"
          onCameraReady={() => setCameraReady(true)}
        />

        {cameraReady && renderSkeleton()}

        {modelStatus === 'loading' && (
          <View style={styles.modelLoadingOverlay}>
            <ActivityIndicator color={Colors.accent} size="small" />
            <Text style={styles.overlayLoadingText}>{loadingMsg}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Web: TF.js + browser webcam ─────────────────────────────────────────────

function WebPoseTracker({ exercise, active, onRep, onPhaseChange }: Props) {
  const videoRef  = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const modelRef  = useRef<any>(null);
  const rafRef    = useRef<number>(0);
  const phaseRef  = useRef<RepPhase>(exercise === 'pushup' ? 'up' : 'standing');
  const activeRef = useRef(active);
  const soundRef  = useRef<any>(null);

  const [status,     setStatus]     = useState<'loading' | 'ready' | 'denied' | 'error'>('loading');
  const [manualMode, setManualMode] = useState(false);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    phaseRef.current = exercise === 'pushup' ? 'up' : 'standing';
  }, [exercise]);

  // Load beep sound (web Audio API as fallback)
  useEffect(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      soundRef.current = ctx;
    } catch {}
  }, []);

  const playBeep = useCallback(() => {
    try {
      const ctx = soundRef.current as AudioContext;
      if (!ctx) return;
      const osc   = ctx.createOscillator();
      const gain  = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  }, []);

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
      videoRef.current.onloadeddata = loadModel;
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
        { modelType: 'SinglePose.Lightning', enableSmoothing: true }
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
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width  = video.videoWidth  || video.clientWidth;
    canvas.height = video.videoHeight || video.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

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

    keypoints
      .filter(k => (k.score ?? 0) > 0.3)
      .forEach(kp => {
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#00D4AA';
        ctx.fill();
      });
  };

  const processKeypoints = (keypoints: Keypoint[]) => {
    if (exercise === 'pushup') {
      const nose = keypoints[NOSE];
      if (!nose || (nose.score ?? 0) < 0.3) return;
      const h  = videoRef.current?.videoHeight || videoRef.current?.clientHeight || 480;
      const ny = nose.y / h;

      if (phaseRef.current === 'up' && ny > 0.62) {
        phaseRef.current = 'down';
        onPhaseChange?.('Going down…');
      } else if (phaseRef.current === 'down' && ny < 0.38) {
        phaseRef.current = 'up';
        onPhaseChange?.('Push up!');
        onRep();
        playBeep();
      }
    } else {
      const lHip  = keypoints[LEFT_HIP];
      const rHip  = keypoints[RIGHT_HIP];
      const lKnee = keypoints[LEFT_KNEE];
      const rKnee = keypoints[RIGHT_KNEE];
      if (!lHip || (lHip.score ?? 0) < 0.3) return;
      if (!lKnee || (lKnee.score ?? 0) < 0.3) return;

      const hipY  = (lHip.y + (rHip?.y  ?? lHip.y))  / 2;
      const kneeY = (lKnee.y + (rKnee?.y ?? lKnee.y)) / 2;
      const ratio = hipY / kneeY;

      if (phaseRef.current === 'standing' && ratio > 0.88) {
        phaseRef.current = 'squatting';
        onPhaseChange?.('Squatting down…');
      } else if (phaseRef.current === 'squatting' && ratio < 0.72) {
        phaseRef.current = 'standing';
        onPhaseChange?.('Back to standing!');
        onRep();
        playBeep();
      }
    }
  };

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={Colors.accent} />
        <Text style={styles.loadingText}>Starting camera & loading model…</Text>
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
          {/* @ts-ignore – video element valid on React Native Web */}
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
          {/* @ts-ignore – canvas element valid on React Native Web */}
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '100%', height: '100%',
              transform: 'scaleX(-1)',
            }}
          />
        </View>
      )}
      {(status === 'denied' || manualMode) && active && (
        <ManualRepButton onRep={onRep} exercise={exercise} />
      )}
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function CameraPlaceholder({ exercise }: { exercise: string }) {
  return (
    <View style={styles.placeholder}>
      <Feather
        name={exercise === 'pushup' ? 'trending-up' : 'arrow-down'}
        size={36}
        color={Colors.accent}
      />
      <Text style={styles.placeholderTitle}>Camera unavailable</Text>
      <Text style={styles.placeholderSub}>
        {exercise === 'pushup'
          ? 'Position phone on floor, front camera facing up.\nGet into plank above it.'
          : 'Stand 1.5 m from phone so your\nfull body is visible.'}
      </Text>
      <View style={styles.tipRow}>
        <Feather name="info" size={13} color={Colors.textTertiary} />
        <Text style={styles.tipText}>
          Auto pose detection runs in the native Android build. Tap manually here.
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
        style={({ pressed }) => [
          styles.manualBtn,
          pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
        ]}
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
  },
  nativeCameraWrap: {
    flex: 1,
    width: '100%',
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
    flex: 1,
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
