'use strict';
// 御风Work 本地补丁入口
// 职责：屏蔽运营活动类 macOS 系统横幅通知（积分/活动/加油站等），然后进入官方主进程。
// 升级官方产物时本文件不动，只需保持 package.json "main" 指向它。
const electron = require('electron');

const PROMO_RE = /(积分|活动|加油站|签到|折扣|加购|好礼|会员|限时|福利|抽奖)/;

const OrigNotification = electron.Notification;
if (OrigNotification && !OrigNotification.__wbPromoFilter) {
	const proto = OrigNotification.prototype;
	const origShow = proto.show;
	proto.show = function show() {
		try {
			const text = `${this.title || ''} ${this.body || ''}`;
			if (PROMO_RE.test(text)) {
				console.log('[wb-patches] suppressed promo notification:', this.title);
				return;
			}
		} catch {}
		return origShow.call(this);
	};
	OrigNotification.__wbPromoFilter = true;
}

require('./main/index.js');
