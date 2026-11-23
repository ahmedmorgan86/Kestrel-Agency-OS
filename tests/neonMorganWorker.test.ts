import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMorganProductionPack } from '../server/services/neonMorganWorker';
import type { TrendSource } from '../server/services/morganProduction';

const source: TrendSource = {
  id: 'source_1',
  title: 'اتجاه حديث في التعليم الرقمي',
  url: 'https://news.google.com/rss/articles/example',
  publisher: 'مصدر تعليمي',
  publishedAt: '2026-11-23T10:00:00.000Z',
  snippet: 'تقرير حديث عن أدوات التعلم.',
};

test('Neon production completes separate specialist stages and hands each result forward', async () => {
  const strategy = { contentAngle: 'زاوية تعليمية', audienceInsight: 'طلاب يبحثون عن أمثلة عملية' };
  const content = { title: 'عنوان عربي', caption: 'نص عربي واضح', hashtags: ['#تعليم'], factsToVerify: ['رقم يحتاج مراجعة'] };
  const creative = { visualDirection: 'تصوير شاشة مع شرح', storyboard: [{ number: 1, description: 'عرض المثال' }], onScreenText: ['ابدأ بالتجربة'], assetChecklist: ['لقطة شاشة'] };
  const edit = { editPlan: 'مونتاج بإيقاع واضح' };
  const audio = { voiceoverDirection: 'صوت واضح وترجمة متزامنة' };
  const qa = { readyForOwner: true, languageIssues: [], unsupportedClaims: [], policyRisks: [], recommendations: [] };
  const outputs = [strategy, content, creative, edit, audio, qa];
  const trace: string[] = [];
  const prompts: string[] = [];

  const pack = await buildMorganProductionPack(
    { niche: 'التعليم الرقمي', audience: 'طلاب الجامعات', platform: 'instagram', format: 'reel', review_note: 'اختصر المقدمة' },
    [source],
    {
      startTask: async (employee) => { trace.push(`start:${employee}`); },
      saveTask: async (employee, result) => {
        trace.push(`save:${employee}`);
        assert.ok(result && typeof result === 'object');
      },
      generate: async (_system, prompt) => {
        prompts.push(prompt);
        trace.push(`generate:${prompts.length}`);
        const output = outputs.shift();
        assert.ok(output);
        return output;
      },
    },
  );

  assert.deepEqual(trace, [
    'start:ياسر عبدالله', 'generate:1', 'save:ياسر عبدالله',
    'start:مازن حسن', 'generate:2', 'save:مازن حسن',
    'start:آدم زيدان', 'generate:3', 'save:آدم زيدان',
    'start:هشام رأفت', 'generate:4', 'save:هشام رأفت',
    'start:لمى سعيد', 'generate:5', 'save:لمى سعيد',
    'start:فادي منير', 'generate:6', 'save:فادي منير',
  ]);
  assert.match(prompts[0], /التعليم الرقمي/);
  assert.match(prompts[1], /زاوية تعليمية/);
  assert.match(prompts[1], /اختصر المقدمة/);
  assert.match(prompts[2], /نص عربي واضح/);
  assert.match(prompts[5], /لقطة شاشة/);
  assert.equal((pack.content as Record<string, unknown>).title, 'عنوان عربي');
  assert.deepEqual(pack.content.hashtags, ['#تعليم']);
  assert.equal(pack.qualityReview.readyForOwner, true);
});

test('Neon production stops before creative work when the writer returns an incomplete draft', async () => {
  const started: string[] = [];
  let generation = 0;

  await assert.rejects(() => buildMorganProductionPack(
    { niche: 'تعليم البرمجة', platform: 'youtube', format: 'short_video' },
    [source],
    {
      startTask: async (employee) => { started.push(employee); },
      saveTask: async () => undefined,
      generate: async () => {
        generation += 1;
        return generation === 1 ? { contentAngle: 'تعليم عملي' } : { title: '', caption: '' };
      },
    },
  ), /لم ينتج عنواناً ونصاً صالحين/);

  assert.deepEqual(started, ['ياسر عبدالله', 'مازن حسن']);
  assert.equal(generation, 2);
});

test('Neon production retries malformed truncated local JSON once with a shorter prompt', async () => {
  const prompts: string[] = [];
  let generation = 0;
  const outputs = [
    { contentAngle: 'زاوية تعليمية', audienceInsight: 'طلاب الجامعات' },
    { title: 'عنوان عربي', caption: 'شرح واضح', hashtags: [], factsToVerify: [] },
    { visualDirection: 'تصوير توضيحي', storyboard: [], onScreenText: [], assetChecklist: [] },
    { editPlan: 'قطع سريع' },
    { voiceoverDirection: 'واضح' },
    { readyForOwner: true, languageIssues: [], unsupportedClaims: [], policyRisks: [], recommendations: [] },
  ];
  const pack = await buildMorganProductionPack(
    { niche: 'التعليم الرقمي', platform: 'instagram', format: 'reel' }, [source],
    {
      startTask: async () => undefined,
      saveTask: async () => undefined,
      generate: async (_system, prompt) => {
        prompts.push(prompt);
        generation += 1;
        if (generation === 1) throw new Error('Unterminated string in JSON at position 1566.');
        return outputs.shift()!;
      },
    },
  );
  assert.equal(generation, 7);
  assert.match(prompts[1], /موجزة جداً وصالحة/);
  assert.equal(pack.qualityReview.readyForOwner, true);
});

test('production team size follows format, risk, and platform scope', async () => {
  const { selectMorganProductionTeam } = await import('../shared/morganProductionTeam.js');
  assert.equal(selectMorganProductionTeam({ niche: 'تعليم', platform: 'instagram', format: 'post' }).length, 5);
  assert.equal(selectMorganProductionTeam({ niche: 'تعليم', platform: 'instagram', format: 'reel' }).length, 7);
  assert.equal(selectMorganProductionTeam({ niche: 'صحة وطب', platform: 'multi', format: 'carousel' }).length, 8);
});
