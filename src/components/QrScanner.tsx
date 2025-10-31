"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
  const [isCameraReady, setIsCameraReady] = useState(false); // New state to track if camera stream is active

  // Ref to hold the timeout ID
  const cameraTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraInitializedRef = useRef(false); // To track if camera has attempted to initialize

  useEffect(() => {
    if (isOpen) {
      setCameraError(null);
      setIsCameraReady(false); // Reset camera ready state
      cameraInitializedRef.current = false; // Reset initialization flag
      
      // Set a timeout to assume generic error if camera doesn't become ready in 10 seconds
      cameraTimeoutRef.current = setTimeout(() => {
        if (!isCameraReady && !cameraError && !cameraInitializedRef.current) { // Only set generic error if not ready, no specific error, and no initialization attempt
          setCameraError(t("genericCameraError"));
          console.log("QR Scanner: Timeout reached, setting generic camera error.");
        }
      }, 10000); // 10 seconds timeout

      return () => {
        if (cameraTimeoutRef.current) {
          clearTimeout(cameraTimeoutRef.current);
          cameraTimeoutRef.current = null;
        }
      };
    } else {
      // When dialog closes, clear any pending timeout
      if (cameraTimeoutRef.current) {
        clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }
    }
  }, [isOpen, isCameraReady, cameraError, t]);

  const handleScanResult = useCallback((result: any, error: any) => {
    console.log("QR Scanner: handleScanResult called. Result:", result, "Error:", error);
    cameraInitializedRef.current = true; // Mark that camera initialization has been attempted

    if (error) {
      // Clear the timeout as we've received an error
      if (cameraTimeoutRef.current) {
        clearTimeout(cameraTimeoutRef.current);
        cameraTimeoutRef.current = null;
      }

      // Set specific error message based on error type
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
      setIsCameraReady(false); // Camera is not ready if there's a media error
    } else if (result) {
      // If we get a result, it means the camera stream is active and scanning.
      // Set camera ready state if not already set.
      if (!isCameraReady) {
        setIsCameraReady(true);
        // Clear the timeout as the camera is now ready
        if (cameraTimeoutRef.current) {
          clearTimeout(cameraTimeoutRef.current);
          cameraTimeoutRef.current = null;
        }
        console.log("QR Scanner: Camera is now ready, clearing timeout.");
      }
      onScan(result.text);
      setCameraError(null); // Clear any previous camera errors on successful scan
    }
    // If no result and no error, it means the camera is still trying to initialize or waiting for a scan.
    // The timeout will handle the case where it never becomes ready.
  }, [onScan, isCameraReady, t]);

  const handleClose = useCallback(() => {
    setCameraError(null);
    setIsCameraReady(false); // Reset for next open
    cameraInitializedRef.current = false; // Reset initialization flag
    if (cameraTimeoutRef.current) {
      clearTimeout(cameraTimeoutRef.current);
      cameraTimeoutRef.current = null;
    }
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
          {(!isCameraReady && !cameraError) ? ( // Show loading if not ready and no error
            <div className="absolute inset-0 flex items-center justify-center bg-gray-800 bg-opacity-75 text-white">
              <Loader2 className="h-8 w-8 animate-spin mr-2" /> {t("loadingCamera")}
            </div>
          ) : cameraError ? ( // Show error if there's a camera error
            <Alert variant="destructive" className="m-4">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>{t("cameraError")}</AlertTitle>
              <AlertDescription>{cameraError}</AlertDescription>
            </Alert>
          ) : ( // Otherwise, render QrReader
            <QrReader
              key={isOpen ? "qr-reader-active" : "qr-reader-inactive"} // Force re-mount
              onResult={handleScanResult}
              constraints={{ facingMode: 'environment' }} // Preferir câmara traseira
              scanDelay={500} // Atraso entre digitalizações para evitar múltiplas leituras
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