'use strict';

const MOCK_FULL_PAYLOAD = Object.freeze({
  domain: 'task', action: 'start', prompt: 'hello test_6.txt 这是什么',
  promptContentBlocks: [
    { type: 'text', text: 'hello ' },
    { type: 'resource_link', name: 'test_6.txt', uri: 'tdoc://CmoWtNrGBNrI', title: 'test_6.txt', _meta: { mentionType: 'tencent-doc', type: 'tencent-doc', displayAsContext: false, displayAsPhrase: true, icon: { url: 'https://docs.qq.com/favicon.ico', alt: 'test_6.txt' }, description: '', fileId: 'CmoWtNrGBNrI', fileType: 'DRIVE', fileExt: 'txt', displayText: 'test_6.txt', timestamp: 1749653138048 } },
    { type: 'text', text: ' 这是什么' },
  ],
  cwd: '/Users/forrestfli/WorkBuddy', skills: ['agent-browser', 'pdf'], connectorIds: ['tencent-docs', 'lexiang'], model: 'claude-opus-4.6', mode: 'craft', welcomeMode: 'coding', permissionMode: 'default',
});
const MOCK_TEXT_PAYLOAD = Object.freeze({ domain: 'task', action: 'start', prompt: '帮我写一个快速排序' });

class MockDeeplinkRepo {
  async resolveTaskPayload(payloadId) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    switch (payloadId) {
      case 'mock-expired': return { ok: false, reason: 'expired', message: '短连接已过期' };
      case 'mock-forbidden': return { ok: false, reason: 'forbidden', message: '无权访问该短连接' };
      case 'mock-notfound': return { ok: false, reason: 'not-found', message: '短连接不存在' };
      case 'mock-text': return { ok: true, value: { ...MOCK_TEXT_PAYLOAD } };
      default: return { ok: true, value: { ...MOCK_FULL_PAYLOAD, promptContentBlocks: MOCK_FULL_PAYLOAD.promptContentBlocks.map((block) => ({ ...block, _meta: block._meta ? { ...block._meta, icon: block._meta.icon ? { ...block._meta.icon } : undefined } : undefined })) } };
    }
  }
}

module.exports = { MOCK_FULL_PAYLOAD, MOCK_TEXT_PAYLOAD, MockDeeplinkRepo };
