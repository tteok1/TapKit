# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: P04-03.memory.spec.ts >> P04-03 T10 answer used memories, session switches and temporary mode have truthful scope UI
- Location: tests\e2e\P04-03.memory.spec.ts:182:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('.chat-message.assistant').last()
Expected substring: "未采用可用"
Received string:    "TapKitopenai-compatible · fixture-model · 16:43:13 · 已发送展开或收起长回复隔离测试回复：再次用中文回答喜欢：简短中文回答 管理记忆用当前选定模型重新回答从此消息分叉会话保存为 Markdown 笔记本地反馈 / 举报选区操作翻译解释扩写缩写改写删除消息"
Timeout: 15000ms

Call log:
  - Expect "toContainText" locator('.chat-message.assistant').last() with timeout 15000ms
  - waiting for locator('.chat-message.assistant').last()
    33 × locator resolved to <article class="chat-message assistant" id="message-01a15da0-f9e9-754e-afe2-5ad8b0c960aa">…</article>
       - unexpected value "TapKitopenai-compatible · fixture-model · 16:43:13 · 已发送展开或收起长回复隔离测试回复：再次用中文回答喜欢：简短中文回答 管理记忆用当前选定模型重新回答从此消息分叉会话保存为 Markdown 笔记本地反馈 / 举报选区操作翻译解释扩写缩写改写删除消息"

```

```yaml
- article:
  - strong: TapKit
  - text: openai-compatible · fixture-model · 16:43:13 · 已发送
  - group:
    - paragraph: 隔离测试回复：再次用中文回答
  - button "使用的记忆与历史参考" [expanded]
  - region "使用的记忆与历史参考":
    - paragraph:
      - text: 喜欢：简短中文回答
      - link "管理记忆":
        - /url: /settings/personalization
  - button "重新生成回答"
  - button "点赞"
  - button "点踩"
  - button "收藏"
  - button "更多消息操作"
  - button "复制回复"
  - button "引用选区追问"
