"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface UseCameraAccessResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  isCameraAvailable: boolean;
  cameraAccessError: string | null;
  stream: MediaStream | null;
  stopCamera: () => void;
}

export function useCameraAccess(): UseCameraAccessResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);
  const [cameraAccessError, setCameraAccessError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setIsCameraAvailable(false);
      console.log("Camera stream stopped.");
    }
  }, [stream]);

  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      setCameraAccessError(null);
      setIsCameraAvailable(false);
      console.log("Attempting to start camera...");

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        currentStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(e => {
            console.error("Error playing video stream:", e);
            setCameraAccessError("Failed to play video stream.");
            setIsCameraAvailable(false);
          });
          setIsCameraAvailable(true);
          console.log("Camera started successfully.");
        }
      } catch (err: any) {
        console.error("Error accessing camera:", err);
        if (err.name === "NotAllowedError") {
          setCameraAccessError("Permissão da câmara negada. Por favor, conceda acesso nas configurações do navegador.");
        } else if (err.name === "NotFoundError") {
          setCameraAccessError("Nenhuma câmara encontrada. Verifique se uma câmara está conectada e funcional.");
        } else if (err.name === "NotReadableError") {
          setCameraAccessError("A câmara já está em uso por outra aplicação.");
        } else if (err.name === "OverconstrainedError") {
          setCameraAccessError("Erro de restrições da câmara. Tente novamente.");
        } else if (err.name === "AbortError") {
          setCameraAccessError("A operação da câmara foi abortada.");
        } else {
          setCameraAccessError("Ocorreu um erro inesperado na câmara.");
        }
        setIsCameraAvailable(false);
      }
    };

    startCamera();

    return () => {
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        console.log("Camera stream stopped on unmount.");
      }
    };
  }, []); // Empty dependency array to run once on mount

  return { videoRef, isCameraAvailable, cameraAccessError, stream, stopCamera };
}