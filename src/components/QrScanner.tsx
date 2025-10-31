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
  isLoading: boolean; // isLoading from parent (e.g., form submission)
}

const QrScanner = ({ isOpen, onClose, onScan, isLoading }: QrScannerProps) => {
  const { t } = useTranslation();
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraInitializing, setIsCameraInitializing] = useState(true); // Track initial camera load

  const handleScanResult = useCallback((result: any, error: any) => {
    if (isCameraInitializing && !error) {
      setIsCameraInitializing(false); // Camera is ready if no error on first result
    }

    if (result) {
      onScan(result.text);
      setCameraError(null); // Clear any previous camera errors on successful scan
    }

    if (error) {
      console.error("QR Scan Error:", error);
      setIsCameraInitializing(false); // Stop initializing on error
      if (error.name === "NotAllowedError") {
        setCameraError(t("cameraPermissionDenied"));
      } else if (error.name === "NotFoundError") {
        setCameraError(t("noCameraFound"));
      } else if (error.name === "NotReadableError") {
        setCameraError(t("cameraInUse"));
      } else if (error.name === "OverconstrainedError") {
        setCameraError(t("cameraConstraintsError"));
      } else if (error.name === "AbortError") {
        setCameraError(t("cameraAborted"));
      } else {
        setCameraError(t("genericCameraError"));
      }
    } else if (!result && !isCameraInitializing) {
      // If no result and no error, and not initializing, it means it's actively scanning but found nothing yet.
      // We don't need to set an error here, just ensure previous errors are cleared if camera recovers.
      setCameraError(null);
    }
  }, [onScan, isCameraInitializing, t]);

  const handleClose = useCallback(() => {
    setCameraError(null); // Clear error when closing
    setIsCameraInitializing(true); // Reset for next open
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
          {(isCameraInitializing && !cameraError) ? (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
              <Loader2 className="h-8 w-8 animate-spin mr-2" /> {t("loadingCamera")}
            </div>
          ) : cameraError ? (
            <Alert variant="destructive" className="m-4">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>{t("cameraError")}</AlertTitle>
              <AlertDescription>{cameraError}</AlertDescription>
            </Alert>
          ) : (
            <QrReader
              onResult={handleScanResult}
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