```

# Test source

```ts
  101 |   const profile = (bootstrap.data as { profile: { id: string } }).profile.id;
  102 |   const memories = (
  103 |     (await command('memory.list', { scope: { type: 'profile', id: profile } })) as {
  104 |       memories: MemoryView[];
  105 |     }
  106 |   ).memories;
  107 |   expect(memories).toHaveLength(1);
  108 |   expect(memories[0]!.sources).toHaveLength(0);
  109 | });
  110 | test.afterEach(async () => {
  111 |   await app?.close();
  112 |   app = undefined;
  113 | });
  114 | test('P04-03 T11 explicit post-write notice source correction undo conflict search deletion and restart', async () => {
  115 |   const sid = await create();
  116 |   await send('记住：我喜欢简短中文回答');
  117 |   await expect(page.locator('.chat-message.user')).toContainText('已更新记忆');
  118 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  119 |   await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  120 |   const manager = page.getByRole('region', { name: '记忆管理' });
  121 |   await expect(manager.locator('.memory-row')).toContainText('简短中文回答');
  122 |   await manager.getByRole('button', { name: '查看记忆来源' }).click();
  123 |   await expect(manager.getByRole('region', { name: '查看记忆来源' })).toContainText(
  124 |     '记住：我喜欢简短中文回答',
  125 |   );
  126 |   await manager.getByRole('button', { name: '编辑记忆', exact: true }).click();
  127 |   await manager.getByLabel('记忆内容').fill('详细英文回答');
  128 |   await manager.getByRole('button', { name: '保存纠正', exact: true }).click();
  129 |   await expect(manager.locator('.memory-row')).toContainText('详细英文回答');
  130 |   await manager.getByLabel('搜索记忆').fill('详细');
  131 |   await expect(manager.locator('.memory-row')).toHaveCount(1);
  132 |   await manager.screenshot({ path: 'docs/evidence/P04-03/memory-management.png' });
  133 |   await app!.close();
  134 |   app = undefined;
  135 |   await launch();
  136 |   const [restored] = await Promise.all([
  137 |     app!.waitForEvent('window'),
  138 |     page.evaluate(async (sid) => window.tapkit.openEntity({ type: 'session', id: sid }), sid),
  139 |   ]);
  140 |   page = restored;
  141 |   await expect(page.locator('.chat-surface')).toHaveAttribute('data-session-id', sid);
  142 |   await page.locator('.chat-message.user').getByRole('button', { name: '撤销记忆更新' }).click();
  143 |   await expect(page.locator('.chat-message.user').getByRole('alert')).toContainText('已有新修改');
  144 |   await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  145 |   const reopened = page.getByRole('region', { name: '记忆管理' });
  146 |   await expect(reopened.locator('.memory-row')).toContainText('详细英文回答');
  147 |   await reopened.getByRole('button', { name: '删除记忆', exact: true }).click();
  148 |   await expect(reopened.locator('.memory-row')).toHaveCount(0);
  149 |   await app!.close();
  150 |   app = undefined;
  151 |   await launch();
  152 |   const r = await page.evaluate(async (requestId) => window.tapkit.bootstrap({ requestId }), id());
  153 |   if (!r.ok) throw new Error('bootstrap');
  154 |   const profile = (r.data as { profile: { id: string } }).profile.id;
  155 |   expect(
  156 |     (
  157 |       (await command('memory.list', { scope: { type: 'profile', id: profile } })) as {
  158 |         memories: MemoryView[];
  159 |       }
  160 |     ).memories,
  161 |   ).toHaveLength(0);
  162 | });
  163 | test('P04-03 T11 two ordinary preferences auto-save after completion without approval and can clear all', async () => {
  164 |   await create();
  165 |   await send('我喜欢简短中文回答');
  166 |   await expect(page.locator('.chat-message.user')).not.toContainText('已更新记忆');
  167 |   await create();
  168 |   await send('我喜欢简短中文回答');
  169 |   await expect(page.locator('.chat-message.user')).toContainText('已更新记忆', { timeout: 15000 });
  170 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  171 |   await page.locator('.chat-message.user').getByRole('link', { name: '管理记忆' }).click();
  172 |   const manager = page.getByRole('region', { name: '记忆管理' });
  173 |   await expect(manager.locator('.memory-row')).toContainText('自动保存');
  174 |   await manager.screenshot({ path: 'docs/evidence/P04-03/automatic-memory.png' });
  175 |   await manager.getByRole('button', { name: '清除全部记忆', exact: true }).click();
  176 |   await manager
  177 |     .getByRole('dialog', { name: '确认清除' })
  178 |     .getByRole('button', { name: '确认清除' })
  179 |     .click();
  180 |   await expect(manager.locator('.memory-row')).toHaveCount(0);
  181 | });
  182 | test('P04-03 T10 answer used memories, session switches and temporary mode have truthful scope UI', async () => {
  183 |   await create();
  184 |   await send('记住：我喜欢简短中文回答');
  185 |   await send('请用中文回答');
  186 |   const answer = page.locator('.chat-message.assistant').last();
  187 |   await answer.getByRole('button', { name: '使用的记忆与历史参考', exact: true }).click();
  188 |   await expect(answer).toContainText('简短中文回答');
  189 |   await page.getByRole('button', { name: '记忆与历史范围', exact: true }).click();
  190 |   const policy = page.getByRole('region', { name: '记忆与历史范围' });
  191 |   await policy.getByLabel('使用与保存跨会话记忆').uncheck();
  192 |   await policy.getByLabel('参考历史会话').uncheck();
  193 |   await policy.getByRole('button', { name: '保存当前会话记忆设置' }).click();
  194 |   await expect(policy.getByRole('button', { name: '保存当前会话记忆设置' })).toBeEnabled();
  195 |   await send('再次用中文回答');
  196 |   await page
  197 |     .locator('.chat-message.assistant')
  198 |     .last()
  199 |     .getByRole('button', { name: '使用的记忆与历史参考', exact: true })
  200 |     .click();
> 201 |   await expect(page.locator('.chat-message.assistant').last()).toContainText('未采用可用');
      |                                                                ^ Error: expect(locator).toContainText(expected) failed
  202 |   await page.getByRole('button', { name: '临时聊天', exact: true }).click();
  203 |   await expect(page.locator('.memory-policy')).toContainText('临时聊天：不读取');
  204 |   await page.screenshot({ path: 'docs/evidence/P04-03/temporary-scope.png' });
  205 | });
  206 | 
```