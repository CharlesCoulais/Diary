import { useEffect, useRef, useState } from 'react';
import { useBackButtonClose } from '../hooks/useBackButtonClose';
import { notifyDialog } from '../lib/dialog';

interface ISBNScannerProps {
  onDetected: (isbn: string) => void;
  onClose: () => void;
}

// BarcodeDetector is not in TypeScript's built-in lib yet
declare class BarcodeDetector {
  constructor(options?: { formats: string[] });
  detect(source: HTMLVideoElement | HTMLImageElement | ImageBitmap): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

const SUPPORTED = typeof window !== 'undefined' && 'BarcodeDetector' in window;

function isISBN(value: string): boolean {
  const clean = value.replace(/[-\s]/g, '');
  return /^\d{10}$/.test(clean) || /^\d{13}$/.test(clean);
}

/** Camera-based barcode scanner using BarcodeDetector API */
function CameraScanner({ onDetected, onClose }: ISBNScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        detectorRef.current = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128'] });
        setScanning(true);

        async function scan() {
          if (!active || !videoRef.current || !detectorRef.current) return;
          try {
            const codes = await detectorRef.current.detect(videoRef.current);
            for (const code of codes) {
              const val = code.rawValue.replace(/[-\s]/g, '');
              if (isISBN(val)) {
                // Found ISBN — stop and report
                onDetected(val);
                return;
              }
            }
          } catch { /* ignore frame errors */ }
          rafRef.current = requestAnimationFrame(scan);
        }
        rafRef.current = requestAnimationFrame(scan);
      } catch (e) {
        if (active) setError((e as Error).message || 'Accès caméra refusé');
      }
    }

    start();

    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-bg-elevated rounded-2xl shadow-2xl overflow-hidden max-w-sm mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-text-muted/10">
          <p className="text-sm font-medium text-text-primary">Scanner un ISBN</p>
          <button type="button" onClick={onClose} className="text-text-muted/50 hover:text-text-muted p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Video */}
        <div className="relative aspect-video bg-black">
          <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
          {/* Targeting frame */}
          {scanning && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-56 h-24 border-2 border-accent rounded-lg opacity-70" />
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4">
              <p className="text-white text-sm text-center bg-black/60 rounded-xl px-4 py-3">{error}</p>
            </div>
          )}
        </div>

        <p className="text-xs text-text-muted/60 text-center px-4 py-3">
          {scanning ? 'Pointez vers le code-barres du livre…' : 'Initialisation…'}
        </p>
      </div>
    </>
  );
}

/** Fallback: file input with camera capture */
function FileFallbackScanner({ onDetected, onClose }: ISBNScannerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }
    try {
      const bitmap = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128'] });
      const codes = await detector.detect(bitmap);
      for (const code of codes) {
        const val = code.rawValue.replace(/[-\s]/g, '');
        if (isISBN(val)) { onDetected(val); return; }
      }
      await notifyDialog({
        title: 'Aucun ISBN détecté',
        message: 'Essaie de mieux cadrer le code-barres et de réessayer.',
        tone: 'warning',
      });
    } catch {
      await notifyDialog({
        title: 'Impossible de lire l’image',
        message: 'Le fichier sélectionné n’a pas pu être analysé.',
        tone: 'danger',
      });
    }
    onClose();
  };

  useEffect(() => {
    // Auto-open file picker
    inputRef.current?.click();
  }, []);

  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={handleFile}
    />
  );
}

/** Fallback quand BarcodeDetector n'est pas dispo (Safari < iOS 17, Firefox…) */
function ManualISBNFallback({ onDetected, onClose }: ISBNScannerProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 80); }, []);

  const submit = () => {
    const clean = value.replace(/[-\s]/g, '');
    if (isISBN(clean)) { onDetected(clean); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-bg-primary/80 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-bg-elevated rounded-2xl shadow-2xl overflow-hidden max-w-sm mx-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-text-muted/10">
          <p className="text-sm font-medium text-text-primary">Saisir un ISBN</p>
          <button type="button" onClick={onClose} className="text-text-muted/50 hover:text-text-muted p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-5 flex flex-col gap-4">
          <p className="text-xs text-text-muted/60 leading-relaxed">
            Le scan automatique n'est pas disponible sur ce navigateur (nécessite iOS 17+ ou Chrome).
            Tu peux retrouver l'ISBN au dos du livre (commence par 978 ou 979).
          </p>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder="978-…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full bg-bg-primary rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted/55 outline-none border border-text-muted/15 focus:border-accent/40 transition-colors"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!isISBN(value.replace(/[-\s]/g, ''))}
            className="w-full py-2.5 rounded-xl bg-accent text-bg-primary text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            Rechercher
          </button>
        </div>
      </div>
    </>
  );
}

/** Entry point: shows camera scanner or file fallback based on support */
export function ISBNScanner({ onDetected, onClose }: ISBNScannerProps) {
  const [useCamera, setUseCamera] = useState<boolean | null>(null);

  useEffect(() => {
    if (!SUPPORTED) { setUseCamera(false); return; }
    // Check if camera is available
    navigator.mediaDevices?.enumerateDevices()
      .then((devices) => setUseCamera(devices.some((d) => d.kind === 'videoinput')))
      .catch(() => setUseCamera(false));
  }, []);

  // Back natif (Android/iOS) → ferme le scanner. Hook au niveau racine pour
  // qu'il soit actif dès que le scanner est monté, peu importe la variante.
  useBackButtonClose(true, onClose);

  if (useCamera === null) return null; // Still detecting

  if (useCamera && SUPPORTED) {
    return <CameraScanner onDetected={onDetected} onClose={onClose} />;
  }

  if (SUPPORTED) {
    return <FileFallbackScanner onDetected={onDetected} onClose={onClose} />;
  }

  // BarcodeDetector non dispo : saisie manuelle
  return <ManualISBNFallback onDetected={onDetected} onClose={onClose} />;
}
