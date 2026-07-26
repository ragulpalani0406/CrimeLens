import { useEffect, useRef, useState } from "react";
import { FaceDetector, FilesetResolver } from "@mediapipe/tasks-vision";
import "./FaceCheck.css";

export default function FaceCheck() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectorRef = useRef<FaceDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);

  const [cameraStarted, setCameraStarted] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const detectLoop = () => {
    const video = videoRef.current;
    const detector = detectorRef.current;

    if (video && detector && video.readyState >= 2) {
      const result = detector.detectForVideo(video, performance.now());
      const found = result.detections.length > 0;

      setFaceDetected((previous) =>
        previous === found ? previous : found
      );
    }

    frameRef.current = requestAnimationFrame(detectLoop);
  };

  const startCamera = async () => {
    try {
      setLoading(true);
      setError("");

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.6,
      });

      detectorRef.current = detector;
      setCameraStarted(true);
      detectLoop();
    } catch {
      setError("Camera permission denied or camera unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const stopCamera = () => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    detectorRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraStarted(false);
    setFaceDetected(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  return (
    <div className="face-check">
      <div className="face-check-title">
        <div>
          <strong>Face presence check</strong>
          <p>Optional camera check for secure sign in</p>
        </div>

        {!cameraStarted ? (
          <button
            type="button"
            className="face-check-button"
            onClick={startCamera}
            disabled={loading}
          >
            {loading ? "Starting..." : "Enable camera"}
          </button>
        ) : (
          <button
            type="button"
            className="face-check-button stop"
            onClick={stopCamera}
          >
            Stop
          </button>
        )}
      </div>

      <video
        ref={videoRef}
        className={cameraStarted ? "face-video" : "face-video hidden"}
        autoPlay
        muted
        playsInline
      />

      {error && <p className="face-error">{error}</p>}

      {cameraStarted && !error && (
        <p className={faceDetected ? "face-success" : "face-status"}>
          {faceDetected
            ? "✓ Face detected"
            : "Move your face inside the camera frame"}
        </p>
      )}
    </div>
  );
}