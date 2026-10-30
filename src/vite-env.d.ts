/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (options: {
          client_id: string;
          callback: (response: { credential: string }) => void;
        }) => void;
        renderButton: (
          element: HTMLElement,
          options: {
            theme: "outline";
            size: "large";
            text: "continue_with";
            shape: "rectangular";
            width: number;
          },
        ) => void;
      };
    };
  };
}
