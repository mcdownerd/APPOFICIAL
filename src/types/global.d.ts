// src/types/global.d.ts

// Declarações para o SDK do Google Cast
declare namespace chrome {
  namespace cast {
    interface Session {
      sendMessage(namespace: string, message: string | object, successCallback?: () => void, errorCallback?: (error: Error) => void): void;
      stop(successCallback?: () => void, errorCallback?: (error: Error) => void): void;
      addUpdateListener(listener: (isAlive: boolean) => void): void;
      removeUpdateListener(listener: (isAlive: boolean) => void): void;
    }

    interface SessionRequest {
      new(appId: string, capabilities?: Capability[], requestExtraData?: object): SessionRequest;
    }

    interface ApiConfig {
      new(sessionRequest: SessionRequest, sessionListener: (session: Session) => void, receiverListener: (receiverAvailability: ReceiverAvailability) => void, autoJoinPolicy: AutoJoinPolicy, defaultActionPolicy: DefaultActionPolicy): ApiConfig;
    }

    enum AutoJoinPolicy {
      ORIGIN_SCOPED,
      PAGE_SCOPED,
      TAB_AND_ORIGIN_SCOPED,
    }

    enum DefaultActionPolicy {
      CREATE_SESSION,
      CAST_THIS_TAB,
    }

    enum ReceiverAvailability {
      AVAILABLE,
      UNAVAILABLE,
    }

    enum Capability {
      VIDEO_OUT,
      AUDIO_OUT,
      MULTIZONE_GROUP,
    }

    function initialize(apiConfig: ApiConfig, successCallback?: () => void, errorCallback?: (error: Error) => void): void;
    function requestSession(successCallback: (session: Session) => void, errorCallback?: (error: Error) => void): void;
    function addReceiverActionListener(listener: (session: Session) => void): void;
    function removeReceiverActionListener(listener: (session: Session) => void): void;

    const isAvailable: boolean;
  }
}

interface Window {
  chrome?: {
    cast?: typeof chrome.cast;
  };
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
}