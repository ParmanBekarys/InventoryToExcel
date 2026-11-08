import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Photo } from '../types/inventory';
import { processPhotoFile } from '../services/imageProcessing';
import { formatBytes } from '../utils/format';
import { CameraCapture } from './CameraCapture';
import { PhotoViewer } from './PhotoViewer';
import { Button } from './ui';

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/**
 * Take a photo with the camera or pick one from the gallery. Photos are resized and kept
 * in memory only; they are embedded into the Excel file on export.
 */
export function PhotoPicker({ photo, onChange, photoText }: { photo: Photo | null; onChange: (p: Photo | null) => void; photoText?: string }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [liveCamera, setLiveCamera] = useState(false);
  const [zoom, setZoom] = useState(false);

  const handle = async (file: Blob | undefined | null) => {
    if (!file) return;
    if (file instanceof File && file.type && !file.type.startsWith('image/')) {
      setError('Please choose an image file (JPG or PNG).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onChange(await processPhotoFile(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const openCamera = () => {
    // Phones/tablets: the native camera app via capture="environment" gives the best photos.
    if (isTouchDevice() || !navigator.mediaDevices?.getUserMedia) cameraInput.current?.click();
    else setLiveCamera(true);
  };

  return (
    <div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (handle(e.target.files?.[0]), (e.target.value = ''))} />
      <input ref={galleryInput} type="file" accept="image/*" className="hidden" onChange={(e) => (handle(e.target.files?.[0]), (e.target.value = ''))} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-slate-50 sm:w-56">
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : photo ? (
            <button type="button" onClick={() => setZoom(true)} className="size-full cursor-zoom-in" aria-label="View photo full screen">
              <img src={photo.url} alt="Item photo preview" className="size-full object-contain" />
            </button>
          ) : (
            <button type="button" onClick={openCamera} className="flex size-full flex-col items-center justify-center gap-2 text-muted hover:text-primary">
              <Camera className="size-7" />
              <span className="text-xs font-medium">Add a photo</span>
            </button>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button icon={Camera} variant={photo ? 'secondary' : 'primary'} onClick={openCamera} disabled={busy} size="lg" className="sm:h-10">
              {photo ? 'Retake' : 'Take photo'}
            </Button>
            <Button icon={ImagePlus} onClick={() => galleryInput.current?.click()} disabled={busy} size="lg" className="sm:h-10">
              {photo ? 'Replace' : 'From gallery'}
            </Button>
            {photo && (
              <Button icon={Trash2} variant="ghost" onClick={() => onChange(null)} disabled={busy} className="col-span-2 text-red-600 hover:bg-red-50 hover:text-red-700 sm:col-span-1">
                Remove photo
              </Button>
            )}
          </div>
          {photo && (
            <p className="text-xs text-muted">
              {photo.width && photo.height ? `${photo.width} × ${photo.height} px · ` : ''}
              {formatBytes(photo.bytes.length)} · {photo.origin === 'workbook' ? 'from the Excel file' : 'new photo'}
            </p>
          )}
          {!photo && photoText && <p className="text-xs text-amber-700">The PHOTO cell contains text: “{photoText}”. Adding a photo replaces it.</p>}
          <p className="text-xs text-muted">Photos stay on this device and are embedded into the Excel file when you download it.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      </div>

      <PhotoViewer src={zoom && photo ? photo.url : null} alt="Photo" onClose={() => setZoom(false)} />
      <CameraCapture
        open={liveCamera}
        onClose={() => setLiveCamera(false)}
        onCapture={(blob) => {
          setLiveCamera(false);
          handle(blob);
        }}
      />
    </div>
  );
}
