"use client";

import React, { useState, useCallback } from "react";
import { QrReader } from 'react-qr-reader';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CameraIcon, XIcon, AlertCircleIcon, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface QrScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  isLoading: boolean;
}

const QrScanner = ({ isOpen, onClose, onScan, isLoading }: QrScannerProps) => {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);

  const handleScanResult = useCallback((result: any, error: any) => {
    if (result) {
      onScan(result.text);
      // onClose(); // Let EstafetaPage decide when to close
    }
    if (error && error.name !== "NotAllowedError" && error.name !== "NotFoundError" && error.name !== "NotReadableError" && error.name !== "OverconstrainedError" && error.name !== "AbortError") {
      // Ignore common camera errors that are handled by onError, but log others
      console.error("QR Scan Error:", error);
    }
  }, [onScan]);

  const handleCameraError = useCallback((err: any) => {
    console.error("Camera Error:", err);
    if (err.name === "NotAllowedError") {
      setError(t("cameraPermissionDenied"));
    } else if (err.name === "NotFoundError") {
      setError(t("noCameraFound"));
    } else if (err.name === "NotReadableError") {
      setError(t("cameraInUse"));
    } else if (err.name === "OverconstrainedError") {
      setError(t("cameraConstraintsError"));
    } else if (err.name === "AbortError") {
      setError(t("cameraAborted"));
    } else {
      setError(t("genericCameraError"));
    }
    setIsCameraReady(false);
  }, [t]);

  const handleLoad = useCallback(() => {
    setIsCameraReady(true);
    setError(null); // Clear any previous errors
  }, []);

  const handleClose = useCallback(() => {
    setError(null); // Clear error when closing
    setIsCameraReady(false); // Reset camera ready state
    onClose();
  }, [onClose]);

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
          {!isCameraReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
              <Loader2 className="h-8 w-8 animate-spin mr-2" /> {t("loadingCamera")}
            </div>
          )}
          {error ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>{t("cameraError")}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : (
            <QrReader
              onResult={handleScanResult}
              onError={handleCameraError}
              onLoad={handleLoad}
              constraints={{ facingMode: 'environment' }} // Prefer rear camera
              scanDelay={500} // Delay between scans to prevent multiple reads
              videoContainerStyle={{ padding: '0', height: '100%', width: '100%' }}
              videoStyle={{ objectFit: 'cover' }}
            />
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