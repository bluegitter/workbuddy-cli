'use strict';

const SKILL_AUGMENTATIONS = Object.freeze({
  'ardot-design-core': { aliases: ['画板设计基础', 'Ardot 设计核心', 'canvas design core'], extraDescription: 'Ardot 画板设计的基础规则集，承载画板 schema、编辑原则、标准工作流、视觉风格指南与复合特效。会与具体的 Ardot 子技能（UI 设计 / 幻灯片 / 海报 / 设计转代码）一起自动注入，单独使用无意义。不用于生成 PowerPoint .pptx 文件（那是 pptx 技能）。' },
  'ardot-design-router': { aliases: ['设计意图分发', 'Ardot 路由', 'design intent dispatcher'], extraDescription: 'Ardot 设计助手的入口分发器。当处于 Craft/设计模式但尚不确定具体交付物类型时，由它根据用户意图判定该走 UI 界面设计 / 幻灯片设计 / 海报设计 / 设计转代码中的哪一个，再加载对应的 Ardot 子技能 + ardot-design-core。不用于 PowerPoint .pptx 文件。' },
  'ardot-poster': { aliases: ['海报设计', '宣传海报', 'banner 设计', 'poster design', 'flyer'] },
  'ardot-slides': { aliases: ['幻灯片设计稿', 'PPT 设计稿', 'pitch deck design', 'keynote design'], extraDescription: '边界提醒：本技能负责「幻灯片/PPT 设计稿（Ardot 画板）」类需求。只有当用户明确要求导出 .pptx 文件或直接生成 PowerPoint 文件时，才让位给 pptx 技能。单独说「slides / 幻灯片 / PPT」并不触发 pptx。' },
  'ardot-ui-design': { aliases: ['UI 设计', '页面设计', '落地页设计', '设计系统', 'webapp design'] },
  '3D模型与视频特效': { aliases: ['3D model generation', 'text to 3D', 'image to 3D', 'video FX template'], extraDescription: 'Supports text-to-3D model, image-to-3D model, and template-based image/video effects (video-fx). Use this skill when the user wants AI to create a 3D model or apply a preset effect/animation template (e.g. hugging, transform, dust) to an image. It does NOT generate raw images (use ImageGen) or general videos (use VideoGen).' },
  'cloudstudio-deploy': { aliases: ['CloudStudio 部署', '云端预览', '静态站点部署', '发布站点拿可分享链接'], extraDescription: '把本地构建产物（如 dist/、build/、out/）部署到 CloudStudio 云端沙箱工作区，用于在线预览 Web 应用或发布静态站点并得到一个可分享的 URL。' },
  'expert-manager': { aliases: ['专家包运营', 'expert pack ops', 'convert to expert', 'review expert pack'] },
  'skill-creator': { aliases: ['创建技能', '编写技能', '技能开发指南', 'create skill'], extraDescription: '当用户希望为 WorkBuddy 创建一个新技能（skill），或者更新已有技能，以扩展其专业知识、工作流或工具集成时，使用本指南。包含技能的标准结构、撰写规范与最佳实践。' }
});
const PLUGIN_AUGMENTATIONS = Object.freeze({ weixinpay: { aliases: ['微信支付', '微信收款', 'wechat pay', 'wx pay'], extraDescription: 'Wokrbuudy 的微信支付（Weixin Pay / WeChat Pay）集成插件，用于在项目里快速接入微信支付能力：下单、回调、退款、对账等支付场景。' } });

function getCandidateAugmentation(kind, name) { return kind === 'skill' ? SKILL_AUGMENTATIONS[name] : kind === 'plugin' ? PLUGIN_AUGMENTATIONS[name] : undefined; }
function buildRecallText(kind, name, description, augmentation = getCandidateAugmentation(kind, name)) {
  const aliases = augmentation?.aliases?.length ? ` (aliases: ${augmentation.aliases.join(' / ')})` : '';
  return `${kind}: ${name}${aliases}\n${augmentation?.extraDescription ? `${description}\n${augmentation.extraDescription}` : description}`;
}

module.exports = Object.freeze({ SKILL_AUGMENTATIONS, PLUGIN_AUGMENTATIONS, getCandidateAugmentation, buildRecallText });
