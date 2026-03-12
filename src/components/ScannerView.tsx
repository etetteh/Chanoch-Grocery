import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { HealthProfile, ScannedItem } from '../types';
import { analyzeGroceryItem } from '../services/gemini';
import { CircularProgress } from '@mui/material';
import { Button } from './ui/button';

interface Props {
  profile: HealthProfile;
  scanTrigger?: number;
}

export default function ScannerView({ profile, scanTrigger = 0 }: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, []);

  useEffect(() => {
    if (scanTrigger > 0 && !isScanning && !scannedItem) {
      captureAndAnalyze();
    }
  }, [scanTrigger]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      if (!isMountedRef.current) {
        // Component unmounted while waiting for camera, stop it immediately
        mediaStream.getTracks().forEach(track => track.stop());
        return;
      }
      
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setError(null);
    } catch (err) {
      if (isMountedRef.current) {
        setError('Unable to access camera. Please check permissions.');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageBase64 = canvas.toDataURL('image/jpeg', 0.8);

    setIsScanning(true);
    setScannedItem(null);
    setError(null);

    try {
      const result = await analyzeGroceryItem(imageBase64, profile);
      if (result) {
        setScannedItem(result);
      } else {
        setError('Failed to analyze item. Please try again.');
      }
    } catch (err) {
      setError('An error occurred during analysis.');
    } finally {
      setIsScanning(false);
    }
  };

  const resetScanner = () => {
    setScannedItem(null);
    setError(null);
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full text-emerald-600 dark:text-emerald-400">
          <Camera className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('scan_title')}</h2>
          <p className="text-gray-600 dark:text-gray-400">{t('scan_subtitle')}</p>
        </div>
      </div>

      {!scannedItem ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <canvas ref={canvasRef} className="hidden" />
            
            {isScanning && (
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white">
                <CircularProgress size={40} sx={{ color: '#fff' }} className="mb-4" />
                <p className="font-medium">{t('scan_analyzing')}</p>
              </div>
            )}
            
            {error && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white p-6 text-center">
                <AlertCircle className="w-10 h-10 text-red-500 mb-4" />
                <p className="font-medium mb-4">{error}</p>
                <Button
                  onClick={startCamera}
                  className="bg-white text-black hover:bg-gray-200"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>

          <Button
            onClick={captureAndAnalyze}
            disabled={isScanning || !!error}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 h-14 rounded-full font-bold text-lg transition-colors"
          >
            <Camera className="w-6 h-6" />
            {t('scan_item_btn')}
          </Button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-6">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{scannedItem.name}</h3>
              <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-medium mt-2">
                {scannedItem.category}
              </span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={resetScanner} 
              className="bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 hover:text-gray-800 dark:hover:text-gray-300"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className={`p-4 rounded-xl flex items-start gap-3 ${scannedItem.isAligned ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`}>
            {scannedItem.isAligned ? <CheckCircle2 className="w-6 h-6 shrink-0" /> : <AlertCircle className="w-6 h-6 shrink-0" />}
            <div>
              <p className="font-bold">{scannedItem.isAligned ? t('scan_aligned') : t('scan_not_aligned')}</p>
              <p className="text-sm mt-1 opacity-90">{scannedItem.reason}</p>
            </div>
          </div>

          {scannedItem.healthierAlternative && !scannedItem.isAligned && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">{t('scan_healthier_alt')}</p>
              <p className="text-amber-900 dark:text-amber-200">{scannedItem.healthierAlternative}</p>
            </div>
          )}

          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-3">{t('scan_nutritional_info')}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold mb-1">{t('scan_calories')}</p>
                <p className="font-bold text-gray-900 dark:text-white">{scannedItem.nutritionalInfo.calories}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold mb-1">{t('scan_protein')}</p>
                <p className="font-bold text-gray-900 dark:text-white">{scannedItem.nutritionalInfo.protein}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold mb-1">{t('scan_carbs')}</p>
                <p className="font-bold text-gray-900 dark:text-white">{scannedItem.nutritionalInfo.carbs}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl text-center">
                <p className="text-xs text-gray-600 dark:text-gray-400 uppercase font-bold mb-1">{t('scan_fat')}</p>
                <p className="font-bold text-gray-900 dark:text-white">{scannedItem.nutritionalInfo.fat}</p>
              </div>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={resetScanner}
            className="w-full flex items-center justify-center gap-2 h-12 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 border-none text-gray-900 dark:text-white px-6 rounded-full font-medium transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            {t('scan_another_btn')}
          </Button>
        </div>
      )}
    </div>
  );
}
