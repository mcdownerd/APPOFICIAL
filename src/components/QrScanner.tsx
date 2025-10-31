"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CameraIcon, XIcon, AlertCircleIcon, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useCameraAccess } from "@/hooks/use-camera-access"; // Importar o novo hook
import jsQR from "jsqr"; // Importar jsqr

interface QrScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  isLoading: boolean; // isLoading from parent (e.g., form submission)
}

const QrScanner = ({ isOpen, onClose, onScan, isLoading }: QrScannerProps) => {
  const { t } = useTranslation();
  const { videoRef, isCameraAvailable, cameraAccessError, stopCamera } = useCameraAccess(); // Usar o novo hook
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameId = useRef<number | null>(null);
  const lastScanTime = useRef<number>(0);
  const SCAN_INTERVAL_MS = 200; // Scan every 200ms

  const scanQrCode = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !isCameraAvailable) {
      animationFrameId.current = requestAnimationFrame(scanQrCode);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    if (context && video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.height = video.videoHeight;
      canvas.width = video.videoWidth;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "dontInvert",
      });

      if (code && Date.now() - lastScanTime.current > SCAN_INTERVAL_MS) {
        onScan(code.data);
        lastScanTime.current = Date.now();
        // Optionally stop scanning after a successful scan if desired,
        // but for continuous scanning, just let it continue.
      }
    }
    animationFrameId.current = requestAnimationFrame(scanQrCode);
  }, [videoRef, canvasRef, isCameraAvailable, onScan]);

  useEffect(() => {
    if (isOpen && isCameraAvailable) {
      console.log("QR Scanner: Starting QR scan loop.");
      animationFrameId.current = requestAnimationFrame(scanQrCode);
    } else if (animationFrameId.current) {
      console.log("QR Scanner: Stopping QR scan loop.");
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [isOpen, isCameraAvailable, scanQrCode]);

  const handleClose = useCallback(() => {
    stopCamera(); // Parar a câmara ao fechar o diálogo
    onClose();
  }, [onClose, stopCamera]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <CameraIcon className="h-5 w-5" /> {t("scanCode")}
          </DialogTitle>
          <DialogDescription>{t("pointCameraToCode")}</DialogDescription>
        </DialogHeader>
        <div className="relative w-full aspect-video bg-gray-200 flex items-center justify-center">
          {(!isCameraAvailable && !cameraAccessError) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
              <Loader2 className="h-8 w-8 animate-spin mr-2" /> {t("loadingCamera")}
            </div>
          ) : cameraAccessError ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>{t("cameraError")}</AlertTitle>
              <AlertDescription>{cameraAccessError}</AlertDescription>
            </Alert>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover"></video>
              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full hidden"></canvas> {/* Canvas oculto para processamento */}
            </>
          )}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-3/4 h-3/4 border-2 border-dashed border-blue-500 rounded-lg opacity-75"></div>
          </div>
        </div>
        <DialogFooter className="p-4 pt-0 flex justify-end">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            <XIcon className="mr-2 h-4 w-4" /> {t("closeScanner")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QrScanner;