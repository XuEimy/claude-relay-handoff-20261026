import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { safeNext } from '../src/site-api.js';

test('return destinations stay within account routes', () => {
  for (const path of ['https://outside.example', '//outside.example', '/chat', '/accounting', '/\\outside.example']) {
    assert.equal(safeNext(path), '/account');
  }
  assert.equal(safeNext('/checkout?order=abc'), '/checkout?order=abc');
  assert.equal(safeNext('/billing?tab=orders#usage'), '/billing?tab=orders#usage');
});

test('portal pages render unavailable, unauthenticated and configured states', async t => {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  t.after(() => server.close());
  const originalLocation = globalThis.location;
  globalThis.location = { pathname: '/billing', search: '', hash: '' };
  t.after(() => { globalThis.location = originalLocation; });
  const pages = await server.ssrLoadModule('/src/SitePages.jsx');
  const config = {
    user: { id: 'test-user', name: '测试用户', email: 'user@example.test', role: 'user' },
    setup: false, registration: true, demo: false, models: [], supportEmail: '',
    payments: [{id:'alipay',name:'支付宝',enabled:false},{id:'wechat',name:'微信支付',enabled:false}],
  };
  const render = (name, props = {}) => renderToStaticMarkup(React.createElement(pages[name], { config, refresh: async () => {}, ...props }));
  for (const name of ['AccountPage','BillingPage','CheckoutPage','SettingsPage','ModelsPage','DownloadPage','GuidePage','SupportPage','PolicyPage','NotFoundPage']) {
    const html = render(name);
    assert.ok(html.includes('id="page-main"'), `${name} has a main landmark`);
    assert.ok(!html.includes('href="/chat"'), `${name} does not link to retired chat`);
  }
  const billing = render('BillingPage');
  assert.match(billing, /在线支付暂未开放/);
  assert.match(billing, /disabled=""[^>]*>.*?前往付款/s);
  assert.match(render('DownloadPage'), /disabled=""[^>]*>.*?macOS 版本准备中/s);
  assert.match(render('CheckoutPage'), /请先选择充值金额/);
  assert.match(render('ModelsPage'), /当前没有开放的模型/);
  const unavailable = render('AuthScreen', { config:{...config,user:null,setup:true} });
  assert.match(unavailable, /站点正在准备账户服务/);
  const register = render('AuthScreen', { register:true, config:{...config,user:null} });
  assert.match(register, /name="name"/);
  assert.match(register, /name="confirm"/);
  assert.match(register, /name="accepted"/);
  const models = render('ModelsPage', {config:{...config,models:[{id:'test',name:'已配置测试模型',input_rate:3,output_rate:9}]}});
  assert.match(models, /已配置测试模型/);
  assert.match(models, /¥3/);
});
