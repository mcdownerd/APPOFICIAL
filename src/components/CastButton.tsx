"use client";

import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { MonitorIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showError, showSuccess } from '@/utils/toast'; // Importar toasts

// Substitua 'SEU_APP_ID_DO_GOOGLE_CAST' pelo ID do seu aplicativo Receiver do Google Cast Developer Console.
// Exemplo: 'C08000000' para o Default Media Receiver, mas você precisará do seu Custom Receiver ID.
const CAST_APP_ID = 'SEU_APP_ID_DO_GOOGLE_CAST'; 
const CAST_NAMESPACE = 'urn:x-cast:com.deliveryflow.cast'; // Namespace para comunicação personalizada

interface CastButtonProps {
  contentUrl: string; // A URL do conteúdo que será transmitido (ex: /ecra-estafeta)
}

const CastButton: React.FC<CastButtonProps> = ({ contentUrl }) => {
  const { t } = useTranslation();
  const [isCastAvailable, setIsCastAvailable] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [currentSession, setCurrentSession] = useState<chrome.cast.Session | null>(null);

  useEffect(() => {
    const initializeCast = () => {
      if (window.chrome && window.chrome.cast) {
        const sessionRequest = new window.chrome.cast.SessionRequest(CAST_APP_ID);
        const apiConfig = new window.chrome.cast.ApiConfig(
          sessionRequest,
          (session) => { // Listener de sessão iniciada
            console.log('Cast session started:', session);
            setCurrentSession(session);
            setIsCasting(true);
            showSuccess(t('castStarted'));
          },
          (e) => { // Listener de erro
            console.error('Cast error:', e);
            setIsCasting(false);
            setCurrentSession(null);
            showError(t('castError'));
          },
          window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          window.chrome.cast.DefaultActionPolicy.CREATE_SESSION
        );

        window.chrome.cast.initialize(apiConfig, () => {
          console.log('Cast initialized successfully.');
          setIsCastAvailable(true);
        }, (e) => {
          console.error('Cast initialization error:', e);
          setIsCastAvailable(false);
          showError(t('castInitFailed'));
        });
      } else {
        console.warn('Google Cast SDK not available.');
        setIsCastAvailable(false);
      }
    };

    // O Google Cast SDK carrega assincronamente e chama esta função quando está pronto.
    // Se já estiver disponível, inicializa diretamente.
    if (window.chrome && window.chrome.cast && window.chrome.cast.isAvailable) {
      initializeCast();
    } else {
      window.__onGCastApiAvailable = (isAvailable) => {
        if (isAvailable) {
          initializeCast();
        } else {
          console.warn('Google Cast API not available.');
          setIsCastAvailable(false);
        }
      };
    }

    // Listener para quando a sessão de cast termina
    const sessionListener = (session: chrome.cast.Session) => {
      session.addUpdateListener((isAlive) => {
        if (!isAlive) {
          console.log('Cast session ended.');
          setIsCasting(false);
          setCurrentSession(null);
          showSuccess(t('castEnded'));
        }
      });
    };
    window.chrome?.cast?.addReceiverActionListener(sessionListener);

    return () => {
      // Limpeza de listeners se necessário
      window.chrome?.cast?.removeReceiverActionListener(sessionListener);
    };
  }, [t]);

  const handleCastClick = () => {
    if (!isCastAvailable) {
      showError(t('castNotAvailable'));
      return;
    }

    if (isCasting && currentSession) {
      // Se já estiver transmitindo, parar a sessão
      currentSession.stop(() => {
        console.log('Session stopped.');
        setIsCasting(false);
        setCurrentSession(null);
        showSuccess(t('castStopped'));
      }, (e) => {
        console.error('Error stopping session:', e);
        showError(t('castStopError'));
      });
      return;
    }

    // Iniciar nova sessão
    window.chrome.cast.requestSession((session) => {
      console.log('Session established:', session);
      setCurrentSession(session);
      setIsCasting(true);
      showSuccess(t('castStarted'));

      // Enviar a URL do conteúdo para o Receiver
      const message = {
        type: 'LOAD_URL',
        url: window.location.origin + contentUrl, // Envia a URL completa do seu app
      };
      session.sendMessage(CAST_NAMESPACE, message,
        () => console.log('Message sent to receiver:', message),
        (e) => {
          console.error('Error sending message to receiver:', e);
          showError(t('castSendMessageError'));
        }
      );
    }, (e) => {
      console.error('Request session error:', e);
      setIsCasting(false);
      setCurrentSession(null);
      showError(t('castRequestSessionError'));
    });
  };

  return (
    <Button 
      onClick={handleCastClick} 
      disabled={!isCastAvailable}
      className={isCasting ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}
    >
      <MonitorIcon className="mr-2 h-4 w-4" /> 
      {isCasting ? t('stopCasting') : t('transmitToTV')}
    </Button>
  );
};

export default CastButton;