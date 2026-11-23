import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, CameraOff, RefreshCw, AlertCircle, QrCode, ScanBarcode } from 'lucide-react';
import { createDuplicateScanGuard } from '../lib/barcodeScanner';
import type { TranslationStrings } from '../i18n';

interface CameraScannerPanelProps {
  mode: 'camera_barcode' | 'camera_qr';
  onDetected: (code: string) => void;
  t: TranslationStrings;
}

export function CameraScannerPanel({ mode, onDetected, t }: CameraScannerPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const guardRef = useRef(createDuplicateScanGuard(1500));
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string>('');

  const stopCamera = () => {
    try {
      controlsRef.current?.stop();
    } catch {
      // ignore stop errors
    }
    controlsRef.current = null;
    setIsScanning(false);
  };

  const startCamera = async (overrideDeviceId?: string) => {
    stopCamera();
    setCameraError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(t.cameraUnavailableMsg);
      return;
    }

    try {
      const videoDevices = await BrowserMultiFormatReader.listVideoInputDevices();
      setDevices(videoDevices);

      let chosenId = overrideDeviceId ?? selectedDeviceId;
      if (!chosenId && videoDevices.length > 0) {
        const rear = videoDevices.find((d) =>
          /back|rear|environment/i.test(d.label || '')
        );
        chosenId = (rear ?? videoDevices[0]).deviceId;
        setSelectedDeviceId(chosenId);
      }

      const hints = new Map<DecodeHintType, unknown>();
      if (mode === 'camera_qr') {
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      } else {
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
        ]);
      }

      const reader = new BrowserMultiFormatReader(hints);
      if (!videoRef.current) return;

      setIsScanning(true);
      const controls = await reader.decodeFromVideoDevice(
        chosenId || undefined,
        videoRef.current,
        (result) => {
          if (!result) return;
          const rawText = result.getText().trim();
          if (!rawText) return;
          if (!guardRef.current.shouldAccept(rawText)) return;
          setLastScanned(rawText);
          onDetectedRef.current(rawText);
        }
      );
      controlsRef.current = controls;
    } catch (err) {
      stopCamera();
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraError(t.cameraPermissionDenied);
      } else {
        setCameraError(
          err instanceof Error && err.message
            ? `${t.cameraUnavailableMsg} (${err.message})`
            : t.cameraUnavailableMsg
        );
      }
    }
  };

  useEffect(() => {
    guardRef.current.reset();
    return () => {
      stopCamera();
    };
  }, [mode]);

  const handleSwitchCamera = async () => {
    if (devices.length < 2) {
      await startCamera(selectedDeviceId);
      return;
    }
    const idx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextDevice = devices[(idx + 1) % devices.length];
    setSelectedDeviceId(nextDevice.deviceId);
    if (isScanning) {
      await startCamera(nextDevice.deviceId);
    }
  };

  return (
    <div className="bg-slate-900 text-white rounded-xl p-3 border border-slate-700 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          {mode === 'camera_qr' ? (
            <QrCode className="w-4 h-4 text-teal-400" aria-hidden="true" />
          ) : (
            <ScanBarcode className="w-4 h-4 text-teal-400" aria-hidden="true" />
          )}
          <span>{mode === 'camera_qr' ? t.scannerModeQr : t.scannerModeCameraBarcode}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {devices.length > 1 && (
            <button
              type="button"
              onClick={handleSwitchCamera}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.switchCameraBtn}</span>
            </button>
          )}
          {isScanning ? (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              <CameraOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.stopCameraBtn}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startCamera()}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{t.startCameraBtn}</span>
            </button>
          )}
        </div>
      </div>

      {devices.length > 1 && (
        <select
          value={selectedDeviceId || ''}
          onChange={(e) => {
            const nextId = e.target.value;
            setSelectedDeviceId(nextId);
            if (isScanning) {
              startCamera(nextId);
            }
          }}
          className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-100"
        >
          {devices.map((dev, i) => (
            <option key={dev.deviceId || i} value={dev.deviceId}>
              {dev.label || `Camera ${i + 1}`}
            </option>
          ))}
        </select>
      )}

      {cameraError && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-950/70 border border-rose-700/70 px-3 py-2 text-xs text-rose-100">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-300" aria-hidden="true" />
          <div className="flex-1">
            <p>{cameraError}</p>
            <button
              type="button"
              onClick={() => startCamera()}
              className="mt-1 underline font-semibold text-white cursor-pointer"
            >
              {t.retryBtn}
            </button>
          </div>
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden bg-slate-950 border border-slate-800 aspect-video max-h-48 w-full flex items-center justify-center">
        <video
          ref={videoRef}
          className={`w-full h-full object-cover ${isScanning ? 'block' : 'hidden'}`}
          muted
          playsInline
        />
        {!isScanning && (
          <div className="text-center px-4 py-6 text-xs text-slate-400">
            <Camera className="w-6 h-6 mx-auto mb-1.5 text-slate-500" aria-hidden="true" />
            <p>{t.cameraScanningHint}</p>
          </div>
        )}
        {isScanning && (
          <div className="pointer-events-none absolute inset-4 border-2 border-teal-400/70 rounded-lg" />
        )}
      </div>

      {lastScanned && (
        <p className="text-[11px] font-mono text-teal-300 truncate">
          {t.barcodeScanAdded}: {lastScanned}
        </p>
      )}
    </div>
  );
}
