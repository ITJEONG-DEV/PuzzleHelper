import { generate, type Level, type Size } from './generate';

/** 문제 만들기는 수백 ms~몇 초 걸릴 수 있어 화면이 멈추지 않게 따로 돌린다 */
self.onmessage = (e: MessageEvent<{ size: Size; level: Level }>) => {
  self.postMessage(generate(e.data.size, e.data.level));
};
