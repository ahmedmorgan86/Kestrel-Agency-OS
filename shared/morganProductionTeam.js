const CORE = [
  { code: 'research', name: 'نورا خليل', title: 'بحث الاتجاهات والمصادر' },
  { code: 'strategy', name: 'ياسر عبدالله', title: 'صياغة استراتيجية المحتوى' },
  { code: 'writing', name: 'مازن حسن', title: 'كتابة النص والسيناريو' },
  { code: 'creative', name: 'آدم زيدان', title: 'التصور البصري وقائمة اللقطات' },
  { code: 'qa', name: 'فادي منير', title: 'مراجعة الجودة قبل تسليم المالك' },
];

const VIDEO = [
  { code: 'editing', name: 'هشام رأفت', title: 'خطة المونتاج والإيقاع' },
  { code: 'audio', name: 'لمى سعيد', title: 'توجيه الصوت والترجمة وإمكانية الوصول' },
];
const VISUAL_ASSETS = { code: 'assets', name: 'جنى فوزي', title: 'تجهيز الأصول والتخطيط البصري' };
const FACT_CHECK = { code: 'fact_check', name: 'هدى بكر', title: 'تدقيق الادعاءات والسياسات للمجالات الحساسة' };
const PLATFORM_ADAPTATION = { code: 'adaptation', name: 'روان عثمان', title: 'تكييف الحزمة للمنصة' };

export function selectMorganProductionTeam({ niche = '', platform = '', format = '' } = {}) {
  const team = [...CORE];
  const formatText = String(format).toLowerCase();
  const platformText = String(platform).toLowerCase();
  const nicheText = String(niche).toLowerCase();
  if (/video|reel|short|فيديو|ريل|مقطع/.test(formatText)) team.push(...VIDEO);
  else if (/carousel|graphic|image|static|كاروسيل|صور|صورة|انفوجرافيك|إنفوجرافيك/.test(formatText)) team.push(VISUAL_ASSETS);
  if (/طب|طبي|صحي|دواء|علاج|قانون|قانوني|مالي|تمويل|استثمار|بنك|أمن سيبراني|صحة|medical|health|legal|finance|financial|investment|banking|cybersecurity/.test(nicheText)) team.push(FACT_CHECK);
  if (/multi|multiple|عدة منصات|كل المنصات|متعدد/.test(platformText)) team.push(PLATFORM_ADAPTATION);
  return team;
}

export const MORGAN_PRODUCTION_CORE_TEAM = CORE;
