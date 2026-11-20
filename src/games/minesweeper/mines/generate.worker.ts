import { generate, type Level, type SizeId } from './generate';

/** 판 만들기는 수백 ms까지 걸릴 수 있어 화면이 멈추지 않게 따로 돌린다 */
self.onmessage = (e: MessageEvent<{ size: SizeId; level: Level }>) => {
  self.postMessage(generate(e.data.size, e.data.level));
};
