import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type {
  DialogConversationInputMode,
  DialogEngineEvent,
  DialogEventTextMode,
  DialogEngineListener,
  DialogEngineProvider,
  DialogPrepareConfig,
  DialogStartConversationConfig,
  DialogTtsChunk,
} from './types';

const MODULE_NAME = 'RNDialogEngine';
const EVENT_NAME = 'RNDialogEngineEvent';
const DEFAULT_RESOURCE_ID = 'volc.speech.dialog';
const DEFAULT_APP_KEY = 'PlgvMymc7f3tQnJ6';
const DEFAULT_UID = 'my-doubao2-android';

type NativeDialogEngineModule = {
  prepare(options: Record<string, unknown>): Promise<void>;
  startConversation(options: Record<string, unknown>): Promise<void>;
  stopConversation(): Promise<void>;
  pauseTalking(): Promise<void>;
  resumeTalking(): Promise<void>;
  interruptCurrentDialog(): Promise<void>;
  sendTextQuery(payload: string): Promise<void>;
  useClientTriggeredTts(): Promise<void>;
  useServerTriggeredTts(): Promise<void>;
  streamClientTtsText(payload: Record<string, unknown>): Promise<void>;
  destroy(): Promise<void>;
  addListener?(eventName: string): void;
  removeListeners?(count: number): void;
};

type AndroidDialogEngineProviderConfig = DialogPrepareConfig;

function parseWsUrl(wsUrl: string): { address: string; uri: string } {
  const parsed = new URL(wsUrl);
  const address = `${parsed.protocol}//${parsed.host}`;
  const uri = `${parsed.pathname}${parsed.search}` || '/';
  return { address, uri };
}

function normalizeTextMode(value: unknown): DialogEventTextMode | undefined {
  if (value === 'none' || value === 'delta' || value === 'aggregate' || value === 'final_from_last_partial') {
    return value;
  }
  return undefined;
}

function normalizeInputMode(value: unknown): DialogConversationInputMode | undefined {
  return value === 'audio' || value === 'text' ? value : undefined;
}

function buildBaseEvent(event: Record<string, unknown>) {
  return {
    sessionId: typeof event.sessionId === 'string' ? event.sessionId : undefined,
    raw: typeof event.raw === 'string' ? event.raw : undefined,
    nativeMessageType:
      typeof event.nativeMessageType === 'string'
        ? event.nativeMessageType
        : typeof event.nativeMessageType === 'number'
        ? String(event.nativeMessageType)
        : undefined,
    dialogWorkMode:
      event.dialogWorkMode === 'default' || event.dialogWorkMode === 'delegate_chat_tts_text'
        ? event.dialogWorkMode
        : undefined,
    inputMode: normalizeInputMode(event.inputMode),
    textMode: normalizeTextMode(event.textMode),
    directiveName: typeof event.directiveName === 'string' ? event.directiveName : undefined,
    directiveRet: typeof event.directiveRet === 'number' ? event.directiveRet : undefined,
    dialogId: typeof event.dialogId === 'string' ? event.dialogId : undefined,
    turnIndex: typeof event.turnIndex === 'number' ? event.turnIndex : undefined,
  } as const;
}

export function normalizeNativeEvent(event: Record<string, unknown>): DialogEngineEvent | null {
  const type = typeof event.type === 'string' ? event.type : '';
  const base = buildBaseEvent(event);
  switch (type) {
    case 'engine_start':
      return {
        type,
        ...base,
      };
    case 'session_ready':
      return {
        type,
        ...base,
      };
    case 'engine_stop':
      return {
        type,
        ...base,
      };
    case 'asr_start':
      return {
        type,
        ...base,
      };
    case 'asr_partial':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'asr_final':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'chat_partial':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'chat_final':
      return {
        type,
        ...base,
        text: typeof event.text === 'string' ? event.text : '',
      };
    case 'error':
      return {
        type,
        ...base,
        errorCode: typeof event.errorCode === 'number' ? event.errorCode : undefined,
        errorMessage: typeof event.errorMessage === 'string' ? event.errorMessage : undefined,
      };
    default:
      return null;
  }
}

export class AndroidDialogEngineProvider implements DialogEngineProvider {
  private readonly nativeModule: NativeDialogEngineModule | null;
  private readonly emitter: NativeEventEmitter | null;
  private listener: DialogEngineListener | null = null;
  private eventSubscription: { remove(): void } | null = null;
  private prepared = false;

  constructor(private readonly config: AndroidDialogEngineProviderConfig) {
    const candidate = (NativeModules as Record<string, unknown>)[MODULE_NAME] as NativeDialogEngineModule | undefined;
    this.nativeModule = Platform.OS === 'android' ? candidate ?? null : null;
    this.emitter = this.nativeModule ? new NativeEventEmitter(this.nativeModule as never) : null;
  }

  isSupported(): boolean {
    return Platform.OS === 'android' && Boolean(this.nativeModule);
  }

  async prepare(config?: Partial<DialogPrepareConfig>): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    if (this.prepared && !config) {
      return;
    }
    const merged = {
      ...this.config,
      ...config,
    };
    const { address, uri } = parseWsUrl(merged.wsUrl);
    await this.nativeModule.prepare({
      appId: merged.appId,
      appKey: merged.appKey || DEFAULT_APP_KEY,
      accessToken: merged.accessToken,
      dialogWorkMode: merged.dialogWorkMode ?? 'default',
      resourceId: merged.resourceId || DEFAULT_RESOURCE_ID,
      address,
      uri,
      uid: merged.uid || DEFAULT_UID,
      enableAec: merged.enableAec ?? true,
      requestHeaders: merged.requestHeaders ?? {},
    });
    this.prepared = true;
  }

  async startConversation(config: DialogStartConversationConfig): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.prepare();
    await this.nativeModule.startConversation(config as unknown as Record<string, unknown>);
  }

  async stopConversation(): Promise<void> {
    await this.nativeModule?.stopConversation();
  }

  async pauseTalking(): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.pauseTalking();
  }

  async resumeTalking(): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.resumeTalking();
  }

  async interruptCurrentDialog(): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.interruptCurrentDialog();
  }

  async sendTextQuery(text: string): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.sendTextQuery(text);
  }

  async useClientTriggeredTts(): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.useClientTriggeredTts();
  }

  async useServerTriggeredTts(): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.useServerTriggeredTts();
  }

  async streamClientTtsText(chunk: DialogTtsChunk): Promise<void> {
    if (!this.nativeModule) {
      throw new Error('Dialog SDK native module is unavailable on this platform');
    }
    await this.nativeModule.streamClientTtsText(chunk as unknown as Record<string, unknown>);
  }

  setListener(listener: DialogEngineListener | null): void {
    this.listener = listener;
    if (!this.emitter) {
      return;
    }
    this.eventSubscription?.remove();
    this.eventSubscription = null;
    if (!listener) {
      return;
    }
    this.eventSubscription = this.emitter.addListener(EVENT_NAME, (payload: Record<string, unknown>) => {
      const event = normalizeNativeEvent(payload);
      if (event) {
        this.listener?.(event);
      }
    });
  }

  async destroy(): Promise<void> {
    this.eventSubscription?.remove();
    this.eventSubscription = null;
    this.listener = null;
    if (this.nativeModule) {
      await this.nativeModule.destroy();
    }
    this.prepared = false;
  }
}
