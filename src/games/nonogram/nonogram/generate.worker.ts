import { generate, type Level, type Size } from './generate';

/** 큰 판의 최상 문제는 1~2초 걸릴 수 있어 화면이 멈추지 않게 따로 돌린다 */
self.onmessage = (e: MessageEvent<{ size: Size; level: Level }>) => {
  self.postMessage(generate(e.data.size, e.data.level));
};
