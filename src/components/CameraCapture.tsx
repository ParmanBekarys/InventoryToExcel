import { Camera, RefreshCcw, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './ui';

/** Live camera preview using getUserMedia (requires HTTPS or localhost). The video never leaves the device. */
export function CameraCapture({ open, onClose, onCapture }: { open: boolean; onClose: () => void; onCapture: (blob: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const stop = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setReady(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError('');
    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError('The camera can only be used when the site is opened over HTTPS (or on localhost). Use "Upload from gallery" instead.');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
          setReady(true);
        }
      } catch (e) {
        const name = (e as DOMException).name;
        setError(
          name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow camera access in your browser settings, or upload a photo instead.'
            : name === 'NotFoundError' || name === 'OverconstrainedError'
              ? 'No camera was found on this device.'
              : 'The camera could not be started. It may be in use by another app.',
        );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, facing, stop]);

  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d')!.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          stop();
          onCapture(blob);
        }
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        stop();
        onClose();
      }}
      title="Take a photo"
      size="lg"
      footer={
        <>
          <Button
            icon={RefreshCcw}
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            disabled={!!error}
          >
            Switch camera
          </Button>
          <Button variant="primary" icon={Camera} onClick={capture} disabled={!ready}>
            Capture
          </Button>
        </>
      }
    >
      <div className="bg-slate-950">
        {error ? (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
            <TriangleAlert className="size-6 text-amber-400" />
            {error}
          </div>
        ) : (
          <video ref={video} playsInline muted className="aspect-video w-full object-contain" />
        )}
      </div>
    </Modal>
  );
}
