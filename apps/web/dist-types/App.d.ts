export interface Status {
    setupState: 'uninitialized' | 'password_created' | 'llm_config_pending' | 'ready';
    locked: boolean;
    llmConfigured: boolean;
    llmSource: 'env' | 'ui' | 'none';
    model: string | null;
    serverTime: string;
    public: {
        llm: {
            provider: string;
            baseUrl: string;
            model: string;
            envKeyPresent: boolean;
        };
        limits: {
            maxImageBytes: number;
            maxImagePixels: number;
            maxBackupBytes: number;
        };
        sessionIdleMinutes: number;
    };
}
export declare function App(): import("react").JSX.Element;
