'use client';

/**
 * 音声案内ユーティリティ（CLAUDE.md 5章）。
 *
 * ブラウザ標準の Web Speech API (speechSynthesis) のみを使用し、
 * 外部 API へは一切依存しない。言語は ja-JP 固定。
 *
 * 読み上げ内容に個人情報・認証トークンを渡してはならない。
 */

/** 音声案内の発生タイミング */
export type SpeechEvent =
  /** ユーザーへの質問・ヒアリングが発生したとき */
  | 'interview'
  /** セキュリティ保護のための再認証ダイアログを表示したとき */
  | 'reauth'
  /** 設定保存・書籍追加・カレンダー登録などの主要処理が正常終了したとき */
  | 'complete'
  /** 処理が失敗したとき */
  | 'error';

/** タイミングごとの既定メッセージ */
export const SPEECH_MESSAGES: Readonly<Record<SpeechEvent, string>> = {
  interview: '確認事項があります。画面の質問をご確認ください。',
  reauth: 'パスワードの再認証が必要です。',
  complete: '処理が完了しました。',
  error: '処理に失敗しました。画面の内容をご確認ください。',
};

const LANG = 'ja-JP';

/** この環境で音声合成を利用できるか */
export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 日本語の音声を選択する。
 * 利用可能な音声一覧は非同期に読み込まれるため、未取得なら null を返し
 * ブラウザ既定の音声に委ねる。
 */
function pickJapaneseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((voice) => voice.lang.replace('_', '-') === LANG) ?? null;
}

export interface SpeakOptions {
  /** 読み上げ速度 (0.1〜10)。既定は 1.0 */
  rate?: number;
  /** 音の高さ (0〜2)。既定は 1.0 */
  pitch?: number;
  /** 音量 (0〜1)。既定は 1.0 */
  volume?: number;
  /** 読み上げ中の発話をキャンセルしてから再生する。既定は true */
  interrupt?: boolean;
}

/**
 * 任意のテキストを日本語で読み上げる。
 * 非対応環境や失敗時は何もせず false を返し、呼び出し元の処理を妨げない。
 */
export function speak(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSupported() || text.trim().length === 0) {
    return false;
  }

  const {
    rate = 1.0,
    pitch = 1.0,
    volume = 1.0,
    interrupt = true,
  } = options;

  try {
    const synth = window.speechSynthesis;
    if (interrupt) {
      synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    const voice = pickJapaneseVoice();
    if (voice) {
      utterance.voice = voice;
    }

    synth.speak(utterance);
    return true;
  } catch {
    // 音声案内は補助機能のため、失敗しても本体の処理は継続する
    return false;
  }
}

/** 定義済みイベントの案内を読み上げる。message で文言を上書きできる */
export function speakEvent(event: SpeechEvent, message?: string): boolean {
  return speak(message ?? SPEECH_MESSAGES[event]);
}

/** ヒアリング発生時の案内 */
export function speakInterview(message?: string): boolean {
  return speakEvent('interview', message);
}

/** 再認証ダイアログ表示時の案内 */
export function speakReauth(message?: string): boolean {
  return speakEvent('reauth', message);
}

/** 主要処理の正常終了時の案内 */
export function speakComplete(message?: string): boolean {
  return speakEvent('complete', message);
}

/** 処理失敗時の案内 */
export function speakError(message?: string): boolean {
  return speakEvent('error', message);
}

/** 読み上げを停止する */
export function cancelSpeech(): void {
  if (isSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}
